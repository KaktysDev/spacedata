"use client";

// Public LinkedIn slug (Dublin School / Stanford summer posts). No verified
// Instagram profile for this person — the site link is only instagram.com.
const LINKEDIN = "https://www.linkedin.com/in/oleh-lahoda-0847a3393/";

export function DeveloperCredit() {
  return (
    <span className="developer-credit">
      <span className="credit-kicker">Developed by</span>
      <span className="credit-name-wrap">
        <span className="developer-name">Oleh Lahoda</span>
        <span className="credit-pop" role="group" aria-label="Oleh Lahoda">
          <a
            href={LINKEDIN}
            target="_blank"
            rel="noreferrer"
            aria-label="LinkedIn"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path
                fill="currentColor"
                fillRule="evenodd"
                d="M22.23 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.46c.98 0 1.77-.77 1.77-1.73V1.73C24 .77 23.21 0 22.23 0zM7.12 20.45H3.56V9h3.56v11.45zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM20.45 20.45h-3.55v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.36V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29z"
              />
            </svg>
          </a>
        </span>
      </span>
    </span>
  );
}
