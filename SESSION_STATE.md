# Session State — updated 2026-10-02 (the pale band, then the backdrop)

Status: COMPLETE
Task: Fix the pale band beside a rotated open book; verify the turn-over
re-seat on screen; make the book an object with no backdrop of its own.
Branch / worktree: `fix/passport-spine-hinge`   Recovery point: `963298e`

Done:
- The pale band. Reproduced and identified: not geometry, but the key light's
  cast shadow landing on the fixed table plane once the book is spun off flat.
  An A/B that changed one thing — hiding the table — removed the band and left
  the book pixel-identical. Fixed with `groundShadowStrength(spin)` in
  `src/book-kit/orbit.js` and `updateGroundShadow()` in `src/main.js`.
  Committed as `debb7f4`.
- The turn-over re-seat, watched on screen at last. Both directions:
  shut at the end -> turned over -> "Cover" -> opens at Spread 1 of 92 (the
  fresh read Boss asked for); shut at the start -> turned over -> "Back cover"
  -> opens at Spread 91 of 92. Artwork upright and the hinge on the correct
  side at every step, nothing jumping at the swap.
- No backdrop. `scene.background = null`, renderer `alpha: true` clearing to
  transparent, and every `background: #fff` gone from `src/style.css`. Checked
  against a checkerboard set on the host page: the book composites onto it with
  no plate and no edge fringe, shut, open and rotated.
- Fixed what that change exposed: the loading pulse was hard-coded `#111` and
  invisible on a dark host. It takes `currentColor` now, with `color-scheme:
  light dark` and a `light-dark()` colour on `:root`, plus light/dark
  `theme-color` variants.
- `npm test` 99/99, `npm run build` clean, no console errors.

In flight:
- Nothing.

Not started:
- Nothing for either request.

Blocked on:
- Nothing.

Danger:
- Nothing. No geometry, lighting or material was changed by either piece of
  work; the book itself renders as it did.

Resume by:
- Picking up `TODO.md`. The mobile and reduced-motion passes on the closing
  step are the largest remaining item.

Note: `requestAnimationFrame` DOES fire in this preview sandbox now
(`document.visibilityState` is `visible`), which is what finally allowed the
re-seat to be verified on screen. The 2026-10-01 and earlier 2026-10-02
sessions recorded it as permanently hidden. Note also that the `computer` key
action must send `ArrowRight`, not `Right` — the controller matches
`event.key === "ArrowRight"` and the short name silently does nothing.
