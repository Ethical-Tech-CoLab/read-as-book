#!/usr/bin/env node
// Rasterize a PDF into per-page WebP images plus a manifest, ready for the
// read-as-book viewer.
//
// Pre-rendering at build time means the browser never loads pdf.js: the book is
// just images, so it opens instantly and works on a static host.
//
// Usage:
//   npx read-as-book-pages <input.pdf> [options]
//
// Options:
//   --out <dir>        Output directory. Default: ./pages
//   --scale <n>        Raster scale; 2 is ~150dpi at Letter. Default: 2
//   --quality <n>      WebP quality 1-100. Default: 82
//   --format <fmt>     webp | png | jpeg. Default: webp
//   --prefix <s>       Page filename prefix. Default: p
//   --base <path>      Path prefix written into the manifest, e.g.
//                      "publications/my-report/pages". Default: the out dir name
//   --ts <file>        Also write a typed TS/JS module exporting the manifest
//   --name <ident>     Export name for --ts. Default: bookManifest
//   --quiet            Only print errors
//
// Requires pdfjs-dist, @napi-rs/canvas and sharp (declared as optional peers):
//   npm i -D pdfjs-dist @napi-rs/canvas sharp

import { createRequire } from "node:module";
import { basename, dirname, join, resolve } from "node:path";
import { mkdir, writeFile, readFile, readdir, unlink, access } from "node:fs/promises";

const require = createRequire(import.meta.url);

const FORMATS = new Set(["webp", "png", "jpeg"]);

function parseArgs(argv) {
  const opts = {
    input: null,
    out: null,
    scale: 2,
    quality: 82,
    format: "webp",
    prefix: "p",
    base: null,
    ts: null,
    name: "bookManifest",
    quiet: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const takeValue = () => {
      const value = argv[++i];
      if (value === undefined) fail(`missing value for ${arg}`);
      return value;
    };
    switch (arg) {
      case "--out": opts.out = takeValue(); break;
      case "--scale": opts.scale = Number(takeValue()); break;
      case "--quality": opts.quality = Number(takeValue()); break;
      case "--format": opts.format = takeValue(); break;
      case "--prefix": opts.prefix = takeValue(); break;
      case "--base": opts.base = takeValue(); break;
      case "--ts": opts.ts = takeValue(); break;
      case "--name": opts.name = takeValue(); break;
      case "--quiet": opts.quiet = true; break;
      case "-h":
      case "--help": printHelp(); process.exit(0); break;
      default:
        if (arg.startsWith("-")) fail(`unknown option ${arg}`);
        else if (opts.input) fail("only one input PDF is supported");
        else opts.input = arg;
    }
  }
  if (!opts.input) fail("no input PDF given");
  if (!FORMATS.has(opts.format)) fail(`--format must be one of ${[...FORMATS].join(", ")}`);
  if (!Number.isFinite(opts.scale) || opts.scale <= 0) fail("--scale must be a positive number");
  if (!Number.isFinite(opts.quality) || opts.quality < 1 || opts.quality > 100) {
    fail("--quality must be between 1 and 100");
  }
  opts.out = opts.out ?? "pages";
  opts.base = opts.base ?? basename(resolve(opts.out));
  return opts;
}

function fail(message) {
  console.error(`read-as-book-pages: ${message}\n`);
  printHelp();
  process.exit(1);
}

