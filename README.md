# read-as-book

A drop-in **“Read as book”** page turner for any website: a real page-curl over
a document's pages, full screen, with keyboard control and a mobile single-page
mode.

The pages are plain images, pre-rendered from a PDF at build time by the
included CLI — so the browser never loads pdf.js, the book opens instantly, and
it works on a purely static host (GitHub Pages, Netlify, S3).

Extracted from the [Ethical Tech CoLab](https://github.com/Ethical-Tech-CoLab)
website, where it powers the report readers.

- **Framework-agnostic core** — `mountFlipbook()` for the page turning alone,
  `openBookViewer()` for the whole reader.
- **React component** — `<ReadAsBook />`.
- **PDF → pages CLI** — `npx read-as-book-pages report.pdf`.
- Styling is a single CSS file of custom properties; no CSS framework required.

## Install

```bash
npm i read-as-book
# optional, only for the PDF-rendering CLI:
npm i -D pdfjs-dist @napi-rs/canvas sharp
```

Not on npm yet? Install straight from GitHub — the package builds itself on
install:

```bash
npm i github:Ethical-Tech-CoLab/read-as-book
```

## 1. Turn your PDF into pages

```bash
npx read-as-book-pages report.pdf \
  --out public/book/pages \
  --base book/pages
```

That writes `p01.webp … pNN.webp` plus a `manifest.json` holding the page list
and aspect ratio. `--base` is the path prefix baked into the manifest, i.e. how
the images are addressed from your web root.

| Option | Default | |
| --- | --- | --- |
| `--out <dir>` | `./pages` | output directory |
| `--scale <n>` | `2` | raster scale; 2 ≈ 150 dpi at Letter |
| `--quality <n>` | `82` | image quality, 1–100 |
| `--format <fmt>` | `webp` | `webp`, `png` or `jpeg` |
| `--prefix <s>` | `p` | page filename prefix |
| `--base <path>` | out dir name | path prefix written into the manifest |
| `--ts <file>` | — | also write a module exporting the manifest |
| `--name <ident>` | `bookManifest` | export name used by `--ts` |

Committing the generated `--ts` module is the sturdiest option for static sites:
the page list is then bundled, so opening the book needs no extra fetch.

## 2. Open the book

### Vanilla JS

```js
import { openBookViewer, loadBookManifest } from "read-as-book";
import "read-as-book/styles.css";

const { pages, aspect } = await loadBookManifest("/book/pages/manifest.json");

document.querySelector("#read").addEventListener("click", () => {
  openBookViewer({ pages, aspect, title: "My report", pdfUrl: "/report.pdf" });
});
```

### React

```jsx
import { ReadAsBook } from "read-as-book/react";
import "read-as-book/styles.css";
import { bookManifest } from "./book-manifest"; // from --ts

<ReadAsBook
  pages={bookManifest.pages.map((p) => `/${p}`)}
  aspect={bookManifest.aspect}
  title="My report"
  pdfUrl="/report.pdf"
/>;
```

The trigger renders as a button; pass `children` for your own label and
`className` to style it with your design system. In Next.js the component is a
client component — import it from a `"use client"` file, or wrap it in one.

### Just the page turning

If you have your own modal, skip the viewer and use the utility directly:

```js
import { mountFlipbook } from "read-as-book";

const book = await mountFlipbook(document.querySelector("#holder"), {
  pages,
  aspect: 0.7727,
  onFlip: (page) => console.log(page),
});

book.next();
book.prev();
book.goTo(4);
book.destroy();
```

`mountFlipbook` handles what the underlying [page-flip
(StPageFlip)](https://github.com/Nodlik/StPageFlip) does not: fitting the spread
to the viewport, collapsing to one page on narrow screens, arrow-key control,
and rebuilding itself on resize while holding the reader's place.

## API

### `mountFlipbook(container, options) → Promise<Flipbook>`

| Option | Default | |
| --- | --- | --- |
| `pages` | — | ordered page image URLs; index 0 is the front cover |
| `aspect` | — | page width ÷ height (Letter portrait ≈ `0.7727`) |
| `startPage` | `0` | page index to open on |
| `singlePageBreakpoint` | `640` | below this viewport width, show one page; `0` to always spread |
| `chromeWidth` / `chromeHeight` | `48` / `150` | px reserved around the book |
| `maxPageHeight` | `1100` | hard cap on page height |
| `flippingTime` | `700` | curl duration in ms |
| `drawShadow` / `maxShadowOpacity` | `true` / `0.4` | page shadow |
| `keyboard` | `true` | bind ← and → |
| `onFlip(page)` / `onReady()` | — | callbacks |

Returns `{ next, prev, goTo, currentPage, pageCount, destroy }`.

### `openBookViewer(options) → Promise<BookViewer>`

Takes `pages`, `aspect`, plus `title`, `pdfUrl`, `startPage`, `className`,
`container`, `hint`, `onFlip`, `onClose`. Returns `{ close, next, prev }`.

### `<ReadAsBook />`

`pages`, `aspect`, `title`, `pdfUrl`, `className`, `children`,
`overlayClassName`, `hint`, `onFlip`, plus `open` / `onOpenChange` for
controlled use.

### `loadBookManifest(url) → Promise<BookManifest>`

Fetches a CLI-generated `manifest.json` and resolves its page paths against the
manifest's own URL.

## Styling

Import `read-as-book/styles.css` for the default dark reader, then override the
custom properties on `.rab-overlay` — or pass `overlayClassName` / `className`
and write your own:

```css
.rab-overlay {
  --rab-backdrop: rgba(20, 16, 12, 0.95);
  --rab-fg: #f4efe7;
  --rab-border: rgba(244, 239, 231, 0.3);
  --rab-z: 200;
}
```

Every element is class-named: `.rab-overlay`, `.rab-chrome`, `.rab-title`,
`.rab-counter`, `.rab-btn`, `.rab-stage`, `.rab-arrow`, `.rab-book`,
`.rab-hint`, `.rab-trigger`.

## Example

```bash
npm install && npm run build
npx serve .        # then open /example/
```

The example runs on generated placeholder pages, and picks up
`example/pages/manifest.json` automatically if you render a real PDF there.

## Notes

- `page-flip` is browser-only. Load the viewer from a client component / effect;
  it is imported dynamically, so it stays out of your main bundle until the
  reader opens.
- Aspect ratio is taken from page 1. Mixed page sizes in one PDF will letterbox.
- Very long documents are many images: keep `--scale` at 2 and `--quality`
  around 82 unless you have a reason otherwise.

## License

MIT © Ethical Tech CoLab
