// read-as-book — a "Read as book" page-turning viewer for any website.
//
//   mountFlipbook(el, { pages, aspect })  — the page-turn utility on its own
//   openBookViewer({ pages, aspect })     — the full-screen reader built on it
//   loadBookManifest(url)                 — read a manifest.json from the CLI
//
// The React component lives at "read-as-book/react"; the default styles at
// "read-as-book/styles.css".

export { mountFlipbook, fitPageSize } from "./flipbook.js";
export type { Flipbook, FlipbookOptions } from "./flipbook.js";

export { openBookViewer } from "./viewer.js";
export type { BookViewer, BookViewerOptions } from "./viewer.js";

/** Shape written by the `read-as-book-pages` CLI. */
export type BookManifest = {
  generatedFrom: string;
  pageCount: number;
  /** Page aspect ratio (width / height), taken from page 1. */
  aspect: number;
  /** Page image paths, relative to the web root they were rendered under. */
  pages: string[];
};

/**
 * Fetch a manifest.json produced by the CLI and resolve its page paths against
 * the manifest's own URL, so the result can be handed straight to the viewer.
 */
export async function loadBookManifest(
  manifestUrl: string,
  init?: RequestInit,
): Promise<BookManifest & { pages: string[] }> {
  const res = await fetch(manifestUrl, init);
  if (!res.ok) {
    throw new Error(`read-as-book: could not load ${manifestUrl} (${res.status})`);
  }
  const manifest = (await res.json()) as BookManifest;
  const base = new URL(manifestUrl, globalThis.location?.href ?? "http://localhost/");
  return {
    ...manifest,
    // Manifest paths are web-root relative; the images sit next to the
    // manifest, so resolve each against its directory.
    pages: manifest.pages.map((p) => new URL(p.split("/").pop()!, base).toString()),
  };
}
