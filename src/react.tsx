// React wrapper: a trigger button that opens the full-screen book reader.
//
//   import { ReadAsBook } from "read-as-book/react";
//   import "read-as-book/styles.css";
//
//   <ReadAsBook pages={pages} aspect={0.7727} title="My report" />
//
// The overlay itself is the framework-agnostic viewer, mounted imperatively on
// document.body — so it escapes any parent stacking context or overflow clip,
// which is the usual reason a home-grown modal misbehaves.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { openBookViewer, type BookViewer } from "./viewer.js";

export type ReadAsBookProps = {
  /** Ordered page image URLs. Index 0 is the front cover. */
  pages: string[];
  /** Page aspect ratio (width / height). */
  aspect: number;
  /** Title shown in the viewer chrome. */
  title?: string;
  /** If given, a "Download PDF" link appears in the chrome. */
  pdfUrl?: string;
  /** Class for the trigger button. Defaults to "rab-trigger". */
  className?: string;
  /** Trigger content. Defaults to "Read as book 📖". */
  children?: ReactNode;
  /** Extra class on the overlay root, for theming. */
  overlayClassName?: string;
  /** Replace the footer hint. Pass "" to hide it. */
  hint?: string;
  /** Controlled mode: open state. Omit to let the trigger manage it. */
  open?: boolean;
  /** Called when the viewer opens or closes. */
  onOpenChange?: (open: boolean) => void;
  /** Called with the current page index on every turn. */
  onFlip?: (page: number) => void;
};

export function ReadAsBook({
  pages,
  aspect,
  title,
  pdfUrl,
  className,
  children,
  overlayClassName,
  hint,
  open: controlledOpen,
  onOpenChange,
  onFlip,
}: ReadAsBookProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const viewerRef = useRef<BookViewer | null>(null);
  // Held in a ref so changing the handler never tears the viewer down.
  const onFlipRef = useRef(onFlip);
  onFlipRef.current = onFlip;

  const setOpen = useCallback(
    (next: boolean) => {
      if (controlledOpen === undefined) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [controlledOpen, onOpenChange],
  );

  useEffect(() => {
    if (!open) return;
    let disposed = false;

    openBookViewer({
      pages,
      aspect,
      title,
      pdfUrl,
      className: overlayClassName,
      hint,
      onFlip: (page) => onFlipRef.current?.(page),
      // Fires for the viewer's own Close button and Escape key.
      onClose: () => {
        if (!disposed) setOpen(false);
      },
    })
      .then((viewer) => {
        // Closed again before page-flip finished loading.
        if (disposed) viewer.close();
        else viewerRef.current = viewer;
      })
      .catch((err) => {
        console.error("read-as-book: failed to open the viewer", err);
        if (!disposed) setOpen(false);
      });

    return () => {
      disposed = true;
      viewerRef.current?.close();
      viewerRef.current = null;
    };
    // `setOpen` is intentionally excluded: it changes whenever the caller
    // passes a fresh onOpenChange, and rebuilding the book would lose the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pages, aspect, title, pdfUrl, overlayClassName, hint]);

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={className ?? "rab-trigger"}
    >
      {children ?? (
        <>
          Read as book <span aria-hidden>📖</span>
        </>
      )}
    </button>
  );
}
