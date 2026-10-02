# Session State — updated 2026-10-02 (the pale band)

Status: COMPLETE
Task: Find and fix the wide pale band Boss sees beside the book when an open
book is rotated.
Branch / worktree: `fix/passport-spine-hinge`   Recovery point: `963298e`

Done:
- Reproduced the band and identified it. It is not geometry: it is the key
  light's cast shadow landing on the fixed table plane once the book is spun
  off flat. An A/B that changed one thing — hiding the table — removed the
  band and left the book pixel-identical.
- `src/book-kit/orbit.js` — `groundShadowStrength(spin)`, how much ground
  shadow the attitude has earned. Keyed to the spin and never the tilt.
- `src/main.js` — `updateGroundShadow()` on `onBeforeRender`, scaling the new
  `TABLE_SHADOW_OPACITY` and skipping the draw once imperceptible.
- `src/book-kit/index.js` — exported alongside the rest of the orbit maths.
- `npm test` 99/99, `npm run build` clean, no console errors.
  Mutation-checked: returning 1 fails 3 of the new tests, exponent 2 fails the
  one tied to the measurement.
- Measured over 66 poses on the app's exact lighting, importing the shipped
  function: worst cast shadow 13990 ink -> 8857, and what remains at 8857 is
  the book lying flat the other way up, where a shadow belongs. Shut book at
  rest untouched (716px / 413 ink either way).
- Driven live through the real app: opened to a spread, spun to edge-on and to
  a partial turn. No band; the resting contact shadow still reads.
- CHANGELOG entry written, including the three rejected approaches and the
  measurements that rejected them. TODO updated.

In flight:
- Nothing.

Not started:
- Nothing for this request.

Blocked on:
- Nothing.

Danger:
- Nothing. No geometry, lighting or material was changed.

Resume by:
- Picking up `TODO.md`. The two carried items worth most are the mobile and
  reduced-motion passes, and watching the turn-over re-seat happen on screen —
  now possible, see the note below.

Note: `requestAnimationFrame` DOES fire in this preview sandbox now
(`document.visibilityState` is `visible`). The 2026-10-01 and 2026-10-02
sessions recorded it as permanently hidden and worked around it; that
limitation is gone, and the app can be driven and watched directly. The scene
harness removed in `3f49823` is still absent, so the live scene objects are
not reachable from the console — a harness built on the app's own modules
through the dev server works instead, and is what measured this fix.
