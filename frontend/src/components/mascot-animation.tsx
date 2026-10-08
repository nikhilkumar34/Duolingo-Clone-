"use client";

import { useEffect, useRef, useState } from "react";
import type { AnimationItem } from "lottie-web";

type Mascot = "flying-bird" | "learning" | "duo-attack";

// JSON is extracted from the supplied dotLottie archives, preserving the artwork.
export function MascotAnimation({ name, className = "", label, fallback }: {
  name: Mascot;
  className?: string;
  label: string;
  fallback?: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const controller = new AbortController();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animation: AnimationItem | undefined;
    let visible = true;
    let disposed = false;
    setReady(false);

    const updatePlayback = () => {
      if (!animation) return;
      if (reducedMotion.matches) animation.goToAndStop(Math.round(animation.totalFrames * .2), true);
      else if (visible && !document.hidden) animation.play();
      else animation.pause();
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      updatePlayback();
    });
    observer.observe(container);
    reducedMotion.addEventListener("change", updatePlayback);
    document.addEventListener("visibilitychange", updatePlayback);

    void (async () => {
      try {
        const [module, response] = await Promise.all([
          import("lottie-web"),
          fetch(`/animations/${name}.json`, { signal: controller.signal }),
        ]);
        if (!response.ok) throw new Error("Could not load mascot animation");
        const animationData = await response.json();
        if (disposed) return;
        animation = module.default.loadAnimation({
          container, animationData, renderer: "svg", loop: true, autoplay: false,
          rendererSettings: { preserveAspectRatio: "xMidYMid meet", hideOnTransparent: true },
        });
        animation.addEventListener("DOMLoaded", () => {
          if (disposed) return;
          setReady(true);
          updatePlayback();
        });
        animation.addEventListener("data_failed", () => { if (!disposed) setReady(false); });
      } catch {
        // Keep the existing mascot visible if the animation cannot be loaded.
        if (!disposed) setReady(false);
      }
    })();

    return () => {
      disposed = true;
      controller.abort();
      observer.disconnect();
      reducedMotion.removeEventListener("change", updatePlayback);
      document.removeEventListener("visibilitychange", updatePlayback);
      animation?.destroy();
    };
  }, [name]);

  return <div className={`mascot-animation ${className}`} role="img" aria-label={label}>
    <div className={`mascot-canvas ${ready ? "ready" : ""}`} ref={containerRef} aria-hidden="true" />
    {!ready && <div className="mascot-fallback" aria-hidden="true">{fallback ?? "✦"}</div>}
  </div>;
}
