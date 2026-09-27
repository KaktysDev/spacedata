"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  DEFAULT_LOCATION,
  nearestSite,
  PROVIDERS,
  type ProviderId,
  type Location,
} from "@/lib/starcloud/catalog";
import {
  isChatSuccessBody,
  type ChatSuccessBody,
} from "@/lib/starcloud/chat-types";
import {
  JOURNEY_MS,
  NODE_COUNT,
  STAGES,
  journeyStage,
} from "@/lib/starcloud/network";
import { type Flight } from "./orbital-scene";
import { InferenceComparison } from "./inference-comparison";
import { SourcesNote } from "./sources-note";
import { ProviderPicker } from "./provider-picker";
const OrbitalScene = dynamic(
  () => import("./orbital-scene").then((m) => m.OrbitalScene),
  { ssr: false },
);

type Place = Location & { name: string };

export function Simulator({ available }: { available: ProviderId[] }) {
  const [provider, setProvider] = useState<ProviderId>(
      available[0] ?? "gemini",
    ),
    [origin, setOrigin] = useState<Location>(DEFAULT_LOCATION),
    [placeName, setPlaceName] = useState("Location"),
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
    [error, setError] = useState(""),
    [joules, setJoules] = useState(1.11),
    [snapshotAt, setSnapshotAt] = useState(0);
  const request = useRef<AbortController | null>(null),
    active = useRef(false),
    textarea = useRef<HTMLTextAreaElement>(null);
  const site = nearestSite(provider, origin),
    live = available.includes(provider);
  const onReady = useCallback(() => setReady(true), []);

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    root.classList.add("app-lock");
    body.classList.add("app-lock");
    return () => {
      root.classList.remove("app-lock");
      body.classList.remove("app-lock");
    };
  }, []);

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
  const stage = journeyStage(elapsed);
  const progress = flight?.reduced
    ? "Comparing the two paths"
    : elapsed >= JOURNEY_MS
      ? answerReady
        ? "Your comparison is ready"
        : "Waiting for the AI response"
      : STAGES[stage].label;
  return (
    <main
      className={`simulator ${flight ? "in-flight" : ""} ${sources ? "modal-open" : ""}`}
    >
      <OrbitalScene
        key={NODE_COUNT}
        origin={origin}
        provider={provider}
        site={site}
        flight={flight}
        onLocation={(p) => {
          setOrigin(p);
          setPlaceName(
            `${Math.abs(p.lat).toFixed(1)}°${p.lat >= 0 ? "N" : "S"}`,
          );
        }}
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
          How it works <span>↗</span>
        </button>
      </header>
      {!ready && (
        <div className="loading-scene" role="status">
          <span />
          Loading Earth
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
                ? "AI responses received · finishing the visual journey"
                : `${PROVIDERS[provider].name} is processing your message`
              : "Illustrative travel · no AI request or charge"}
          </p>
          <div className="journey-stages" aria-label="Route stages">
            {STAGES.map((s, i) => (
              <span
                key={s.short}
                className={
                  i === stage ? "current" : i < stage ? "complete" : ""
                }
              >
                {s.short}
              </span>
            ))}
          </div>
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
            <h1>A thought. Two paths.</h1>
          </div>
          <form onSubmit={submit} className="prompt-glass">
            <textarea
              ref={textarea}
              aria-label="Your message"
              placeholder="Ask anything…"
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
              <ProviderPicker
                value={provider}
                available={available}
                onChange={setProvider}
              />
              <LocationChip
                label={placeName}
                disabled={Boolean(flight)}
                onSelect={(place) => {
                  setOrigin(place);
                  setPlaceName(place.name);
                  setFocusId((v) => v + 1);
                }}
              />
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
              ? "Two responses · space vs ground"
              : "Preview · no AI request"}{" "}
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
            aria-label="Reset globe view"
          >
            ⌖
          </button>
        </div>
      </div>
      <footer className="site-footer">
        <span className="constellation-count">
          {NODE_COUNT.toLocaleString()} satellites <span>· concept</span>
        </span>
        <a
          className="developer-credit"
          href="https://www.linkedin.com/in/oleh-lahoda-0847a3393/"
          target="_blank"
          rel="noreferrer"
        >
          Developed by{" "}
          <span className="developer-name" aria-label="Oleh Lahoda">
            <span className="name-letters" aria-hidden="true">
              Oleh Lahoda
            </span>
            <svg className="name-dots" aria-hidden="true" viewBox="0 0 100 16">
              <defs>
                <pattern
                  id="name-dot-pattern"
                  width="2.6"
                  height="2.6"
                  patternUnits="userSpaceOnUse"
                >
                  <circle cx="1.2" cy="1.2" r=".7" fill="white" />
                </pattern>
                <mask id="name-dot-mask">
                  <text
                    fill="white"
                    x="0"
                    y="12"
                    fontSize="14"
                    fontFamily="Arial"
                  >
                    Oleh Lahoda
                  </text>
                </mask>
              </defs>
              <rect
                width="100"
                height="16"
                fill="url(#name-dot-pattern)"
                mask="url(#name-dot-mask)"
              />
            </svg>
          </span>
          <span aria-hidden="true" className="credit-arrow">
            ↗
          </span>
        </a>
      </footer>
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

function LocationChip({
  label,
  onSelect,
  disabled,
}: {
  label: string;
  onSelect: (p: Place) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [hits, setHits] = useState<Place[]>([]),
    [loading, setLoading] = useState(false);
  const input = useRef<HTMLInputElement>(null),
    wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
        setHits([]);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/geocode?q=${encodeURIComponent(q)}`,
          { signal: controller.signal },
        );
        const body = await res.json();
        const list = Array.isArray(body.results) ? body.results : [];
        setHits(
          list.filter(
            (p: Place) =>
              typeof p?.name === "string" &&
              Number.isFinite(p.lat) &&
              Number.isFinite(p.lon),
          ),
        );
      } catch {
        if (!controller.signal.aborted) setHits([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 220);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  if (!open) {
    return (
      <button
        type="button"
        className="location-button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        aria-label="Choose location"
      >
        <span>⌖</span>
        <span>{label || "Location"}</span>
      </button>
    );
  }

  return (
    <div className="location-search" ref={wrap}>
      <input
        ref={input}
        type="search"
        className="location-search-input"
        placeholder="City, state, country"
        value={query}
        aria-label="Search location"
        autoComplete="off"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            setQuery("");
            setHits([]);
          }
        }}
      />
      {(loading || hits.length > 0 || query.trim().length >= 2) && (
        <ul className="location-suggestions" role="listbox">
          {loading && <li className="location-suggestion muted">Searching…</li>}
          {!loading &&
            hits.map((hit) => (
              <li key={`${hit.name}-${hit.lat}-${hit.lon}`}>
                <button
                  type="button"
                  className="location-suggestion"
                  onClick={() => {
                    onSelect(hit);
                    setOpen(false);
                    setQuery("");
                    setHits([]);
                  }}
                >
                  {hit.name}
                </button>
              </li>
            ))}
          {!loading && query.trim().length >= 2 && hits.length === 0 && (
            <li className="location-suggestion muted">No matches</li>
          )}
        </ul>
      )}
    </div>
  );
}
