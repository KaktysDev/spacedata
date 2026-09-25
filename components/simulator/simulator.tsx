"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { Icon } from "./icon";
import { OrbitalScene } from "./orbital-scene";
import { useSimulator } from "./simulator-provider";
import { SourcesNote } from "./sources-note";
import { InferenceComparison } from "./inference-comparison";
import { formatLiters, formatSessionUsd } from "@/lib/starcloud/format";
import { CHAT_MAX_CHARS } from "@/lib/starcloud/constants";

const steps = [
  ["01", "Uplink", "Earth → orbit"],
  ["02", "Compute", "Process in parallel"],
  ["03", "Downlink", "Return to Earth"],
];
const phaseCopy = {
  idle: "Ready for your first transmission",
  uplink: "Your prompt is leaving Earth",
  split: "Two paths. The same request.",
  pullback: "Bringing the results back to you",
  compare: "Transmission complete",
};

export function Simulator() {
  const {
    space,
    ground,
    phase,
    busy,
    reducedMotion,
    submitPrompt,
    showBaseline,
    mode,
    setMode,
    liveAvailable,
    error,
  } = useSimulator();
  const [draft, setDraft] = useState("");
  const [focus, setFocus] = useState<"both" | "space" | "ground">("both");
  const [paused, setPaused] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const stepIndex = { idle: -1, uplink: 0, split: 1, pullback: 2, compare: 3 }[
    phase
  ];
  async function send(event?: FormEvent) {
    event?.preventDefault();
    if (!draft.trim() || busy) return;
    await submitPrompt(draft);
  }
  const openInfo = () => dialogRef.current?.showModal();
  return (
    <main className="app-shell">
      <header className="topbar">
        <Link href="/" className="brand" aria-label="Starcloud home">
          <span className="brand-mark">
            <Icon name="spark" size={25} />
          </span>
          starcloud
          <span className="brand-divider" />
          <span className="brand-subtitle">SIMULATOR</span>
        </Link>
        <nav aria-label="Main navigation">
          <span className="nav-current">Mission control</span>
          <button className="text-button" onClick={openInfo}>
            How it works <Icon name="info" size={14} />
          </button>
        </nav>
        <span className="system-status">
          <span className="status-dot" />
          {busy ? "Transmission in progress" : "All systems ready"}
        </span>
      </header>
      <div className="workspace">
        <section className="intro">
          <div>
            <p className="eyebrow">
              <span className="tiny-cross">+</span> A NEW PERSPECTIVE ON COMPUTE
            </p>
            <h1>
              Intelligence. <span>Above it all.</span>
            </h1>
            <p className="intro-copy">
              One prompt. Two paths. Explore AI on Earth and in orbit.
            </p>
          </div>
          <button className="intro-link" onClick={openInfo}>
            Behind the simulation <Icon name="arrow" size={17} />
          </button>
        </section>
        <section className="mission" aria-label="Mission visualization">
          <div className="mission-toolbar">
            <span className="mission-title">
              <Icon name="globe" size={16} /> EARTH TO ORBIT{" "}
              <span className="preview-badge">CONCEPT VIEW</span>
            </span>
            <div className="view-switch" aria-label="Visible routes">
              {(["both", "space", "ground"] as const).map((value) => (
                <button
                  key={value}
                  aria-pressed={focus === value}
                  onClick={() => setFocus(value)}
                >
                  {value === "both"
                    ? "Both paths"
                    : value === "space"
                      ? "Space"
                      : "Ground"}
                </button>
              ))}
            </div>
          </div>
          <div className="scene-wrap">
            <OrbitalScene
              phase={phase}
              reducedMotion={reducedMotion || paused}
              focus={focus}
            />
            <aside className="scene-note">
              <span className="eyebrow">A DIFFERENT KIND OF CLOUD</span>
              <p>
                Less footprint.
                <br />
                <span>More possibility.</span>
              </p>
              <div className="scene-note-rule" />
              <span className="scene-note-detail">
                Solar-powered compute.
                <br />
                Radiative cooling. Zero cooling water.
              </span>
            </aside>
            <div className="orbit-tag">
              <span className="status-dot" />
              <div>
                Starcloud constellation
                <small>Illustrative low-Earth orbit</small>
              </div>
            </div>
            <div className="scene-bottom">
              <span>
                <span className="legend-dot space-color" />
                Orbital link <span className="legend-dot ground-color" />
                Ground link
              </span>
              <button
                className="scene-motion"
                onClick={() => setPaused(!paused)}
                aria-pressed={paused}
              >
                {paused ? "Resume motion" : "Pause motion"}
              </button>
            </div>
          </div>
          <div className="journey">
            <div className="journey-status" role="status">
              <span className={`status-orb ${busy ? "is-busy" : ""}`}>
                <Icon
                  name={phase === "compare" ? "check" : "satellite"}
                  size={19}
                />
              </span>
              <div>
                <span className="eyebrow">
                  {busy
                    ? "TRANSMISSION IN PROGRESS"
                    : phase === "compare"
                      ? "BACK ON EARTH"
                      : "YOUR NEXT JOURNEY"}
                </span>
                <p>
                  {error && phase === "compare"
                    ? "Route complete · answer unavailable"
                    : phaseCopy[phase]}
                </p>
              </div>
            </div>
            <ol className="journey-steps">
              {steps.map(([n, name, detail], i) => (
                <li
                  key={n}
                  className={
                    stepIndex === i
                      ? "step-active"
                      : stepIndex > i
                        ? "step-done"
                        : ""
                  }
                >
                  <span className="step-number">
                    {stepIndex > i ? <Icon name="check" size={12} /> : n}
                  </span>
                  <div>
                    <span>{name}</span>
                    <small>{detail}</small>
                  </div>
                  {i < 2 && <Icon name="chevron" size={12} />}
                </li>
              ))}
            </ol>
          </div>
        </section>
        <div className="control-grid">
          <section className="prompt-card" aria-labelledby="prompt-heading">
            <div className="card-heading">
              <h2 id="prompt-heading">
                <Icon name="spark" size={17} /> Send a little curiosity into
                space.
              </h2>
              <span className="mode-label">
                {mode === "live" ? "LIVE AI" : "SIMULATION"}
              </span>
            </div>
            <form onSubmit={send} aria-busy={busy}>
              <div className="composer">
                <label className="sr-only" htmlFor="prompt">
                  Your prompt
                </label>
                <textarea
                  ref={promptRef}
                  id="prompt"
                  rows={2}
                  maxLength={CHAT_MAX_CHARS}
                  value={draft}
                  disabled={busy}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="What if the next big idea started in orbit?"
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !e.shiftKey &&
                      !e.nativeEvent.isComposing
                    ) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                />
                <button
                  className="send-button"
                  type="submit"
                  disabled={busy || !draft.trim()}
                >
                  <span>{busy ? "In flight" : "Send prompt"}</span>
                  <Icon name="arrow" size={19} />
                </button>
              </div>
              <div className="composer-footer">
                <span>
                  {draft.length > 1700
                    ? `${draft.length} / ${CHAT_MAX_CHARS} characters`
                    : mode === "live"
                      ? "Same model. Two answers. A different footprint."
                      : "Explore the route. No AI answer is generated."}
                </span>
                <span className="enter-hint">↵ to send</span>
              </div>
            </form>
            <div className="suggestions">
              <span>TRY ASKING</span>
              {["Why compute in space?", "Explain orbital cooling"].map(
                (text) => (
                  <button
                    type="button"
                    key={text}
                    disabled={busy}
                    onClick={() => {
                      setDraft(text);
                      promptRef.current?.focus();
                    }}
                  >
                    {text}
                    <span>↗</span>
                  </button>
                ),
              )}
            </div>
            <div className="prompt-options">
              <div className="mode-switch" aria-label="Prompt mode">
                <button
                  aria-pressed={mode === "simulation"}
                  disabled={busy}
                  onClick={() => setMode("simulation")}
                >
                  Simulation
                </button>
                <button
                  aria-pressed={mode === "live"}
                  disabled={busy || !liveAvailable}
                  title={
                    liveAvailable
                      ? "Ask Gemini using the server connection"
                      : "Live AI is available on the deployment with a configured Gemini key"
                  }
                  onClick={() => setMode("live")}
                >
                  Live AI{" "}
                  {!liveAvailable && <span className="unavailable-dot" />}
                </button>
              </div>
              {(busy || phase === "compare") && (
                <button className="text-button" onClick={showBaseline}>
                  <Icon name={busy ? "stop" : "reset"} size={13} />
                  {busy ? "Cancel" : "Reset journey"}
                </button>
              )}
            </div>
          </section>
          <section className="metrics-card" aria-labelledby="metrics-heading">
            <div className="card-heading">
              <h2 id="metrics-heading">The footprint, in real time.</h2>
              <span className="metric-live">MODELED</span>
            </div>
            <table>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="sr-only">Metric</span>
                  </th>
                  <th scope="col">
                    <span className="legend-dot space-color" />
                    Space
                  </th>
                  <th scope="col">
                    <span className="legend-dot ground-color" />
                    Ground
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Energy cost</th>
                  <td>{formatSessionUsd(space.energyCostUsd)}</td>
                  <td>{formatSessionUsd(ground.energyCostUsd)}</td>
                </tr>
                <tr>
                  <th scope="row">Cooling water</th>
                  <td>
                    {formatLiters(space.waterLiters)} <span>L</span>
                  </td>
                  <td>
                    {formatLiters(ground.waterLiters)} <span>L</span>
                  </td>
                </tr>
                <tr>
                  <th scope="row">Network latency</th>
                  <td>
                    {space.latencyMs.toFixed(1)} <span>ms</span>
                  </td>
                  <td>
                    {ground.latencyMs.toFixed(1)} <span>ms</span>
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="metrics-footnote">
              Cumulative session · 40 MW model{" "}
              <button onClick={openInfo} aria-label="About the modeled metrics">
                <Icon name="info" size={13} />
              </button>
            </p>
          </section>
        </div>
        {phase === "compare" && (
          <div ref={resultRef} className="results-wrap">
            <InferenceComparison />
          </div>
        )}
        <footer className="footer">
          <span>Built to explore a future beyond Earth.</span>
          <button onClick={openInfo}>
            Model assumptions & sources <Icon name="arrow" size={12} />
          </button>
          <span className="footer-coordinate">
            40.7128° N &nbsp; 74.0060° W
          </span>
        </footer>
      </div>
      <dialog
        ref={dialogRef}
        className="info-dialog"
        aria-labelledby="dialog-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) dialogRef.current?.close();
        }}
      >
        <div className="dialog-content">
          <button
            className="close-button"
            aria-label="Close explanation"
            onClick={() => dialogRef.current?.close()}
          >
            <Icon name="close" />
          </button>
          <span className="eyebrow">BEHIND THE SIMULATION</span>
          <h2 id="dialog-title">
            Same question.
            <br />A new perspective.
          </h2>
          <p>
            Follow a prompt from New York to an illustrative orbital
            constellation and a ground datacenter in Nevada. The view follows
            your request through uplink, compute, and downlink.
          </p>
          <div className="explanation-grid">
            <div>
              <Icon name="satellite" />
              <h3>In orbit</h3>
              <p>
                Solar energy supplies compute. Radiators release heat into space
                without consuming cooling water.
              </p>
            </div>
            <div>
              <Icon name="globe" />
              <h3>On Earth</h3>
              <p>
                The ground model includes grid electricity and water used for
                cooling.
              </p>
            </div>
          </div>
          <p>
            Distances, satellite positions, and animation timing are
            illustrative. The network latency values are model assumptions, not
            measured response times. Counters represent a modeled 40 MW cluster
            at partial load; they are not your device’s usage or API bill.
          </p>
          <p>
            Simulation mode animates the route without calling an AI. Live AI
            makes two Gemini requests using the deployment’s server-side key.
            Both answers come from the same provider—not physical orbital
            hardware.
          </p>
          <SourcesNote />
        </div>
      </dialog>
    </main>
  );
}
