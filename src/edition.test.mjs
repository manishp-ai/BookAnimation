import assert from "node:assert/strict";
import test from "node:test";
import { EDITION_KEYS, editionUrl, loadEdition, mergeEdition, unknownEditionKeys } from "./edition.js";
import {
  SPINE_LABEL_DEFAULTS,
  fitSpineLabel,
  normaliseSpineLabel,
  spineLabelText,
  trackedWidth,
} from "./spine-label.js";

const BOOK = {
  id: "world-passport",
  title: "World Passport",
  mark: "W",
  ratio: 0.6667,
  thickness: 0.036,
  coverThickness: 0.0032,
  coverStyle: "soft",
  case: { front: "/a.jpg", back: "/b.jpg", paper: "/c.jpg" },
  pages: ["/p.jpg", "/p.jpg"],
};

const respond = (body, ok = true) => ({ ok, json: async () => body });

test("an edition file lives beside its book's artwork, under whatever base the site is served from", () => {
  assert.equal(editionUrl("world-passport"), "/books/world-passport/edition.json");
  assert.equal(editionUrl("world-passport", "/passport/"), "/passport/books/world-passport/edition.json");
  // A base without its trailing slash is the usual way to get a broken URL.
  assert.equal(editionUrl("x", "/sub"), "/sub/books/x/edition.json");
});

test("a patch may set the content on the outside of the book, and nothing else", () => {
  const merged = mergeEdition(BOOK, {
    title: "  Another Passport  ",
    mark: "A",
    case: { front: "/new-front.jpg" },
    spine: { text: "Another" },
    // Structure is not the edition file's to set.
    ratio: 9,
    thickness: 9,
    pages: [],
  });
  assert.equal(merged.title, "Another Passport", "trimmed");
  assert.equal(merged.mark, "A");
  assert.equal(merged.case.front, "/new-front.jpg");
  assert.equal(merged.case.back, BOOK.case.back, "an unset artwork keeps the built-in one");
  assert.equal(merged.case.paper, BOOK.case.paper);
  assert.equal(merged.spine.text, "Another");
  assert.equal(merged.ratio, BOOK.ratio, "structure is untouched");
  assert.equal(merged.thickness, BOOK.thickness);
  assert.deepEqual(merged.pages, BOOK.pages);
});

test("an empty, absent, or malformed patch leaves the built-in edition alone", () => {
  for (const patch of [null, undefined, {}, "nonsense", 7, { title: "   " }, { case: "nope" }]) {
    const merged = mergeEdition(BOOK, patch);
    assert.equal(merged.title, BOOK.title, `title survives ${JSON.stringify(patch)}`);
    assert.deepEqual(merged.case, BOOK.case, `case survives ${JSON.stringify(patch)}`);
    assert.equal(merged.spine.text, "", "no label unless one is asked for");
  }
});

test("a key the edition file should not have is reported rather than silently ignored", () => {
  assert.deepEqual(unknownEditionKeys({ title: "x", $schema: "y", ratio: 1, pages: [] }), ["ratio", "pages"]);
  assert.deepEqual(unknownEditionKeys({ ...Object.fromEntries(EDITION_KEYS.map((k) => [k, "v"])) }), []);
  assert.deepEqual(unknownEditionKeys(null), []);
});

test("a missing or broken edition file costs the label, never the book", async () => {
  const warnings = [];
  const warn = (message) => warnings.push(message);

  // 404 is the ordinary case for an edition that overrides nothing, so it is
  // not worth a warning.
  const missing = await loadEdition(BOOK, { fetchImpl: async () => respond(null, false), warn });
  assert.equal(missing.title, BOOK.title);
  assert.equal(warnings.length, 0);

  const broken = await loadEdition(BOOK, {
    fetchImpl: async () => ({ ok: true, json: async () => { throw new SyntaxError("Unexpected token }"); } }),
    warn,
  });
  assert.equal(broken.title, BOOK.title, "falls back to the built-in edition");
  assert.equal(broken.spine.text, "");
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Unexpected token/);

  const offline = await loadEdition(BOOK, { fetchImpl: async () => { throw new TypeError("Failed to fetch"); }, warn });
  assert.equal(offline.title, BOOK.title);

  // No fetch at all (a non-browser host) is not an error either.
  const noFetch = await loadEdition(BOOK, {});
  assert.equal(noFetch.title, BOOK.title);
  assert.equal(noFetch.spine.text, "");
});

test("a good edition file is applied, and stray keys are called out", async () => {
  const warnings = [];
  const merged = await loadEdition(BOOK, {
    fetchImpl: async () => respond({ title: "Ok", coverStyle: "rigid", spine: { text: "Ok" } }),
    warn: (m) => warnings.push(m),
  });
  assert.equal(merged.title, "Ok");
  assert.equal(merged.spine.text, "Ok");
  assert.equal(merged.coverStyle, BOOK.coverStyle, "a structural key in the file changes nothing");
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /coverStyle/);
});

test("a spine label falls back field by field rather than throwing on a typo", () => {
  const label = normaliseSpineLabel({
    text: "  Atlas  ",
    size: 99,          // out of range
    tracking: -4,      // out of range
    opacity: "loads",  // wrong type
    direction: "sideways", // not a direction
    weight: "bold",    // a keyword is legal CSS
    uppercase: false,
  });
  assert.equal(label.text, "Atlas");
  assert.equal(label.size, 0.95, "clamped to the top of the range");
  assert.equal(label.tracking, 0, "clamped to the bottom");
  assert.equal(label.opacity, SPINE_LABEL_DEFAULTS.opacity, "wrong type falls back");
  assert.equal(label.direction, SPINE_LABEL_DEFAULTS.direction);
  assert.equal(label.weight, "bold");
  assert.equal(spineLabelText(label), "Atlas", "uppercase can be turned off");
  assert.equal(spineLabelText(normaliseSpineLabel({ text: "Atlas" })), "ATLAS", "caps by default");
});

test("tracking is counted between letters, not after the last one", () => {
  const measure = () => 10;
  // 3 glyphs at 10 + 2 gaps of 100 * 0.5
  assert.equal(trackedWidth([..."abc"], measure, 100, 0.5), 30 + 100);
  assert.equal(trackedWidth([..."a"], measure, 100, 0.5), 10, "one letter has no gap");
  assert.equal(trackedWidth([], measure, 100, 0.5), 0);
});

test("the type is sized by the spine's width, then shrunk if the word runs off the end", () => {
  const measure = (character, fontPx) => fontPx * 0.6;
  const label = normaliseSpineLabel({ text: "AB", size: 0.5, tracking: 0, fill: 1 });

  // Width-limited: a tall spine has room to spare, so 0.5 of the width wins.
  const roomy = fitSpineLabel(label, { width: 100, height: 4000 }, measure);
  assert.equal(roomy.fontPx, 50);

  // Length-limited: two glyphs at 0.6em each need 60 and only 30 is allowed.
  const tight = fitSpineLabel(label, { width: 100, height: 30 }, measure);
  assert.ok(tight.fontPx < 50, "shrunk to fit");
  assert.ok(tight.length <= 30 + 1e-9, `the word fits the spine: ${tight.length}`);

  assert.equal(fitSpineLabel(normaliseSpineLabel({ text: "" }), { width: 10, height: 10 }, measure), null);
  assert.equal(fitSpineLabel(label, { width: 0, height: 10 }, measure), null, "no spine, no label");
});
