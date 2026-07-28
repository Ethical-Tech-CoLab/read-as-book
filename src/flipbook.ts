// The page-turning utility itself: a real page-curl over a list of page images.
//
// This is the piece worth reusing. Give it a container and an ordered list of
// image URLs and it sizes the spread to the viewport, lazy-loads page-flip
// (StPageFlip) on first use, wires arrow keys, and rebuilds itself on resize —
// which page-flip cannot do on its own.
//
//   const book = await mountFlipbook(el, { pages, aspect: 0.77 });
//   book.next(); book.prev(); book.destroy();

/** Minimal shape of the StPageFlip API this module relies on. */
type PageFlipInstance = {
  loadFromImages(images: string[]): void;
  on(event: string, cb: (e: { data: number }) => void): void;
  flipNext(): void;
  flipPrev(): void;
  turnToPage(page: number): void;
  destroy(): void;
};

type PageFlipCtor = new (
  el: HTMLElement,
  settings: Record<string, unknown>,
) => PageFlipInstance;

export type FlipbookOptions = {
  /** Ordered page image URLs. Index 0 is the front cover. */
  pages: string[];
  /** Page aspect ratio (width / height). Letter portrait is ~0.7727. */
  aspect: number;
  /** Page index to open on. Default 0. */
  startPage?: number;
  /**
   * Below this viewport width the book shows one page instead of a spread.
   * Default 640. Pass 0 to always show a spread.
   */
  singlePageBreakpoint?: number;
  /** Vertical space (px) reserved for surrounding chrome. Default 150. */
  chromeHeight?: number;
  /** Horizontal space (px) reserved for surrounding chrome. Default 48. */
  chromeWidth?: number;
  /** Hard cap on page height (px). Default 1100. */
  maxPageHeight?: number;
  /** Page-curl duration in ms. Default 700. */
  flippingTime?: number;
  /** Draw the page shadow. Default true. */
  drawShadow?: boolean;
  /** Shadow strength, 0–1. Default 0.4. */
  maxShadowOpacity?: number;
  /** Bind ArrowLeft / ArrowRight on document. Default true. */
  keyboard?: boolean;
  /** Called with the current page index whenever the book is turned. */
  onFlip?: (page: number) => void;
  /** Called once the curl is live (also after each resize rebuild). */
  onReady?: () => void;
};

export type Flipbook = {
  /** Turn forward one spread. */
  next(): void;
  /** Turn back one spread. */
  prev(): void;
  /** Jump to a page index. */
  goTo(page: number): void;
  /** Current page index. */
  currentPage(): number;
  /** Number of pages. */
  pageCount(): number;
  /** Tear down the curl, listeners and DOM. Safe to call twice. */
  destroy(): void;
};

const DEFAULTS = {
  startPage: 0,
  singlePageBreakpoint: 640,
  chromeHeight: 150,
  chromeWidth: 48,
  maxPageHeight: 1100,
  flippingTime: 700,
  drawShadow: true,
  maxShadowOpacity: 0.4,
  keyboard: true,
};

/**
 * Work out the page size that fits the current viewport, keeping `aspect` and
 * leaving room for chrome. Exported because callers often want to reserve
 * layout space before the book itself is built.
 */
export function fitPageSize(
  aspect: number,
  opts: {
    single: boolean;
    viewportWidth: number;
    viewportHeight: number;
    chromeWidth?: number;
    chromeHeight?: number;
    maxPageHeight?: number;
  },
): { width: number; height: number } {
  const chromeH = opts.chromeHeight ?? DEFAULTS.chromeHeight;
  const chromeW = opts.chromeWidth ?? DEFAULTS.chromeWidth;
  const maxH = Math.min(opts.viewportHeight - chromeH, opts.maxPageHeight ?? DEFAULTS.maxPageHeight);
  const maxW = opts.viewportWidth - chromeW;

  let height = Math.max(maxH, 120);
  let width = height * aspect;
  const spreadWidth = opts.single ? width : width * 2;
  if (spreadWidth > maxW) {
    const scale = maxW / spreadWidth;
    width *= scale;
    height *= scale;
  }
  return { width: Math.round(width), height: Math.round(height) };
}

/**
 * Mount a page-turning book of images into `container`.
 *
 * Resolves once the curl is live. The returned handle stays valid across
 * resizes: the instance is rebuilt underneath at the new size, holding the
 * reader's place.
 */
export async function mountFlipbook(
  container: HTMLElement,
  options: FlipbookOptions,
): Promise<Flipbook> {
  const opt = { ...DEFAULTS, ...options };
  if (!opt.pages.length) throw new Error("mountFlipbook: `pages` is empty");

  const mod = (await import("page-flip")) as unknown as { PageFlip: PageFlipCtor };
  const PageFlip = mod.PageFlip;

  let flip: PageFlipInstance | null = null;
  let page = Math.min(Math.max(opt.startPage, 0), opt.pages.length - 1);
  let destroyed = false;
  let resizeTimer: ReturnType<typeof setTimeout> | null = null;

  const build = () => {
    if (destroyed) return;
    const single =
      opt.singlePageBreakpoint > 0 &&
      window.matchMedia(`(max-width: ${opt.singlePageBreakpoint}px)`).matches;
    const { width, height } = fitPageSize(opt.aspect, {
      single,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      chromeWidth: opt.chromeWidth,
      chromeHeight: opt.chromeHeight,
      maxPageHeight: opt.maxPageHeight,
    });

    flip = new PageFlip(container, {
      width,
      height,
      size: "fixed",
      showCover: true,
      usePortrait: single,
      maxShadowOpacity: opt.maxShadowOpacity,
      mobileScrollSupport: true,
      flippingTime: opt.flippingTime,
      drawShadow: opt.drawShadow,
    });

    flip.loadFromImages(opt.pages.slice());
    flip.on("flip", (e) => {
      page = e.data;
      opt.onFlip?.(page);
    });
    if (page > 0) {
      try {
        flip.turnToPage(page);
      } catch {
        // Older page-flip builds reject a jump before the images decode; the
        // reader simply starts at the cover.
      }
    }
    opt.onReady?.();
  };

  const teardown = () => {
    if (!flip) return;
    try {
      flip.destroy();
    } catch {
      // page-flip throws if the container was already removed from the DOM.
    }
    flip = null;
    container.innerHTML = "";
  };

  // page-flip has no live re-fit, so a resize means rebuild. Debounced, because
  // a drag-resize fires continuously and each rebuild re-decodes the images.
  const onResize = () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      teardown();
      build();
    }, 200);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft") flip?.flipPrev();
    else if (e.key === "ArrowRight") flip?.flipNext();
  };

  build();
  window.addEventListener("resize", onResize);
  if (opt.keyboard) document.addEventListener("keydown", onKey);

  return {
    next: () => flip?.flipNext(),
    prev: () => flip?.flipPrev(),
    goTo: (n: number) => flip?.turnToPage(n),
    currentPage: () => page,
    pageCount: () => opt.pages.length,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      if (resizeTimer) clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("keydown", onKey);
      teardown();
    },
  };
}
