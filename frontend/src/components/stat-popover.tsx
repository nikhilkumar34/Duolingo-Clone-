"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

type StatKind = "language" | "streak" | "gems" | "hearts";

export function StatPopover({ kind, children, onEnter, onLeave }: {
  kind: StatKind;
  children: ReactNode;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<CSSProperties>();

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const header = panel?.closest(".topbar");
    const trigger = header?.querySelector(`[aria-controls="stat-panel-${kind}"]`);
    const rail = document.querySelector(".right-rail");
    if (!header || !trigger) return;
    const align = () => {
      const anchor = trigger.getBoundingClientRect();
      const container = header.getBoundingClientRect();
      const railRect = rail?.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      const width = Math.min(kind === "language" ? 304 : kind === "hearts" ? 500 : 483, viewportWidth - 20);
      const center = anchor.left + anchor.width / 2;
      const desiredLeft = kind !== "language" && railRect && railRect.width > 0 ? railRect.left : center - width / 2;
      const left = Math.max(10, Math.min(desiredLeft, viewportWidth - width - 10));
      const top = anchor.bottom + (kind === "streak" ? 8 : 10);
      // The transformed header is the containing block; use its local coordinates.
      setPosition({
        "--popover-left": `${left - container.left}px`,
        "--popover-top": `${top - container.top}px`,
        "--popover-width": `${width}px`,
        "--popover-arrow": `${Math.max(16, Math.min(width - 16, center - left))}px`,
        "--popover-height": `${Math.max(160, window.innerHeight - top - 10)}px`,
      } as CSSProperties);
    };
    align();
    const observer = new ResizeObserver(align);
    observer.observe(header);
    if (rail) observer.observe(rail);
    window.addEventListener("resize", align);
    return () => { observer.disconnect(); window.removeEventListener("resize", align); };
  }, [kind]);

  return <div ref={panelRef} className={`stat-popover anchored-popover ${kind}`} id={`stat-panel-${kind}`} style={position ?? { visibility: "hidden" }} onPointerEnter={onEnter} onPointerLeave={event => { if (event.pointerType !== "touch") onLeave(); }}>
    <div className="stat-popover-content">{children}</div>
  </div>;
}