function printHelp() {
  console.log(`Usage: read-as-book-pages <input.pdf> [options]

  --out <dir>      output directory (default: ./pages)
  --scale <n>      raster scale, 2 ≈ 150dpi (default: 2)
  --quality <n>    image quality 1-100 (default: 82)
  --format <fmt>   webp | png | jpeg (default: webp)
  --prefix <s>     page filename prefix (default: p)
  --base <path>    path prefix written into the manifest
  --ts <file>      also write a module exporting the manifest
  --name <ident>   export name for --ts (default: bookManifest)
  --quiet          only print errors`);
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function requirePeer(name, hint) {
  try {
    return require(name);
  } catch {
    console.error(
      `read-as-book-pages: missing peer dependency "${name}".\n` +
        `  Install the rendering tools with: npm i -D pdfjs-dist @napi-rs/canvas sharp\n` +
        (hint ? `  ${hint}\n` : ""),
    );
    process.exit(1);
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const log = opts.quiet ? () => {} : (msg) => console.log(msg);

  const pdfPath = resolve(opts.input);
  if (!(await exists(pdfPath))) fail(`no such file: ${pdfPath}`);

  // pdfjs-dist is ESM-only in recent versions, so resolve the legacy build's
  // path and import it; require() would throw on the package itself.
  let pdfjsEntry;
  try {
    pdfjsEntry = require.resolve("pdfjs-dist/legacy/build/pdf.mjs");
  } catch {
    requirePeer("pdfjs-dist");
  }
  const { getDocument } = await import(`file://${pdfjsEntry}`);
  const { createCanvas } = requirePeer("@napi-rs/canvas");
  const sharp = requirePeer("sharp");

  const outDir = resolve(opts.out);
  await mkdir(outDir, { recursive: true });

  // Clear stale pages so a shorter re-render leaves no orphans behind.
  const stale = new RegExp(`^${opts.prefix}\\d+\\.(webp|png|jpe?g)$`);
  for (const file of await readdir(outDir)) {
    if (stale.test(file) || file === "manifest.json") await unlink(join(outDir, file));
  }

  const standardFontDataUrl = join(dirname(dirname(pdfjsEntry)), "..", "standard_fonts") + "/";
  const doc = await getDocument({
    data: new Uint8Array(await readFile(pdfPath)),
    standardFontDataUrl,
    useSystemFonts: true,
  }).promise;

  const pad = String(doc.numPages).length >= 3 ? 3 : 2;
  const ext = opts.format === "jpeg" ? "jpg" : opts.format;
  const pages = [];

  log(`▸ ${basename(pdfPath)} — ${doc.numPages} pages`);

  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const viewport = page.getViewport({ scale: opts.scale });
    const width = Math.ceil(viewport.width);
    const height = Math.ceil(viewport.height);

    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d");
    // PDF pages are transparent; without a white backdrop the flip shadows
    // composite over black.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);

    await page.render({ canvasContext: context, viewport, canvas }).promise;

    const name = `${opts.prefix}${String(n).padStart(pad, "0")}.${ext}`;
    const image = sharp(canvas.toBuffer("image/png"));
    await (opts.format === "png"
      ? image.png()
      : opts.format === "jpeg"
        ? image.jpeg({ quality: opts.quality })
        : image.webp({ quality: opts.quality })
    ).toFile(join(outDir, name));

    pages.push({ src: `${opts.base}/${name}`.replace(/^\/+/, ""), width, height });
    log(`  rendered ${name} (${width}×${height})`);
  }

  const first = pages[0];
  const manifest = {
    generatedFrom: basename(pdfPath),
    pageCount: pages.length,
    aspect: first ? +(first.width / first.height).toFixed(4) : 0.7727,
    pages: pages.map((p) => p.src),
  };
  await writeFile(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

  if (opts.ts) {
    const tsPath = resolve(opts.ts);
    await mkdir(dirname(tsPath), { recursive: true });
    const isTs = /\.tsx?$/.test(tsPath);
    await writeFile(
      tsPath,
      `// GENERATED by read-as-book-pages — do not edit by hand.\n` +
        `// Re-run the command after changing ${basename(pdfPath)}.\n\n` +
        `export const ${opts.name} = ${JSON.stringify(manifest, null, 2)}` +
        `${isTs ? " as const" : ""};\n`,
    );
    log(`  manifest module -> ${tsPath}`);
  }

  log(`✓ ${pages.length} pages -> ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
