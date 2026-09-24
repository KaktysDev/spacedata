# Critique of the Stage 2–5 shell

The simulator works. It also looks like a lab notebook pinned over a map. The thing Oleh asked for — ask, watch the path, read Space against Ground — is the last thing on the page.

## Hierarchy

The first screen is six equal cards. The dotted map, which is the only reason this is a simulator, is a leftover band. The chat field, which is the only action, sits under a two-column paper appendix and a citation paragraph, so on a laptop you scroll to send. The viewport is locked to `h-dvh` and then the column inside it scrolls. That is a layout bug dressed up as density.

## What the metrics actually say

Tokens and IT kilowatt-hours are the same number on both sides. Same duty cycle, same stand-in rate. Two cards to report “no difference.” PUE 1.040 versus 1.050 is a shell stand-in that does not tick, and “1.040 · 96.4%” does not fit a phone: the percent drops onto its own line and the ground row collides with it. The kicker “H100 TOKEN STAND-IN” wraps as “STAND- / IN”.

Cost, water, and latency are the Starcloud story. Capacity factor and the ten-year $8.2M / $167M belong once, quietly, not as a second dashboard under the cards.

## The same facts, three times

Live cards, then “Session 13.8 kWh · $0.028 · 0.00 L · 44.70M tok” on each panel, then the ten-year line items, then the wholesale-price paragraph. The comparison after a prompt repeats it again: four tiles, a tok/Wh/mL/ms line under each answer, and a footnote that restates the multiple, the chiller share, the 22× caveat, and the paper title. “Space tokens” is sample noise between two draws of one model, not a venue advantage. Per-reply milliliters are a speck; the billion-token scale is the number a person can read.

## Copy

“Shell duty,” “shell ms,” “PUE shell,” and “Ground adds the 5% chiller share” are notes to the author. Stand-ins live in `constants.ts`. The live shell should not narrate its own caveats in 10px type.

## Water and the scene

The cups are postage stamps, and the ground cup empties and reprints `×16`. That reads as a glitch. One cup, filling and settling, next to a liter count, is the instrument.

The satellites, antenna, and campus are readable once the camera is close, and the route traces are the best part of the page. They do not get the vertical room, because the cards and the paper table take it. Hiding the bottom panel mid-flight would also resize the canvas and jump the layout. The scene has to stay a stable size while the camera moves.

## Chat

Enter submits, which is right, and then the draft is wiped before anyone knows the request succeeded. A missing key still says to set `XAI_API_KEY` or `OPENAI_API_KEY`. The recovery button is labeled “40 MW baseline,” which is not what it does. The comparison `scrollIntoView` effect depends only on reduced-motion, so a second prompt does not bring the new result into view. The provider is the wrong one: this pass is Gemini only.

## Keep

The map, the three objects, the uplink → split → pullback path, live cost and water, the latency gap, two short answers, and a closed Sources disclosure for the paper. Black, white, and blue only on water.
