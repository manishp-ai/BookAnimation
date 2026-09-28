# World Passport — 3D flipbook

An interactive 3D page-turning book (Three.js + Quick FlipBook). Drag, click,
or use the arrow keys to turn pages. The ⟲ button toggles a drag-to-orbit view
of the closed book — spin it freely, tilt it within a clamp, and see its bound
spine and page-block thickness from the side.

```bash
npm ci
npm run dev     # http://127.0.0.1:5173/
```

Verify with `npm test` (28 tests) and `npm run build`. `dist/` is a static site.

## This edition

Covers only — no photographs.

| Page | Source |
| --- | --- |
| `page-00.jpg` | `~/Downloads/passport.png` — front cover art, used as supplied |
| `page-01.jpg`, `page-02.jpg` | blank passport-paper leaves, repeated |
| `page-03.jpg` | `~/Downloads/passport-back.png` — back cover art, used as supplied |

Pages are 1200×1800 (2:3, matching both source images exactly, so neither is
cropped); `ratio` in `src/books.js` is 0.6667.

The interior is 180 blank pages (90 sheets) — the same two blank-leaf images
reused, not new content — so the edition has real room for stamps/seals and
reads as a thick, well-bound volume rather than a thin pamphlet. `INTERIOR_LEAVES`
in `src/books.js` controls the count; each repeat costs no extra texture load
(`main.js` caches materials by source URL). To add real interior pages, drop
images into `public/books/world-passport/` at 1200×1800 and list them in
`src/books.js` between the covers, keeping the total even — or recompose the
whole book with the skill's `scripts/compose_pages.py`, which is what
generated the template originally.

Unlike a skill-generated book, `src/books.js` here was written by hand, so
re-running `compose_pages.py` will overwrite it.

## Updating the cover art and the spine — `edition.json`

What is printed on the *outside* of the book is content, not structure, so it
lives in a JSON file that is read at run time:

    public/books/world-passport/edition.json

Edit it and reload the page. No rebuild: `public/` is served verbatim by the
dev server and copied verbatim into `dist/`, so the same file is editable on a
deployed site. `edition.schema.json` sits beside it, so an editor that honours
`$schema` will complete and validate the fields as you type.

```json
{
  "title": "World Passport",
  "mark": "W",
  "case": {
    "front": "/books/world-passport/page-00.jpg",
    "back":  "/books/world-passport/page-03.jpg",
    "paper": "/books/world-passport/page-01.jpg"
  },
  "spine": { "text": "World Passport", "size": 0.4, "tracking": 0.32 }
}
```

To change the **cover photographs**, drop the images into
`public/books/world-passport/` and point `case.front` / `case.back` at them.
The spine is cropped from `case.front`'s binding edge, so the two always match
and the wrap around the joint stays seamless — change the front artwork and
the spine follows it.

To change the **spine lettering**, set `spine.text`. Sizes are fractions of
the spine itself rather than pixels, so the label is the same size on the
finished book whatever resolution the artwork is:

| Field | What it does |
| --- | --- |
| `text` | The words. `""` or omitted leaves the spine as bare artwork. |
| `size` | Cap height as a fraction of the spine's width. |
| `tracking` | Space between letters, in ems. A narrow spine needs a lot. |
| `fill` | How much of the spine's length the words may fill before the type is shrunk to fit. |
| `direction` | `down` reads top-to-bottom with the book face up (UK/US); `up` reads bottom-to-top (continental). |
| `offset` | Centre line across the spine's width; `0.5` is centred. |
| `family`, `weight`, `color`, `opacity`, `uppercase` | Type and ink. Opacity below 1 lets the artwork through, which is how blind stamping reads. |
| `halo`, `haloColor` | Spread of the soft dark edge behind each letter, in ems. The artwork under the label runs near-black to near-white, so type of any one colour loses contrast somewhere along the word; the halo gives every letter its own background. `0` turns it off. |

Every field is optional and falls back on its own — a typo costs you that one
value, never the book. A missing `edition.json` is normal and silent; a
malformed one warns in the console and the built-in edition from
`src/books.js` is used instead.

Structural properties — `ratio`, `thickness`, `coverThickness`, `coverStyle`,
the leaves — are deliberately *not* settable here. Changing those changes the
model rather than the content, so they stay in `src/books.js`.

The spine is lettered in DejaVu Sans Bold, subset to the characters a spine
needs and self-hosted from `public/fonts/` (Bitstream Vera licence — see
`THIRD_PARTY_NOTICES.md`). A spine is read small, at an angle, over whatever
the cover artwork is doing underneath, which wants a face with a large
x-height and open apertures — not a display face and not a coding mono.

## Orbit view and spine (`src/orbit.js`)

The ⟲ toggle hands the closed book's rotation to the pointer: horizontal drag
spins it without limit (`OrbitSpring` + `nextOrbitTarget`, both spring
constants and the tilt clamp carried over from the reference implementation
at `~/AshenPress/index.html:963-970,1477-1483`), vertical drag tilts it within
±0.62 rad, and releasing eases it back to flat along the shorter arc
(`shortestAngleTo`) instead of unwinding every full turn. It's wired up as an
interaction gate in `main.js`, not a change to the existing flip mechanics:
every canvas pointer handler early-returns into the orbit path while the mode
is on, so page-drag logic underneath is untouched when it's off.

A camera looking straight down a closed book's own thickness axis can never
show that thickness — the one thing a true top-down photo of a book cannot
convey. `rebuildCoverSpine` in `main.js` measures the page block's real bounds
each time a book loads and builds a cloth-bound spine box (`spineBoxFromBounds`
in `orbit.js`) that stays a thin ribbon from directly above, the way a real
spine's round always does, but carries the true page-count-driven thickness on
the axis rotation reveals. It's textured with a cropped clone of the back
cover's own art (not a flat fill) and hidden whenever the book is mid-flip,
since no real book shows its spine's colour from inside the open gutter.

## Attribution

See `THIRD_PARTY_NOTICES.md` and `LICENSE-upstream-MIT`. The template is
adapted from `3d-book-2` of HaichaoLihc/create-photo-flipbook-ui (MIT); the
page engine is Quick FlipBook (BSD-2); Three.js is MIT.

The two cover images are user-supplied art whose provenance and rights were
not independently verified. Fine for personal use; confirm rights before
publishing or redistributing this project.
