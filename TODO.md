# TODO

Open items with enough detail to act on without rediscovering them.

## book-kit

- `src/book-kit/orbit.js` — `shortestAngleTo` has no caller. It was used to
  spring the book back to front-on when a rotation drag ended; that behaviour
  was deliberately dropped (a real object stays where it is set down). The
  function is correct and is a reasonable thing for a consumer of the package
  to want, so it was kept rather than deleted unasked. Decide: keep as public
  API and say so in the README, or remove it with its test.

## Carried over

- Mobile (max-width 620px) and reduced-motion passes on the closing step.
- A real-browser pass on rotation feel. The preview sandbox used in these
  sessions never fires `requestAnimationFrame` (`document.visibilityState` is
  permanently `hidden`), so anything that only reaches the screen through the
  render loop cannot be verified there.
- The pale band down the right of the book in Boss's 2026-10-02 report was
  never reproduced. The missing square was a real defect and fixing it
  measurably helped, but an A/B of that exact view looked the same before and
  after. Need to know which moment shows it before changing anything — a blind
  fix in this area is what caused the `0f47067` regression.
- Reinstating a scene harness, if deeper geometry work is ever needed again.
  The one removed here exposed the live scene on `globalThis.__binding` behind
  a `__BINDING_HARNESS__` flag, with offscreen render-target capture posting
  PNGs to a dev-only middleware. It is reconstructable from the 2026-10-01 and
  2026-10-02 CHANGELOG entries; it was deleted because none of it ships, not
  because it was wrong.
- Whether the soft covers want the same out-of-plane unit fix the leaves got.
  They cannot overhang anything, so it is cosmetic and was left alone.
- CHANGELOG entry for the case-binding rebuild itself, as opposed to the fixes
  layered on top of it.
