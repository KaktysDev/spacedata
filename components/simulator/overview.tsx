"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";

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
        <p className="overview-lead">
          SpaceVision asks what changes for a regular person if AI data centers
          move to space.
        </p>
        <p className="overview-deck">
          <a href={LINKEDIN} target="_blank" rel="noreferrer">
            Oleh Lahoda
          </a>{" "}
          built it after{" "}
          <a href={PAPER} target="_blank" rel="noreferrer">
            Starcloud’s paper
          </a>{" "}
          on data centers in orbit. The mission is computers above Earth, cooled
          by space itself. He wanted the part a normal question would actually
          feel.
        </p>

        <section className="overview-section">
          <p className="overview-kicker">01 — The desk</p>
          <h2>1:32 a.m. in a dorm</h2>
          <p>
            I was at my desk in my dorm at Dublin School, in southern New
            Hampshire. It was about 1:32 in the morning. I was finishing a
            YouTube video about quantum computers when a newsletter notification
            came in. It was about Starcloud’s satellites, and how that work was
            moving forward.
          </p>
          <p>
            It was the first time I had heard of AI data centers in space. The
            idea alone amazed me. Then I read their paper.
          </p>
          <figure className="overview-figure">
            <Image
              src="/overview/desk.jpg"
              alt="A dorm desk at night with a laptop, a lamp, and notebooks on the shelf."
              width={1620}
              height={1080}
              sizes="(max-width: 760px) 92vw, 680px"
              style={{ width: "100%", height: "auto" }}
            />
            <figcaption>The desk at Dublin School.</figcaption>
          </figure>
        </section>

        <section className="overview-section">
          <p className="overview-kicker">02 — The questions</p>
          <h2>What the paper left open</h2>
          <p>
            I was shocked, in a good way. Through the rest of the spring I kept
            turning the same questions over. Starcloud could not answer them for
            a regular user. Neither could an AI chatbot.
          </p>
          <ol className="overview-questions">
            <li>For someone like me, how much better is this, really?</li>
            <li>
              How much water do we save if the machines cool in space, instead of
              with water on the ground?
            </li>
            <li>
              The satellites are far away. How much longer does a normal question
              take?
            </li>
          </ol>
        </section>

        <section className="overview-section">
          <p className="overview-kicker">03 — The research</p>
          <h2>Papers, then a sketch</h2>
          <p>
            I started reading PhD research from MIT, Harvard, Princeton, and the
            University of Chicago on AI, data centers, and space communication. I
            questioned their engineering choices. I kept what I could stand
            behind, and I wrote down what I still wanted to see.
          </p>
          <p>
            When the notes were enough, I sketched the app the way I saw it. A
            glass box for the message. A planet you can turn. A pin you can drop
            anywhere, with the view settling on that region. Satellites along
            the side. Zoom out to the whole planet, or in until the place fills
            the screen.
          </p>
          <figure className="overview-figure">
            <Image
              src="/overview/sketch.jpg"
              alt="A handwritten sketch of a globe, a glass message box, a location pin, and satellites."
              width={1600}
              height={2133}
              sizes="(max-width: 760px) 92vw, 680px"
              style={{ width: "100%", height: "auto" }}
            />
            <figcaption>
              First sketch of SpaceVision, drawn before the build.
            </figcaption>
          </figure>
        </section>

        <section className="overview-section">
          <p className="overview-kicker">04 — The build</p>
          <h2>Choices we kept</h2>
          <p>
            The sketch became the app on the SpaceVision tab. These are the
            choices, in plain words. The engineering paper will carry the math.
          </p>
          <div className="overview-choices">
            <div>
              <h3>One question, two paths</h3>
              <p>
                You send one prompt. A ground data center answers it, and a
                modeled orbital data center answers it too. Both show up
                together, so the difference is on the screen.
              </p>
            </div>
            <div>
              <h3>The pin is where you are</h3>
              <p>
                Drop it anywhere on Earth. The distance starts there. The nearest
                marker is a public reference site, and the label says it is a
                model.
              </p>
            </div>
            <div>
              <h3>You can watch the delay</h3>
              <p>
                The camera follows the request out and back, on the ground and
                through the orbital shell. The extra distance is something you
                see, then a number you can read.
              </p>
            </div>
            <div>
              <h3>Water is part of the answer</h3>
              <p>
                Ground sites evaporate water to stay cool. The orbital model
                sheds heat into space and uses no cooling water. That comparison
                is why the results show a cup.
              </p>
            </div>
            <div>
              <h3>Real replies, modeled routes</h3>
              <p>
                A real model writes both answers. The routes use fiber, radio,
                and the speed of light, sped up so you can follow them. Measured
                numbers and assumed numbers are labeled on the page.
              </p>
            </div>
            <div>
              <h3>A shell you can see</h3>
              <p>
                The band of craft draws a sun-synchronous orbit, so the idea of
                computers in space is on the globe. It stands in for the
                Starcloud-2 plan, and the label says it is a model.
              </p>
            </div>
          </div>
        </section>

        <section className="overview-paper" id="engineering-paper">
          <p className="overview-kicker">05 — Later</p>
          <h2>Engineering paper</h2>
          <p>
            A longer paper is in progress. It will go through the technical
            choices, the sources, and the math. When it is ready, it will be
            attached here.
          </p>
        </section>

        <button type="button" className="overview-back" onClick={onBack}>
          Back to SpaceVision
        </button>
      </article>
    </div>
  );
}
