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
  createRoutePlayback,
  NODE_COUNT,
  routeAt,
  type OrbitalRoute,
  type PlaybackLane,
} from "@/lib/starcloud/network";
import { type Flight, type ViewPhase } from "./orbital-scene";
import { InferenceComparison, preloadComparisonImages } from "./inference-comparison";
import { SourcesNote } from "./sources-note";
import { DeveloperCredit } from "./developer-credit";
import { ProviderPicker } from "./provider-picker";
import { Overview } from "./overview";
const OrbitalScene = dynamic(
  () => import("./orbital-scene").then((m) => m.OrbitalScene),
  { ssr: false },
);

type Place = Location & { name: string };
type ViewMode = "space" | "to-overview" | "overview" | "to-space";

function prefersReducedMotion() {
  return (
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function routePhase(lane: PlaybackLane, elapsed: number, answerReady: boolean) {
  if (elapsed < lane.outbound.startMs) return "Starting";
  if (elapsed < lane.outbound.endMs) return "Outbound";
  if (!answerReady || elapsed < lane.return.startMs) return "Waiting";
  if (elapsed < lane.finishedMs) return "Returning";
  return "Arrived";
}

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
    [flight, setFlight] = useState<Flight | null>(null),
    [routeSnapshot, setRouteSnapshot] = useState<OrbitalRoute | null>(null),
    [elapsed, setElapsed] = useState(0),
    [answerReady, setAnswerReady] = useState(false),
    [answerReadyAt, setAnswerReadyAt] = useState<number | null>(null),
    [result, setResult] = useState<ChatSuccessBody | null>(null),
    [results, setResults] = useState(false),
    [sources, setSources] = useState(false),
    [error, setError] = useState(""),
    [joules, setJoules] = useState(1.11),
    [submitted, setSubmitted] = useState(""),
    [snapshotAt, setSnapshotAt] = useState(0),
    [mode, setMode] = useState<ViewMode>("space"),
    [sceneView, setSceneView] = useState<"space" | "overview">("space"),
    [veil, setVeil] = useState(false),
    [word, setWord] = useState<"off" | "center" | "corner">("off"),
    [pageOpen, setPageOpen] = useState(false);
  const modeRef = useRef(mode);
  const leaving = useRef(false);
  const trip = useRef(0);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  const request = useRef<AbortController | null>(null),
    active = useRef(false),
    textarea = useRef<HTMLTextAreaElement>(null);
  const fitPrompt = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "0px";
    const max = parseFloat(getComputedStyle(el).maxHeight);
    const next = Number.isFinite(max)
      ? Math.min(el.scrollHeight, max)
      : el.scrollHeight;
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > max + 1 ? "auto" : "hidden";
  }, []);
  const site = nearestSite(provider, origin);
  const onReady = useCallback(() => setReady(true), []);

  useEffect(() => {
    if (!flight) fitPrompt(textarea.current);
  }, [flight, prompt, fitPrompt]);
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
  const onViewPhase = useCallback((phase: ViewPhase) => {
    if (phase === "returned") {
      leaving.current = false;
      setVeil(false);
      setWord("off");
      setPageOpen(false);
      setMode("space");
      return;
    }
    if (leaving.current || modeRef.current !== "to-overview") return;
    if (phase === "blur") {
      setVeil(true);
      setWord("center");
    }
    if (phase === "settled") {
      setVeil(true);
      setWord("corner");
      setPageOpen(true);
      setMode("overview");
    }
  }, []);
  useEffect(() => {
    if (mode !== "to-overview" && mode !== "to-space") return;
    const ms = prefersReducedMotion() ? 80 : mode === "to-overview" ? 5600 : 2800;
    const watch = mode;
    const id = window.setTimeout(() => {
      if (modeRef.current !== watch) return;
      if (watch === "to-overview") {
        if (leaving.current) return;
        setVeil(true);
        setWord("corner");
        setPageOpen(true);
        setMode("overview");
      } else {
        leaving.current = false;
        setVeil(false);
        setWord("off");
        setPageOpen(false);
        setMode("space");
      }
    }, ms);
    return () => window.clearTimeout(id);
  }, [mode]);
  function go(next: "space" | "overview") {
    if (flight) return;
    const id = ++trip.current;
    if (next === "overview") {
      if (mode === "to-overview") return;
      leaving.current = false;
      if (mode === "overview" || (mode === "to-space" && sceneView === "overview")) {
        setMode("overview");
        setVeil(true);
        setWord("corner");
        setPageOpen(true);
        return;
      }
      setResults(false);
      setSources(false);
      setPageOpen(false);
      setWord("off");
      setVeil(false);
      setMode("to-overview");
      setSceneView("overview");
      return;
    }
    if (mode === "space" || mode === "to-space") return;
    leaving.current = true;
    setMode("to-space");
    setPageOpen(false);
    setWord("off");
    window.setTimeout(() => {
      if (trip.current !== id) return;
      setVeil(false);
      setSceneView("space");
    }, prefersReducedMotion() ? 0 : 280);
  }

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
    setRouteSnapshot(null);
    setError("Request canceled. A provider may still bill work already started.");
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (active.current || !prompt.trim()) return;
    preloadComparisonImages(provider, site);
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
    setAnswerReadyAt(null);
    const at = Date.now();
    setSnapshotAt(at);
    try {
      const modeledRoute = routeAt(origin, at, site);
      setRouteSnapshot(modeledRoute);
      setFlight({ id: at, started, reduced });
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
      const answer: ChatSuccessBody = body;
      if (controller.signal.aborted) return;
      const responseElapsed = performance.now() - started;
      setAnswerReady(true);
      setAnswerReadyAt(responseElapsed);
      const playback = createRoutePlayback(modeledRoute, {
        elapsedMs: responseElapsed,
        answerReadyAtMs: responseElapsed,
      });
      await new Promise<void>((resolve, reject) => {
        const wait = Math.max(
          0,
          (reduced ? 300 : playback.totalMs) - (performance.now() - started),
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
      setRouteSnapshot(null);
      setResults(true);
    } catch (e) {
      if (!controller.signal.aborted) {
        setFlight(null);
        setRouteSnapshot(null);
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
  const playback = flight && routeSnapshot
    ? createRoutePlayback(routeSnapshot, {
        elapsedMs: elapsed,
        answerReadyAtMs: answerReadyAt,
      })
    : null;
  const groundDone = Boolean(playback && elapsed >= playback.ground.finishedMs);
  const spaceDone = Boolean(playback && elapsed >= playback.space.finishedMs);
  const progress = flight?.reduced
    ? "Comparing the two paths"
    : !playback || elapsed < playback.launchMs
      ? "Sending both requests"
      : elapsed < Math.max(playback.ground.outbound.endMs, playback.space.outbound.endMs)
        ? "Following both routes"
        : !answerReady
          ? "Waiting for replies"
          : elapsed < Math.min(playback.ground.return.startMs, playback.space.return.startMs)
            ? "Preparing return paths"
            : groundDone && spaceDone
              ? "Comparison ready"
              : groundDone || spaceDone
                ? "One route complete"
                : "Replies returning";
  const progressPercent = playback
    ? Math.min(answerReady ? 100 : 90, (elapsed / playback.totalMs) * 100)
    : 0;
  const chromeHidden = mode !== "space";
  const overviewTab = mode === "overview" || mode === "to-overview";
  return (
    <main
      className={`simulator ${flight ? "in-flight" : ""} ${sources ? "modal-open" : ""} ${results ? "answer-open" : ""} ${chromeHidden ? "chrome-hidden" : ""} ${pageOpen ? "overview-open" : ""}`}
    >
      <OrbitalScene
        key={NODE_COUNT}
        origin={origin}
        provider={provider}
        site={site}
        flight={flight}
        resultsOpen={results}
        answerReady={answerReady}
        answerReadyAt={answerReadyAt}
        onLocation={(p) => {
          setOrigin(p);
          setPlaceName(
            `${Math.abs(p.lat).toFixed(1)}°${p.lat >= 0 ? "N" : "S"}`,
          );
        }}
        focusId={focusId}
        zoom={zoom}
        onReady={onReady}
        sceneView={sceneView}
        onViewPhase={onViewPhase}
      />
      <header className="site-header">
        <Link
          href="/"
          className="wordmark"
          aria-label="SpaceVision home"
          aria-hidden={chromeHidden}
          tabIndex={chromeHidden ? -1 : undefined}
        >
          <span className="brand-orbit" />
          SpaceVision<span className="wordmark-dot">.</span>
        </Link>
        <div
          className="view-switch"
          role="tablist"
          aria-label="Sections"
          onKeyDown={(e) => {
            if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
            e.preventDefault();
            go(e.key === "ArrowRight" ? "overview" : "space");
            const id = e.key === "ArrowRight" ? "tab-overview" : "tab-spacevision";
            document.getElementById(id)?.focus();
          }}
        >
          <button
            type="button"
            role="tab"
            id="tab-spacevision"
            aria-selected={!overviewTab}
            disabled={Boolean(flight)}
            onClick={() => go("space")}
          >
            SpaceVision
          </button>
          <button
            type="button"
            role="tab"
            id="tab-overview"
            aria-selected={overviewTab}
            aria-controls="overview-panel"
            disabled={Boolean(flight)}
            onClick={() => go("overview")}
          >
            Overview
          </button>
        </div>
        <button
          className="about-button"
          onClick={() => setSources(true)}
          disabled={Boolean(flight) || chromeHidden}
          aria-hidden={chromeHidden}
          tabIndex={chromeHidden ? -1 : undefined}
        >
          How it works <span>↗</span>
        </button>
      </header>
      <h1 className={`overview-word ${word}`} aria-hidden={word === "off"}>
        Overview
      </h1>
      <div className={`overview-veil ${veil ? "on" : ""}`} aria-hidden="true" />
      <Overview open={pageOpen} onBack={() => go("space")} />
      {!ready && (
        <div className="loading-scene" role="status">
          <span />
          Loading Earth
        </div>
      )}
      {flight ? (
        <section className="journey-status" aria-label="Request journey" inert={chromeHidden}>
          <div className="journey-step">
            <span className="live-dot" />
            <span className="elapsed">{(elapsed / 1000).toFixed(1)} s</span>
          </div>
          <h1 aria-live="polite">{progress}</h1>
          <p>
            {answerReady
              ? "Provider replies received · route motion is illustrative"
              : `${PROVIDERS[provider].name} is answering both requests`}
          </p>
          <div className="journey-stages" aria-label="Modeled route progress">
            <span>Ground · {playback ? routePhase(playback.ground, elapsed, answerReady) : "Starting"}</span>
            <span>Orbit · {playback ? routePhase(playback.space, elapsed, answerReady) : "Starting"}</span>
          </div>
          <div className="journey-track">
            <span
              style={{
                width: `${progressPercent}%`,
              }}
            />
          </div>
          <button className="text-button" onClick={cancel}>
            Cancel journey
          </button>
        </section>
      ) : (
        <section className="composer" aria-label="Send a prompt" inert={chromeHidden}>
          <div className="composer-heading">
            <h1 aria-hidden={chromeHidden}>A thought. Two paths.</h1>
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
                fitPrompt(e.currentTarget);
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
              <ProviderPicker value={provider} onChange={setProvider} />
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
                aria-label="Send message"
              >
                ↑
              </button>
            </div>
          </form>
          {error && (
            <p className="request-error" role="alert">
              {error}
            </p>
          )}
        </section>
      )}
      <div className="map-controls" inert={chromeHidden}>
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
        </div>
      </div>
      <footer className="site-footer" inert={chromeHidden}>
        <span className="constellation-count">SSO · 600–850 km</span>
        <DeveloperCredit />
      </footer>
      {results && (
        <InferenceComparison
          result={result}
          provider={provider}
          origin={origin}
          site={site}
          prompt={submitted}
          joules={joules}
          snapshotAt={snapshotAt}
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
    if (q.length < 2) return;
    const controller = new AbortController();
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
        onChange={(e) => {
          const next = e.target.value;
          setQuery(next);
          if (next.trim().length < 2) {
            setHits([]);
            setLoading(false);
          } else {
            setLoading(true);
          }
        }}
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
