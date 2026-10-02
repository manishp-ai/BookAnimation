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
- A real-browser pass on rotation *feel*, and on turning a shut book over to
  re-seat it. Both are covered by a node harness that drives the real
  controller; the re-seat has still not been watched happen on screen.
  `requestAnimationFrame` does now fire in the preview sandbox — it did not in
  the 2026-10-01/02 sessions — so this is finally checkable by driving the app
  with pointer events, as the ground-shadow fix was.
- Reinstating a scene harness, if deeper geometry work is ever needed again.
  The one removed here exposed the live scene on `globalThis.__binding` behind
  a `__BINDING_HARNESS__` flag, with offscreen render-target capture posting
  PNGs to a dev-only middleware. It is reconstructable from the 2026-10-01 and
  2026-10-02 CHANGELOG entries; it was deleted because none of it ships, not
  because it was wrong.
- Whether the soft covers want the same out-of-plane unit fix the leaves got.
  They cannot overhang anything, so it is cosmetic and was left alone.
- The ground shadow still shows a little between roughly a tenth and a third
  of a turn, where it is fading faster than the slab is growing but has not
  caught up. Bounded by what the book casts lying still, so it is within the
  rule, but a shadow that stayed attached to the book instead of fading would
  be better. The way to get it is a dedicated near-overhead caster for the
  table only — measured sound (it leaves the book pixel-identical) and blocked
  only by `Object3D.layers` not filtering shadow *receiving* in three r0.185.
  A custom material sampling one light's shadow map would do it. See the
  2026-10-02 CHANGELOG entry for the measurements.
- CHANGELOG entry for the case-binding rebuild itself, as opposed to the fixes
  layered on top of it.
