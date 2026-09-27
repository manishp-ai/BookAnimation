// Hand-composed (not via compose_pages.py): covers only, no photographs.
// page-00 = /home/Fool/Downloads/passport.png (front cover art, as supplied)
// page-03 = /home/Fool/Downloads/passport-back.png (back cover art, as supplied)
// page-01/02 are blank passport-paper leaves, reused many times over to give
// the bound edition real thickness: no content was invented to fill them,
// the same two textures are just repeated (main.js caches by source, so this
// costs one extra texture load, not one per leaf).
const INTERIOR_LEAVES = 90; // sheets of blank paper between the two covers — room for stamps/seals
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
    "pages": [
      "/books/world-passport/page-00.jpg",
      ...blankLeaves,
      "/books/world-passport/page-03.jpg"
    ]
  }
];
