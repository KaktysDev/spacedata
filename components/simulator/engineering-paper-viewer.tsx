"use client";

import { useEffect, useRef } from "react";

const PAPER_URL = "/papers/routing-efficiency-revised.pdf";
const PAPER_FILENAME = "Routing-Efficiency-of-AI-Data-Centers-in-Space-revised.pdf";

export function EngineeringPaperViewer({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);

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
          <p className="engineering-paper-meta">Oleh Lahoda · Revised edition · 24 pages</p>
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
        <div className="engineering-paper-actions">
          <a href={PAPER_URL} download={PAPER_FILENAME}>
            Download <span aria-hidden="true">↓</span>
          </a>
          <a href={PAPER_URL} target="_blank" rel="noreferrer" aria-label="Open engineering paper in a new tab to print">
            Print <span aria-hidden="true">↗</span>
          </a>
        </div>
      </div>

      <div className="engineering-paper-frame">
        <iframe
          src={`${PAPER_URL}#toolbar=1&navpanes=0`}
          title="Revised engineering paper PDF, 24 pages"
        />
      </div>
      <p className="engineering-paper-hint">
        Print opens the selected PDF with your browser’s print controls.
      </p>
    </dialog>
  );
}
