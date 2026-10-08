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
    if (!panel || !header || !trigger) return;
    const align = () => {
      const anchor = trigger.getBoundingClientRect();
      const container = header.getBoundingClientRect();
      const railRect = rail?.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      const scale = Number.parseFloat(getComputedStyle(panel).getPropertyValue("--popover-scale")) || 1;
      const baseWidth = kind === "language" ? 304 : kind === "hearts" ? 500 : kind === "gems" ? 480 : 483;
      const width = Math.min(baseWidth * scale, viewportWidth - 20);
      const center = anchor.left + anchor.width / 2;
      const railOffset = kind === "gems" ? -44 : kind === "hearts" ? -38 : 0;
      const desiredLeft = kind !== "language" && railRect && railRect.width > 0 ? railRect.left + railOffset * scale : center - width / 2;
      const left = Math.max(10, Math.min(desiredLeft, viewportWidth - width - 10));
      const top = anchor.bottom + (kind === "streak" ? 8 : 10) * scale;
      // The transformed header is the containing block; use its local coordinates.
      setPosition({
        "--popover-left": `${left - container.left}px`,
        "--popover-top": `${top - container.top}px`,
        "--popover-width": `${width / scale}px`,
        "--popover-arrow": `${Math.max(16, Math.min(width / scale - 16, (center - left) / scale))}px`,
        "--popover-height": `${Math.max(160, window.innerHeight - top - 10) / scale}px`,
      } as CSSProperties);
    };
    align();
    const observer = new ResizeObserver(align);
    observer.observe(header);
    observer.observe(trigger);
    if (rail) observer.observe(rail);
    window.addEventListener("resize", align);
    return () => { observer.disconnect(); window.removeEventListener("resize", align); };
  }, [kind]);

  return <div ref={panelRef} className={`stat-popover anchored-popover ${kind}`} id={`stat-panel-${kind}`} style={position ?? { visibility: "hidden" }} onPointerEnter={onEnter} onPointerLeave={event => { if (event.pointerType !== "touch") onLeave(); }}>
    <div className="stat-popover-content">{children}</div>
  </div>;
}
