"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";

const PAPER_URL = "/papers/routing-efficiency.pdf";
const PAPER_FILENAME = "Routing-Efficiency-of-AI-Data-Centers-in-Space.pdf";
const PAGE_COUNT = 24;
const ZOOM_STEPS = [1, 1.25, 1.5, 1.75, 2] as const;

export function EngineeringPaperViewer({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const pages = useRef<(HTMLDivElement | null)[]>([]);
  const zoomAnchor = useRef<{ page: number; fraction: number } | null>(null);
  const [fitWidth, setFitWidth] = useState(720);
  const [zoomIndex, setZoomIndex] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [failedPages, setFailedPages] = useState<number[]>([]);

  useEffect(() => {
    const node = dialog.current;
    if (node && !node.open) node.showModal();
    return () => {
      if (node?.open) node.close();
    };
  }, []);

  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const measure = () => {
      const style = getComputedStyle(node);
      const available =
        node.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight);
      setFitWidth(Math.min(720, Math.max(240, available)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const anchor = zoomAnchor.current;
    const viewport = scroller.current;
    const page = anchor && pages.current[anchor.page - 1];
    if (anchor && viewport && page) {
      viewport.scrollTop +=
        page.getBoundingClientRect().top -
        viewport.getBoundingClientRect().top +
        anchor.fraction * page.getBoundingClientRect().height;
    }
    zoomAnchor.current = null;
  }, [zoomIndex, fitWidth]);

  const changeZoom = (next: number) => {
    if (next < 0 || next >= ZOOM_STEPS.length || next === zoomIndex) return;
    const viewport = scroller.current;
    const page = pages.current[currentPage - 1];
    if (viewport && page) {
      zoomAnchor.current = {
        page: currentPage,
        fraction:
          (viewport.getBoundingClientRect().top -
            page.getBoundingClientRect().top) /
          Math.max(page.getBoundingClientRect().height, 1),
      };
    }
    setZoomIndex(next);
  };

  const goToPage = (pageNumber: number) => {
    const viewport = scroller.current;
    const page = pages.current[pageNumber - 1];
    if (!viewport || !page) return;
    viewport.scrollTop +=
      page.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
    setCurrentPage(pageNumber);
  };

  const updatePage = () => {
    const viewport = scroller.current;
    if (!viewport) return;
    const top = viewport.getBoundingClientRect().top + 24;
    let visible = 1;
    for (let index = 0; index < pages.current.length; index++) {
      const page = pages.current[index];
      if (page && page.getBoundingClientRect().top <= top) visible = index + 1;
      else break;
    }
    setCurrentPage(visible);
  };

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
          <p className="overview-kicker">SpaceVision Engineering Paper</p>
          <h2 id="engineering-paper-title">
            Routing Efficiency of AI Data Centers in Space
          </h2>
          <p className="engineering-paper-meta">Oleh Lahoda · {PAGE_COUNT} pages</p>
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
        <label className="engineering-paper-page-select">
          Page
          <select
            aria-label="Go to page"
            value={currentPage}
            onChange={(event) => goToPage(Number(event.target.value))}
          >
            {Array.from({ length: PAGE_COUNT }, (_, index) => (
              <option key={index + 1} value={index + 1}>
                {index + 1}
              </option>
            ))}
          </select>
          of {PAGE_COUNT}
        </label>
        <div className="engineering-paper-zoom" aria-label="Preview zoom">
          <button
            type="button"
            aria-label="Zoom out"
            disabled={zoomIndex === 0}
            onClick={() => changeZoom(zoomIndex - 1)}
          >
            −
          </button>
          <span>{Math.round(ZOOM_STEPS[zoomIndex] * 100)}%</span>
          <button
            type="button"
            aria-label="Zoom in"
            disabled={zoomIndex === ZOOM_STEPS.length - 1}
            onClick={() => changeZoom(zoomIndex + 1)}
          >
            +
          </button>
          {zoomIndex > 0 && (
            <button
              type="button"
              className="engineering-paper-fit"
              onClick={() => changeZoom(0)}
            >
              Fit
            </button>
          )}
        </div>
        <div className="engineering-paper-actions">
          <a href={PAPER_URL} download={PAPER_FILENAME}>
            Download PDF <span aria-hidden="true">↓</span>
          </a>
          <a href={PAPER_URL} target="_blank" rel="noreferrer">
            Open PDF <span aria-hidden="true">↗</span>
          </a>
        </div>
      </div>

      <div
        ref={scroller}
        className="engineering-paper-scroll"
        onScroll={updatePage}
        aria-label="Engineering paper preview"
      >
        <div className="engineering-paper-pages">
          {Array.from({ length: PAGE_COUNT }, (_, index) => {
            const page = index + 1;
            return (
              <div
                key={page}
                ref={(node) => { pages.current[index] = node; }}
                className="engineering-paper-page"
                style={{ width: fitWidth * ZOOM_STEPS[zoomIndex] }}
              >
                {failedPages.includes(page) ? (
                  <p className="engineering-paper-page-error">
                    Page {page} could not load. <a href={PAPER_URL} target="_blank" rel="noreferrer">Open the PDF</a>.
                  </p>
                ) : (
                  <Image
                    src={`/papers/pages/page-${String(page).padStart(2, "0")}.webp`}
                    alt={`Engineering paper page ${page} of ${PAGE_COUNT}`}
                    width={1360}
                    height={1760}
                    unoptimized
                    loading={page <= 2 ? "eager" : "lazy"}
                    onError={() => setFailedPages((previous) => [...previous, page])}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </dialog>
  );
}
