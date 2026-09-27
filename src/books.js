// Hand-composed (not via compose_pages.py): covers only, no photographs.
// The edition is described the way a bound book is actually made — a case and
// a text block, separately:
//
//   case.front = /home/Fool/Downloads/passport.png      (front board artwork)
//   case.back  = /home/Fool/Downloads/passport-back.png (back board artwork)
//   case.paper = the endpaper/pastedown stock, also used for the spine liner
//   pages      = the text block's leaves only
//
// The leaves are blank passport-paper, reused many times over to give the
// bound edition real thickness: no content was invented to fill them, the same
// two textures are just repeated (main.js caches by source, so this costs one
// extra texture load, not one per leaf).
const INTERIOR_LEAVES = 90; // sheets of blank paper in the text block — room for stamps/seals
const blankLeaves = Array.from(
  { length: INTERIOR_LEAVES * 2 },
  (_, index) => `/books/world-passport/page-0${index % 2 === 0 ? "1" : "2"}.jpg`,
);

export const books = [
  {
    "id": "world-passport",
    "title": "World Passport",
    "mark": "W",
    "ratio": 0.6667,
    // Finished closed thickness and board calliper, in the same units as
    // `ratio` (a leaf is 1.0 tall). 0.036 is the thickness the edition already
    // had, conserved exactly so the closed book is the size it always was.
    "thickness": 0.036,
    "coverThickness": 0.0032,
    // "soft"  — limp covers that curve out of the joint with the leaves.
    // "rigid" — flat boards with real calliper, a hardcover case.
    // This is the only switch; nothing else changes between the two.
    "coverStyle": "soft",
    "case": {
      "front": "/books/world-passport/page-00.jpg",
      "back": "/books/world-passport/page-03.jpg",
      "paper": "/books/world-passport/page-01.jpg"
    },
    "pages": blankLeaves
  }
];
