# Session Log

## 2026-10-02 — Session Summary

What we did:
- Chased down the pale band Boss reported beside the book. Boss's answer to
  "which moment shows it" — rotating the open book — was the missing piece.
- Built a browser harness on the app's own modules through the dev server
  (the scene harness had been removed before merge), reproducing the app's
  exact camera, lighting, table and materials.
- Ruled out geometry with an ID-buffer render that attributes every pixel to
  a real object in the binding. Nothing pale punches through the covers: the
  median leak across a spin sweep is 17 pixels, and the peaks are the text
  block's own fore edge seen near edge-on, which is legitimate.
- Found the cause with a one-variable A/B: hiding the table removes the band
  and leaves the book pixel-identical. It is the key light's cast shadow
  landing on a world-fixed plane the book has rotated off.
- Measured three fixes and rejected them with numbers (moving the key light,
  separating casters with `Object3D.layers`, a contact-shadow pass). All three
  and their measurements are recorded in CHANGELOG.md.
- Shipped `groundShadowStrength(spin)` in book-kit plus `updateGroundShadow()`
  in main.js, which hands the table's shadow back to the book as it is turned
  over. Committed as `debb7f4`.

What worked:
- `npm test` 99/99 and `npm run build` clean. The 3 new unit tests and 5 new
  contract assertions are mutation-checked: making the function return 1 fails
  3 of them, and dropping the exponent to 2 fails the one tied to the
  measurement, so neither is vacuous.
- Measured over 66 poses importing the shipped function, not a copy of it:
  worst cast shadow 13990 ink -> 8857, and what remains at 8857 is the book
  lying flat the other way up, where a shadow belongs. Shut book at rest
  unchanged at 716px / 413 ink.
- Driven live through the real app with pointer and keyboard events — opened
  to a spread, spun to edge-on and to a partial turn. No band; the resting
  contact shadow still reads under the shut book. Screenshots taken.
- Worth knowing: `requestAnimationFrame` fires in this preview sandbox now. It
  did not in the two prior sessions, which shaped how they verified things.

What's still broken / unfinished:
- Between roughly a tenth and a third of a turn the shadow is fading while the
  slab is still growing, so a little of it is still visible there. It stays
  within the rule (never more ink than the book casts lying still) and a
  harder cut-off would read as the shadow snapping off mid-drag, so it was
  left. Logged in TODO.md with the approach that would remove it properly.
- Carried over, untouched this session: the mobile (max-width 620px) and
  reduced-motion passes on the closing step; whether the soft covers want the
  same out-of-plane unit fix the leaves got; the decision on `shortestAngleTo`,
  which still has no caller; a CHANGELOG entry for the case-binding rebuild
  itself.

Not yet verified:
- The turn-over re-seat shipped in `963298e` has still never been watched
  happen on screen — it is covered by a node harness that drives the real
  controller. Now that RAF fires in the preview, this is finally checkable.
- Rotation *feel* (spring rate, substepping) is covered by unit test only.

Next recommended action:
- Watch the turn-over re-seat happen in the browser: read to the end, shut the
  book, turn it over, open it. It is the one shipped behaviour with no
  on-screen confirmation behind it, and the sandbox can now show it.
