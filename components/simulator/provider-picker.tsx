"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  PROVIDERS,
  PROVIDER_IDS,
  type ProviderId,
} from "@/lib/starcloud/catalog";
export function ProviderLogo({ provider }: { provider: ProviderId }) {
  return (
    <Image
      className="provider-logo"
      src={`/providers/${provider}.svg`}
      width={20}
      height={20}
      alt=""
    />
  );
}
export function ProviderPicker({
  value,
  onChange,
  connected = [],
}: {
  value: ProviderId;
  onChange: (id: ProviderId) => void;
  connected?: readonly ProviderId[];
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const options = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    if (!open) return;
    options.current[PROVIDER_IDS.indexOf(value)]?.focus();
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open, value]);
  return (
    <div
      className="provider-picker"
      ref={root}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="provider-trigger"
        aria-label={`AI provider: ${PROVIDERS[value].name}${connected.includes(value) ? ", connected" : ""}`}
        data-connected={connected.includes(value) ? "true" : "false"}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="provider-options"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <ProviderLogo provider={value} />
        <span>{PROVIDERS[value].name}</span>
        <svg
          className={open ? "chevron open" : "chevron"}
          width="12"
          height="12"
          viewBox="0 0 12 12"
          aria-hidden="true"
        >
          <path
            d="m3 4.5 3 3 3-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
          />
        </svg>
      </button>
      {open && (
        <div
          className="provider-menu"
          id="provider-options"
          role="listbox"
          aria-label="AI provider"
        >
          {PROVIDER_IDS.map((id, i) => (
            <button
              key={id}
              ref={(el) => {
                options.current[i] = el;
              }}
              type="button"
              role="option"
              aria-selected={id === value}
              tabIndex={id === value ? 0 : -1}
              onKeyDown={(e) => {
                const next =
                  e.key === "ArrowDown"
                    ? (i + 1) % 4
                    : e.key === "ArrowUp"
                      ? (i + 3) % 4
                      : e.key === "Home"
                        ? 0
                        : e.key === "End"
                          ? 3
                          : -1;
                if (next >= 0) {
                  e.preventDefault();
                  options.current[next]?.focus();
                }
              }}
              onClick={() => {
                onChange(id);
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              <ProviderLogo provider={id} />
              <span className="provider-option-text">
                {PROVIDERS[id].name}
                <small>{PROVIDERS[id].company}</small>
              </span>
              <span className="provider-check" aria-hidden="true">
                {id === value ? "✓" : ""}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
