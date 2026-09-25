"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  DEFAULT_LOCATION,
  nearestSite,
  PRESETS,
  PROVIDERS,
  PROVIDER_IDS,
  type ProviderId,
  type Location,
} from "@/lib/starcloud/catalog";
import {
  isChatSuccessBody,
  type ChatSuccessBody,
} from "@/lib/starcloud/chat-types";
import { JOURNEY_MS } from "@/lib/starcloud/network";
import { type Flight } from "./orbital-scene";
import { InferenceComparison } from "./inference-comparison";
import { SourcesNote } from "./sources-note";
import { Modal } from "./modal";
const OrbitalScene = dynamic(
  () => import("./orbital-scene").then((m) => m.OrbitalScene),
  { ssr: false },
);
export function Simulator({ available }: { available: ProviderId[] }) {
  const [provider, setProvider] = useState<ProviderId>(
      available[0] ?? "gemini",
    ),
    [origin, setOrigin] = useState<Location>(DEFAULT_LOCATION),
    [focusId, setFocusId] = useState(0),
    [zoom, setZoom] = useState(0),
    [ready, setReady] = useState(false),
    [prompt, setPrompt] = useState(""),
    [submitted, setSubmitted] = useState(""),
    [flight, setFlight] = useState<Flight | null>(null),
    [elapsed, setElapsed] = useState(0),
    [answerReady, setAnswerReady] = useState(false),
    [result, setResult] = useState<ChatSuccessBody | null>(null),
    [results, setResults] = useState(false),
    [sources, setSources] = useState(false),
    [locations, setLocations] = useState(false),
    [error, setError] = useState(""),
    [joules, setJoules] = useState(1.11),
    [snapshotAt, setSnapshotAt] = useState(0);
  const request = useRef<AbortController | null>(null),
    active = useRef(false),
    textarea = useRef<HTMLTextAreaElement>(null);
  const site = nearestSite(provider, origin),
    live = available.includes(provider);
  const onReady = useCallback(() => setReady(true), []);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!flight) return;
    const id = setInterval(
      () => setElapsed(performance.now() - flight.started),
      100,
    );
    return () => clearInterval(id);
  }, [flight]);
  function cancel() {
    request.current?.abort();
    request.current = null;
    active.current = false;
    setFlight(null);
    setError(
      live
        ? "Request canceled. A provider may still bill work already started."
        : "Route preview canceled.",
    );
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (active.current || !prompt.trim()) return;
    active.current = true;
    const controller = new AbortController();
    request.current = controller;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const started = performance.now();
    setSubmitted(prompt.trim());
    setError("");
    setResult(null);
    setElapsed(0);
    setAnswerReady(false);
    const at = Date.now();
    setSnapshotAt(at);
    setFlight({ id: at, started, reduced });
    try {
      let answer: ChatSuccessBody | null = null;
      if (live) {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: prompt.trim(), provider }),
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(55000),
          ]),
        });
        const body = await response.json();
        if (!response.ok)
          throw new Error(
            typeof body.error === "string" ? body.error : "Request failed.",
          );
        if (!isChatSuccessBody(body) || body.provider !== provider)
          throw new Error("The provider returned an invalid result.");
        answer = body;
      }
      if (controller.signal.aborted) return;
      setAnswerReady(true);
      await new Promise<void>((resolve, reject) => {
        const wait = Math.max(
          0,
          (reduced ? 300 : JOURNEY_MS) - (performance.now() - started),
        );
        const timer = setTimeout(() => {
          controller.signal.removeEventListener("abort", abort);
          resolve();
        }, wait);
        const abort = () => {
          clearTimeout(timer);
          reject(new DOMException("Aborted", "AbortError"));
        };
        controller.signal.addEventListener("abort", abort, { once: true });
      });
      if (controller.signal.aborted) return;
      setResult(answer);
      setFlight(null);
      setResults(true);
    } catch (e) {
      if (!controller.signal.aborted) {
        setFlight(null);
        setError(
          e instanceof Error
            ? e.message
            : "The request failed. Please try again.",
        );
      }
    } finally {
      if (request.current === controller) {
        active.current = false;
        request.current = null;
      }
    }
  }
  const progress = flight?.reduced
    ? "Comparing the two paths"
    : elapsed < 1600
      ? "Leaving your location"
      : elapsed < 3500
        ? "Reaching the uplink gateway"
        : elapsed < 5400
          ? "Uplink to the orbital ring"
          : elapsed < 7800
            ? "Four laser hops to compute"
            : elapsed < 10100
              ? "Following the ground route"
              : elapsed < JOURNEY_MS
                ? "Bringing both paths together"
                : answerReady
                  ? "Your comparison is ready"
                  : "Waiting for the AI response";
  return (
    <main
      className={`simulator ${flight ? "in-flight" : ""} ${results || sources || locations ? "modal-open" : ""}`}
    >
      <OrbitalScene
        origin={origin}
        site={site}
        flight={flight}
        onLocation={setOrigin}
        focusId={focusId}
        zoom={zoom}
        onReady={onReady}
      />
      <header className="site-header">
        <Link href="/" className="wordmark" aria-label="Spacedata home">
          <span className="brand-orbit" />
          spacedata<span className="wordmark-dot">.</span>
        </Link>
        <button
          className="about-button"
          onClick={() => setSources(true)}
          disabled={Boolean(flight)}
        >
          About the experiment <span>↗</span>
        </button>
      </header>
      {!ready && (
        <div className="loading-scene" role="status">
          <span />
          Preparing your world
        </div>
      )}
      {flight ? (
        <section className="journey-status" aria-label="Request journey">
          <div className="journey-step">
            <span className="live-dot" />
            {live ? "LIVE REQUEST" : "ROUTE PREVIEW"}
            <span className="elapsed">{(elapsed / 1000).toFixed(1)} s</span>
          </div>
          <h1 aria-live="polite">{progress}</h1>
          <p>
            {live
              ? answerReady
                ? "AI response received · finishing the visual journey"
                : `${PROVIDERS[provider].name} is processing your message`
              : "Illustrative travel · no AI request or charge"}
          </p>
          <div className="journey-track">
            <span
              style={{
                width: `${Math.min(100, elapsed / (JOURNEY_MS / 100))}%`,
              }}
            />
          </div>
          <button className="text-button" onClick={cancel}>
            Cancel journey
          </button>
        </section>
      ) : (
        <section className="composer" aria-label="Send a prompt">
          <div className="composer-heading">
            <span className="eyebrow">EARTH, OR ORBIT?</span>
            <h1>
              Give your next thought
              <br className="mobile-break" /> a different path.
            </h1>
          </div>
          <form onSubmit={submit} className="prompt-glass">
            <textarea
              ref={textarea}
              aria-label="Your message"
              placeholder="Ask anything. Watch where it goes."
              value={prompt}
              maxLength={2000}
              rows={2}
              onChange={(e) => {
                setPrompt(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <div className="composer-toolbar">
              <div className="model-select">
                <span className={`connection-dot ${live ? "connected" : ""}`} />
                <select
                  aria-label="AI provider"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as ProviderId)}
                >
                  {PROVIDER_IDS.map((id) => (
                    <option key={id} value={id}>
                      {PROVIDERS[id].name}
                      {available.includes(id) ? "" : " · preview"}
                    </option>
                  ))}
                </select>
                <span className="select-chevron">⌄</span>
              </div>
              <button
                type="button"
                className="location-button"
                onClick={() => setLocations(true)}
                aria-label="Choose your location"
              >
                <span>⌖</span>
                <span>
                  {Math.abs(origin.lat).toFixed(1)}°
                  {origin.lat >= 0 ? "N" : "S"} ·{" "}
                  {Math.abs(origin.lon).toFixed(1)}°
                  {origin.lon >= 0 ? "E" : "W"}
                </span>
              </button>
              <button
                type="submit"
                className="send-button"
                disabled={!prompt.trim()}
                aria-label={live ? "Send message" : "Preview route"}
              >
                ↑
              </button>
            </div>
          </form>
          <p className="composer-hint">
            {live
              ? "A real AI response. Two modeled paths."
              : "Route preview · this model is not connected."}{" "}
            <button onClick={() => setSources(true)}>How it works</button>
          </p>
          {error && (
            <p className="request-error" role="alert">
              {error}
            </p>
          )}
        </section>
      )}
      <div className="map-controls">
        <span className="map-hint">Drag to explore · hold the pin to move</span>
        <div>
          <button
            onClick={() => setZoom((z) => z + 1)}
            disabled={Boolean(flight)}
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            onClick={() => setZoom((z) => z - 1)}
            disabled={Boolean(flight)}
            aria-label="Zoom out"
          >
            −
          </button>
          <button
            onClick={() => setFocusId((v) => v + 1)}
            disabled={Boolean(flight)}
            aria-label="Center on your location"
          >
            ⌖
          </button>
        </div>
      </div>
      <footer className="site-footer">
        <span>AN ORBITAL COMPUTE EXPERIMENT</span>
        <span>
          made by <strong>Oleh Lahoda</strong>
        </span>
      </footer>
      {locations && (
        <LocationPicker
          origin={origin}
          onClose={() => setLocations(false)}
          onChoose={(p) => {
            setOrigin(p);
            setFocusId((v) => v + 1);
            setLocations(false);
          }}
        />
      )}
      {results && (
        <InferenceComparison
          result={result}
          provider={provider}
          origin={origin}
          site={site}
          prompt={submitted}
          snapshotAt={snapshotAt}
          joules={joules}
          onClose={() => {
            setResults(false);
            setTimeout(() => textarea.current?.focus(), 0);
          }}
          onSources={() => setSources(true)}
        />
      )}
      {sources && (
        <SourcesNote
          provider={provider}
          joules={joules}
          onJoules={setJoules}
          onClose={() => setSources(false)}
        />
      )}
    </main>
  );
}
function LocationPicker({
  origin,
  onChoose,
  onClose,
}: {
  origin: Location;
  onChoose: (p: Location) => void;
  onClose: () => void;
}) {
  const [lat, setLat] = useState(origin.lat.toFixed(3)),
    [lon, setLon] = useState(origin.lon.toFixed(3));
  return (
    <Modal title="Where does your thought begin?" onClose={onClose}>
      <p className="result-intro">
        Hold the pin and drag it across the globe, double-click the map, or
        enter any coordinates.
      </p>
      <div className="city-grid">
        {PRESETS.map((p) => (
          <button key={p.name} onClick={() => onChoose(p)}>
            {p.name}
            <span>↗</span>
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (
            lat.trim() &&
            lon.trim() &&
            Number.isFinite(Number(lat)) &&
            Number.isFinite(Number(lon))
          )
            onChoose({ lat: Number(lat), lon: Number(lon) });
        }}
      >
        <div className="coordinate-fields">
          <label>
            Latitude
            <input
              type="number"
              min="-90"
              max="90"
              step="any"
              required
              value={lat}
              onChange={(e) => setLat(e.target.value)}
            />
          </label>
          <label>
            Longitude
            <input
              type="number"
              min="-180"
              max="180"
              step="any"
              required
              value={lon}
              onChange={(e) => setLon(e.target.value)}
            />
          </label>
        </div>
        <button className="primary-button" type="submit">
          Place pin ↗
        </button>
      </form>
    </Modal>
  );
}
