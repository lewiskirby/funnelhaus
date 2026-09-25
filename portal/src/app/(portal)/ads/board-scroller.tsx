"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Horizontal board that opens scrolled to the column marked `data-focus` (the first one needing the client). */
export function BoardScroller({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    const target = el?.querySelector<HTMLElement>("[data-focus]");
    if (el && target && el.scrollWidth > el.clientWidth) el.scrollLeft = target.offsetLeft - el.offsetLeft - 20;
  }, []);
  return (
    <div ref={ref} className="-mx-5 overflow-x-auto px-5 pb-4 sm:-mx-8 sm:px-8 lg:mx-0 lg:px-0">
      {children}
    </div>
  );
}
