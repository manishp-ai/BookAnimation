/**
 * Runtime edition content.
 *
 * `src/books.js` describes how the book is *built* — its proportions, its
 * calliper, how many leaves are in the text block. Those are structural and a
 * change to them is a change to the model, so they stay in code.
 *
 * What goes on the outside of the book is content: the title, the artwork on
 * the two boards, the name down the spine. That lives in
 * `public/books/<id>/edition.json`, is fetched at run time, and is merged over
 * the built-in edition. Editing it and reloading is the whole update method —
 * no rebuild, because `public/` is served verbatim in dev and copied verbatim
 * into `dist/`.
 *
 * Every failure mode falls back to the built-in edition and warns: a missing
 * file is the normal case for an edition that has nothing to override, and a
 * malformed one must not cost anyone the book.
 */

import { normaliseSpineLabel } from "./spine-label.js";

export const EDITION_FILE = "edition.json";

/** The only keys an edition file may set. Anything else is ignored. */
export const EDITION_KEYS = ["title", "mark", "spine", "case"];
const CASE_KEYS = ["front", "back", "paper"];

export function editionUrl(bookId, baseUrl = "/") {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${base}books/${bookId}/${EDITION_FILE}`;
}

const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;

/**
 * Merge a patch over a built-in edition. Pure, so the precedence rules are
 * testable without a browser: a patch may replace a title, a mark, any of the
 * three case artworks, and the spine label; it may not touch the structure or
 * add keys of its own.
 */
export function mergeEdition(book, patch) {
  const merged = { ...book, spine: normaliseSpineLabel(patch?.spine ?? book.spine) };
  if (!patch || typeof patch !== "object") return merged;

  if (nonEmpty(patch.title)) merged.title = patch.title.trim();
  if (nonEmpty(patch.mark)) merged.mark = patch.mark.trim();

  if (patch.case && typeof patch.case === "object") {
    const next = { ...book.case };
    for (const key of CASE_KEYS) if (nonEmpty(patch.case[key])) next[key] = patch.case[key].trim();
    merged.case = next;
  }
  return merged;
}

/**
 * Report which keys an edition file used and which it should not have, so a
 * typo shows up in the console instead of silently doing nothing.
 */
export function unknownEditionKeys(patch) {
  if (!patch || typeof patch !== "object") return [];
  return Object.keys(patch).filter((key) => !EDITION_KEYS.includes(key) && !key.startsWith("$"));
}

/**
 * Fetch and apply `edition.json` for one book. `fetchImpl` and `warn` are
 * injected so this is testable and so the caller owns the logging.
 */
export async function loadEdition(book, { baseUrl = "/", fetchImpl, warn = () => {} } = {}) {
  if (typeof fetchImpl !== "function") return mergeEdition(book, null);
  const url = editionUrl(book.id, baseUrl);
  try {
    const response = await fetchImpl(url, { cache: "no-cache" });
    // 404 is the ordinary case for an edition that overrides nothing.
    if (!response?.ok) return mergeEdition(book, null);
    const patch = await response.json();
    const stray = unknownEditionKeys(patch);
    if (stray.length) warn(`${url}: ignoring unknown key(s): ${stray.join(", ")}`);
    return mergeEdition(book, patch);
  } catch (error) {
    warn(`${url}: ${error instanceof Error ? error.message : String(error)} — using the built-in edition`);
    return mergeEdition(book, null);
  }
}
