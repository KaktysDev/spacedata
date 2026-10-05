"use client";

import { useEffect, useRef, useState } from "react";

const PAPERS = {
  original: {
    label: "Original paper",
    description: "Dark edition",
    url: "/papers/routing-efficiency-original.pdf",
    filename: "Routing-Efficiency-of-AI-Data-Centers-in-Space.pdf",
  },
  printable: {
    label: "Printable version",
    description: "White pages",
    url: "/papers/routing-efficiency-printable.pdf",
    filename: "Routing-Efficiency-of-AI-Data-Centers-in-Space-Printable.pdf",
  },
} as const;

type PaperVersion = keyof typeof PAPERS;

export function EngineeringPaperViewer({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [version, setVersion] = useState<PaperVersion>("original");
  const paper = PAPERS[version];

  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="engineering-paper-dialog"
      aria-labelledby="engineering-paper-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        ) onClose();
      }}
    >
      <div className="engineering-paper-header">
        <div>
          <p className="overview-kicker">SpaceVision / Engineering paper</p>
          <h2 id="engineering-paper-title">Routing Efficiency of AI Data Centers in Space</h2>
          <p className="engineering-paper-meta">Oleh Lahoda · 24 pages</p>
        </div>
        <button
          type="button"
          className="engineering-paper-close"
          onClick={onClose}
          aria-label="Close engineering paper"
        >
          ×
        </button>
      </div>

      <div className="engineering-paper-toolbar">
        <div className="engineering-paper-versions" role="group" aria-label="Paper version">
          {(Object.keys(PAPERS) as PaperVersion[]).map((choice) => (
            <button
              key={choice}
              type="button"
              aria-pressed={version === choice}
              onClick={() => setVersion(choice)}
            >
              <span>{PAPERS[choice].label}</span>
              <small>{PAPERS[choice].description}</small>
            </button>
          ))}
        </div>
        <div className="engineering-paper-actions">
          <a href={paper.url} download={paper.filename}>
            Download <span aria-hidden="true">↓</span>
          </a>
          <a href={paper.url} target="_blank" rel="noreferrer" aria-label={`Open ${paper.label} in a new tab to print`}>
            Print <span aria-hidden="true">↗</span>
          </a>
        </div>
      </div>

      <div className={`engineering-paper-frame ${version}`}>
        <iframe
          key={version}
          src={`${paper.url}#toolbar=1&navpanes=0`}
          title={`${paper.label} PDF, 24 pages`}
        />
      </div>
      <p className="engineering-paper-hint">
        Print opens the selected PDF with your browser’s print controls.
      </p>
    </dialog>
  );
}
