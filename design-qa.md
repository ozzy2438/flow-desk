# Product design QA

## Comparison setup

- Source visual truth: `reference-simple-composer.png`, `reference-simple-planning.png`, and `reference-simple-live.png`, supplied by the user from the Omar reference flow.
- Rendered implementation: `implementation-simple-home.png`, `implementation-simple-planning.png`, and `implementation-simple-live.png`.
- Combined comparison input: `design-qa-simple-comparison.png`.
- Implementation viewport: Codex in-app browser at 1102 x 874 CSS pixels with 1x capture density.
- Source pixels: composer 555 x 383, planning 682 x 808, live 1310 x 724.
- Implementation pixels: 1102 x 874 for each captured state. The combined page normalized each reference/implementation pair by rendered width; video chrome and presenter overlays in the source were excluded from fidelity findings.
- States: empty research composer, active Planning split, and completed live parallel browser rails.

## Full-view and focused comparison

- Full-view: all three state pairs were placed in one browser-rendered comparison input and inspected for composition, density, hierarchy, sequence, and screen treatment.
- Focused composer region: verified one prompt, one flow-count control, one Desktop/Mobile control, and one circular submit action with no source setup or product explanation competing above the fold.
- Focused Planning region: verified the original request remains visible, requested flow count is preserved, the plan is numbered, each flow has a concise source/goal/status, and Planning remains visible long enough to read.
- Focused live region: verified horizontal browser screens, one status per flow, live labeling, and removal of event logs, JEV badges, job-decision counters, and large handoff cards.

## Required fidelity surfaces

- Typography: system sans-serif, compact semibold headings, subdued metadata, readable 11-16 px control and body text, and no broken wrapping or truncation in the tested states.
- Spacing and layout: centered composer, 22 px container radius, restrained shadow, compact plan rows, and border-separated live flows match the reference's quiet vertical rhythm.
- Colors and tokens: white canvas, near-black text, neutral gray secondary text and surfaces, a single black action, and red used only for the live screen indicator.
- Image quality: browser screenshots use the stored full-resolution PNG artifacts with top-aligned crops and open in a full-size modal. The local fixture content is intentionally plainer than the reference's flight sites; this is source content, not replacement artwork.
- Copy and content: primary copy describes research, planning, flows, and browser progress. Job evaluation terminology and internal system events are absent from the core journey.
- Responsiveness and accessibility: controls remain labeled and keyboard-addressable; Desktop/Mobile and flow slider state changes were verified; horizontal screenshot overflow is deliberate and scrollable.

## Comparison history

- Pass 0 — P1: the previous run UI exposed handoff warnings, internal event logs, JEV badges, and Found/Apply/Review/Skip counters as primary content. Fix: replaced it with the three-state Research -> Planning -> Live browser journey and moved signed-in-source help into one collapsed secondary disclosure.
- Pass 1 — P2: the complete Planning list remained above the live browsers, making the screen feel long and delaying the useful visual output. Fix: keep Planning expanded during the planning beat, then collapse it to one summary row as soon as live research takes over.
- Pass 2 — P2: workers completed too quickly for the Planning state to be legible. Fix: hold the readable plan for three seconds and raise the default visual step pace from 350 ms to 800 ms without changing execution correctness.
- Pass 3: combined comparison found no remaining actionable P0, P1, or P2 differences. The selected flow count and researched sites intentionally differ from the reference content.

## Interaction and runtime checks

- Tested flow count changes, Desktop/Mobile selection, submit/loading, requested-count split, live SSE updates, plan-to-live transition, screenshot modal open/close, and return/new-research navigation.
- A fresh final browser tab reported zero console errors or warnings.
- Automated validation: typecheck and lint passed; 21 test files and 95 tests passed.

final result: passed
