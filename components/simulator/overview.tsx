"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { EngineeringPaperViewer } from "./engineering-paper-viewer";

const PAPER = "https://starcloudinc.github.io/wp.pdf";
const LINKEDIN = "https://www.linkedin.com/in/oleh-lahoda-0847a3393/";

export function Overview({
  open,
  onBack,
}: {
  open: boolean;
  onBack: () => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [paperOpen, setPaperOpen] = useState(false);
  useEffect(() => {
    if (open) scroller.current?.scrollTo(0, 0);
  }, [open]);

  return (
    <div
      ref={scroller}
      id="overview-panel"
      role="tabpanel"
      aria-labelledby="tab-overview"
      aria-hidden={!open}
      inert={!open}
      className={`overview-page ${open ? "open" : ""}`}
    >
      <div className="overview-mask" aria-hidden="true" />
      <article className="overview-article">
        <header className="overview-intro">
          <h2>What changes when AI compute moves off Earth?</h2>
          <p>
            SpaceVision models a ground route and an orbital route for the same
            prompt, then compares response delay, energy use, and cooling-water
            use.
          </p>
          <p className="overview-credit">
            Built by <a href={LINKEDIN} target="_blank" rel="noreferrer">Oleh Lahoda</a>
            {" "}after reading <a href={PAPER} target="_blank" rel="noreferrer">Starcloud’s paper</a>.
          </p>
        </header>

        <section className="overview-paper-feature" aria-labelledby="overview-paper-heading">
          <button
            type="button"
            className="overview-paper-cover"
            aria-label="Read SpaceVision Engineering Paper"
            onClick={() => setPaperOpen(true)}
          >
            <Image
              src="/papers/paper-cover.png"
              alt=""
              width={696}
              height={900}
              sizes="(max-width: 700px) 230px, (max-width: 800px) 235px, 265px"
            />
            <span className="overview-paper-open" aria-hidden="true">↗</span>
          </button>
          <div className="overview-paper-feature-copy">
            <h2 id="overview-paper-heading">SpaceVision Engineering Paper</h2>
            <p>The research behind every route in SpaceVision.</p>
          </div>
        </section>

        <section className="overview-story" aria-labelledby="overview-origin">
          <div className="overview-story-copy">
            <h2 id="overview-origin">The night I found the paper</h2>
            <p>
              At 1:32 a.m. in my Dublin School dorm, I was finishing a video
              about quantum computers when a Starcloud newsletter arrived. It
              was the first I’d heard of AI data centers in orbit. I opened
              their paper that night.
            </p>
          </div>
          <figure className="overview-figure">
            <Image
              src="/overview/desk.jpg"
              alt="A dorm desk at night with a laptop, a lamp, and notebooks on the shelf."
              width={1620}
              height={1080}
              sizes="(max-width: 800px) 100vw, 520px"
              style={{ width: "100%", height: "auto" }}
            />
            <figcaption>The desk at Dublin School.</figcaption>
          </figure>
        </section>

        <section className="overview-section" aria-labelledby="overview-questions">
          <h2 id="overview-questions">The question I tried to answer</h2>
          <p className="overview-prose">
            The paper explained the orbital hardware. I still wanted to know
            what one ordinary prompt would look like from the ground: how far
            it would travel, how long that would take, and where cooling water
            entered the comparison. I made SpaceVision to explore that.
          </p>
        </section>

        <section className="overview-story overview-story-reverse" aria-labelledby="overview-sketch">
          <div className="overview-story-copy">
            <h2 id="overview-sketch">My first sketch</h2>
            <p>
              I went through research on data-center cooling and satellite
              links, then sketched a globe with a location pin and a place to
              send a prompt. That drawing became SpaceVision.
            </p>
          </div>
          <figure className="overview-figure overview-sketch-figure">
            <div className="overview-sketch-frame">
              <Image
                src="/overview/sketch.jpg"
                alt="A handwritten sketch of a globe, a glass message box, a location pin, and satellites."
                width={1600}
                height={2133}
                sizes="(max-width: 800px) 75vw, 375px"
              />
            </div>
            <figcaption>The first SpaceVision sketch.</figcaption>
          </figure>
        </section>

        <section className="overview-section" aria-labelledby="overview-model">
          <h2 id="overview-model">What SpaceVision models</h2>
          <p className="overview-prose">
            Move the pin to choose where the request begins, then send a prompt.
            A real AI model writes the replies. The ground and orbital routes,
            travel times, and cooling-water comparison are modeled, with the
            assumptions labeled alongside the results.
          </p>
        </section>

        <div className="overview-end">
          <button type="button" className="overview-back" onClick={onBack}>
            Back to SpaceVision <span aria-hidden="true">↗</span>
          </button>
        </div>
      </article>
      {paperOpen && <EngineeringPaperViewer onClose={() => setPaperOpen(false)} />}
    </div>
  );
}
