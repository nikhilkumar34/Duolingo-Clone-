"use client";

import { useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { playEffect } from "@/lib/lesson-audio";

export function WordBank({ options, selected, onChange, disabled }: {
  options: string[]; selected: number[]; onChange: (selected: number[]) => void; disabled: boolean;
}) {
  const answerRefs = useRef(new Map<number, HTMLButtonElement>());
  const bankRefs = useRef(new Map<number, HTMLButtonElement>());
  const previousPositions = useRef(new Map<number, DOMRect>());
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const pointer = useRef<{ id: number; index: number; x: number; y: number; offsetX: number; offsetY: number; width: number; height: number; moved: boolean; original: number[] } | null>(null);
  const suppressClick = useRef<number | null>(null);
  const focusAfterMove = useRef<number | null>(null);
  const [drag, setDrag] = useState<{ index: number; x: number; y: number; width: number; height: number } | null>(null);

  function capturePositions(extra?: number) {
    previousPositions.current.clear();
    for (const [id, element] of [...bankRefs.current, ...answerRefs.current]) {
      if (selectedRef.current.includes(id) || id === extra) {
        element.getAnimations().forEach(animation => animation.cancel());
        previousPositions.current.set(id, element.getBoundingClientRect());
      }
    }
  }

  function reorder(index: number, position: number) {
    const order = selectedRef.current;
    if (disabled || order.indexOf(index) === position) return;
    capturePositions();
    const next = order.filter(id => id !== index);
    next.splice(position, 0, index);
    selectedRef.current = next;
    onChange(next);
  }

  function startDrag(event: PointerEvent<HTMLButtonElement>, index: number) {
    if (disabled || !event.isPrimary || event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    suppressClick.current = null;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointer.current = { id: event.pointerId, index, x: event.clientX, y: event.clientY,
      offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top,
      width: rect.width, height: rect.height, moved: false, original: [...selectedRef.current] };
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const active = pointer.current;
    if (!active || active.id !== event.pointerId || disabled) return;
    if (!active.moved && Math.hypot(event.clientX - active.x, event.clientY - active.y) < 6) return;
    if (!active.moved) {
      active.moved = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      playEffect("tap");
    }
    event.preventDefault();
    setDrag({ index: active.index, x: event.clientX - active.offsetX, y: event.clientY - active.offsetY, width: active.width, height: active.height });
    // Use the nearest tile, including wrapped rows; IDs distinguish repeated words.
    let closest = active.index;
    let distance = Infinity;
    for (const id of selectedRef.current) {
      const tile = answerRefs.current.get(id);
      if (!tile) continue;
      tile.getAnimations().forEach(animation => animation.cancel());
      const rect = tile.getBoundingClientRect();
      const nextDistance = Math.hypot(event.clientX - (rect.left + rect.width / 2), event.clientY - (rect.top + rect.height / 2));
      if (nextDistance < distance) { distance = nextDistance; closest = id; }
    }
    reorder(active.index, selectedRef.current.indexOf(closest));
  }

  function finishDrag(event: PointerEvent<HTMLDivElement>, cancelled = false) {
    const active = pointer.current;
    if (!active || active.id !== event.pointerId) return;
    pointer.current = null;
    if (active.moved) {
      suppressClick.current = active.index;
      if (cancelled) { capturePositions(); selectedRef.current = active.original; onChange(active.original); }
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      answerRefs.current.get(active.index)?.focus({ preventScroll: true });
    }
    setDrag(null);
  }

  function moveWord(index: number, adding: boolean) {
    if (disabled) return;
    // Capture each tile before React moves it, including tiles that shift to fill a gap.
    capturePositions(index);
    playEffect("tap");
    onChange(adding ? [...selected, index] : selected.filter(id => id !== index));
  }

  useLayoutEffect(() => {
    if (focusAfterMove.current !== null) {
      answerRefs.current.get(focusAfterMove.current)?.focus({ preventScroll: true });
      focusAfterMove.current = null;
    }
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
    <div className="word-answer" aria-label="Your answer" onPointerMove={moveDrag}
      onPointerUp={event => finishDrag(event)} onPointerCancel={event => finishDrag(event, true)}
      onLostPointerCapture={event => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) finishDrag(event, true); }}>
      {selected.map(index => <button key={index} disabled={disabled}
        className={drag?.index === index ? "word-drag-origin" : ""}
        ref={element => { if (element) answerRefs.current.set(index, element); else answerRefs.current.delete(index); }}
        onPointerDown={event => startDrag(event, index)}
        onKeyDown={event => {
          if (event.altKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
            event.preventDefault();
            focusAfterMove.current = index;
            reorder(index, Math.max(0, Math.min(selected.length - 1, selected.indexOf(index) + (event.key === "ArrowLeft" ? -1 : 1))));
          }
        }}
        onClick={event => { if (suppressClick.current === index && event.detail > 0) { suppressClick.current = null; return; } suppressClick.current = null; moveWord(index, false); }}
        aria-describedby="word-reorder-help" aria-label={`Remove ${options[index]} from answer`}>{options[index]}</button>)}
    </div>
    <span id="word-reorder-help" className="sr-only">Drag selected words to reorder them, or use Alt and the left or right arrow key. Click a word to remove it.</span>
    {drag && !disabled && <div className="word-drag-ghost" aria-hidden="true" style={{ left: drag.x, top: drag.y, width: drag.width, height: drag.height }}>{options[drag.index]}</div>}
    <div className="word-options" aria-label="Available words">
      {options.map((word, index) => <button key={index} disabled={disabled || selected.includes(index)}
        className={selected.includes(index) ? "word-placeholder" : ""}
        ref={element => { if (element) bankRefs.current.set(index, element); else bankRefs.current.delete(index); }}
        onClick={() => moveWord(index, true)} aria-label={`Add ${word} to answer`}>{word}</button>)}
    </div>
  </>;
}
