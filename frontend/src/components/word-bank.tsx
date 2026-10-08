"use client";

import { useLayoutEffect, useRef } from "react";
import { playEffect } from "@/lib/lesson-audio";

export function WordBank({ options, selected, onChange, disabled }: {
  options: string[]; selected: number[]; onChange: (selected: number[]) => void; disabled: boolean;
}) {
  const answerRefs = useRef(new Map<number, HTMLButtonElement>());
  const bankRefs = useRef(new Map<number, HTMLButtonElement>());
  const previousPositions = useRef(new Map<number, DOMRect>());

  function moveWord(index: number, adding: boolean) {
    if (disabled) return;
    // Capture each tile before React moves it, including tiles that shift to fill a gap.
    previousPositions.current.clear();
    for (const [id, element] of [...bankRefs.current, ...answerRefs.current]) {
      if (selected.includes(id) || id === index) previousPositions.current.set(id, element.getBoundingClientRect());
    }
    playEffect("tap");
    onChange(adding ? [...selected, index] : selected.filter(id => id !== index));
  }

  useLayoutEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      previousPositions.current.clear();
      return;
    }
    for (const [index, before] of previousPositions.current) {
      const tile = (selected.includes(index) ? answerRefs : bankRefs).current.get(index);
      if (!tile) continue;
      tile.getAnimations().forEach(animation => animation.cancel());
      const after = tile.getBoundingClientRect();
      const dx = before.left - after.left;
      const dy = before.top - after.top;
      if (Math.abs(dx) + Math.abs(dy) < 1) continue;
      tile.animate([
        { transform: `translate(${dx}px, ${dy}px)`, zIndex: 2 },
        { transform: "translate(0, 0)", zIndex: 2 },
      ], { duration: 260, easing: "cubic-bezier(.2,.75,.25,1)" });
    }
    previousPositions.current.clear();
  }, [selected]);

  return <>
    <div className="word-answer" aria-label="Your answer">
      {selected.map(index => <button key={index} disabled={disabled}
        ref={element => { if (element) answerRefs.current.set(index, element); else answerRefs.current.delete(index); }}
        onClick={() => moveWord(index, false)} aria-label={`Remove ${options[index]} from answer`}>{options[index]}</button>)}
    </div>
    <div className="word-options" aria-label="Available words">
      {options.map((word, index) => <button key={index} disabled={disabled || selected.includes(index)}
        className={selected.includes(index) ? "word-placeholder" : ""}
        ref={element => { if (element) bankRefs.current.set(index, element); else bankRefs.current.delete(index); }}
        onClick={() => moveWord(index, true)} aria-label={`Add ${word} to answer`}>{word}</button>)}
    </div>
  </>;
}
