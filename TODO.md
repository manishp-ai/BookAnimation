# TODO

Open items with enough detail to act on without rediscovering them.

## book-kit

- `src/book-kit/orbit.js` — `shortestAngleTo` has no caller. It was used to
  spring the book back to front-on when a rotation drag ended; that behaviour
  was deliberately dropped (a real object stays where it is set down). The
  function is correct and is a reasonable thing for a consumer of the package
  to want, so it was kept rather than deleted unasked. Decide: keep as public
  API and say so in the README, or remove it with its test.

## Before merge (temporary tooling — none of this ships)

- `tools/inspect.html`, `tools/inspect.mjs`, `tools/invariants.mjs`,
  `_spine-shot.html`, the `shotSink` middleware in `vite.config.js`, and the
  `reference-flipbook` entry in `.claude/launch.json`.
- `_shots/` is untracked and gitignored now, so captures no longer reach the
  repo — but 216 of them are still in history, and the directory is still on
  disk and still written to by `shotSink`. It goes away with the middleware
  above; nothing else needs doing for it.
- `tools/inspect.html` is also stale: it still contains the `.library` nav and
  the three `.page-button` controls that were removed from `index.html`.
- `public/books/world-passport/spine.jpg` is orphaned — nothing loads it.

## Carried over

- Mobile (max-width 620px) and reduced-motion passes on the closing step.
- A real-browser pass on rotation feel. The preview sandbox used in these
  sessions never fires `requestAnimationFrame` (`document.visibilityState` is
  permanently `hidden`), so anything that only reaches the screen through the
  render loop cannot be verified there.
- Whether the soft covers want the same out-of-plane unit fix the leaves got.
  They cannot overhang anything, so it is cosmetic and was left alone.
- CHANGELOG entry for the case-binding rebuild itself, as opposed to the fixes
  layered on top of it.
