"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Volume2, X } from "lucide-react";
import { api, type LessonReview, type ReviewItem } from "@/lib/api";
import { pronunciationSource } from "@/lib/lesson-audio";

function answerText(answer: unknown): string {
  if (answer === null || answer === undefined || answer === "") return "Skipped";
  if (Array.isArray(answer)) return answer.map(value => Array.isArray(value) ? value.join(" — ") : String(value)).join(Array.isArray(answer[0]) ? "; " : " ");
  return String(answer);
}

function reviewTitle(item: ReviewItem) {
  if (item.type === "word_bank" || item.type === "type") return /Spanish/i.test(item.prompt) ? "Write in Spanish:" : "Write in English:";
  if (item.type === "match") return "Select the matching pairs";
  if (item.type === "fill_blank") return "Complete the translation";
  return item.payload.mode === "meaning" ? "Select the correct meaning" : "Choose the correct picture";
}

function reviewPrompt(item: ReviewItem) {
  if (item.type === "match") return (item.payload.pairs as [string, string][]).map(([word]) => word).join(" · ");
  return String(item.payload.phrase || item.payload.translation || item.prompt);
}

export function LessonReviewModal({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const [review, setReview] = useState<LessonReview | null>(null);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [playing, setPlaying] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  async function loadReview() {
    setError("");
    try { setReview(await api<LessonReview>(`/api/sessions/${sessionId}/review`)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load your scorecard"); }
  }

  useEffect(() => { void loadReview(); }, [sessionId]);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLButtonElement>(".review-close")?.focus();
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key !== "Tab" || !dialog) return;
      const buttons = Array.from(dialog.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      audioRef.current?.pause();
      window.speechSynthesis?.cancel();
      previousFocus?.focus();
    };
  }, [onClose]);

  function play(item: ReviewItem) {
    const phrase = String(item.payload.phrase || item.payload.translation || "");
    if (!phrase) return;
    const language = /Spanish/i.test(item.prompt) || item.type === "type" || item.payload.mode === "meaning" ? "en-US" : "es-ES";
    audioRef.current?.pause();
    window.speechSynthesis?.cancel();
    setPlaying(item.id);
    const fallback = () => {
      if (!("speechSynthesis" in window)) { setPlaying(null); return; }
      const speech = new SpeechSynthesisUtterance(phrase);
      speech.lang = language;
      speech.rate = .85;
      speech.onend = speech.onerror = () => setPlaying(null);
      window.speechSynthesis.speak(speech);
    };
    const source = pronunciationSource(phrase, language);
    if (!source || !audioRef.current) { fallback(); return; }
    audioRef.current.src = source;
    audioRef.current.currentTime = 0;
    void audioRef.current.play().catch(fallback);
  }

  return <div className="review-backdrop" onClick={onClose}>
    <div className="review-modal" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="review-title" onClick={event => event.stopPropagation()}>
      <button className="review-close" onClick={onClose} aria-label="Close lesson review"><X size={22} /></button>
      <h2 id="review-title">Check out your scorecard!</h2>
      <p className="review-subtitle">Click the tiles below to reveal the solutions</p>
      <audio ref={audioRef} onEnded={() => setPlaying(null)} />
      {error ? <div className="review-error"><p>{error}</p><button onClick={() => void loadReview()}>TRY AGAIN</button></div>
        : !review ? <p role="status">Loading your scorecard…</p>
        : <div className="review-grid">{review.items.map(item => <div className={`review-card ${item.correct ? "correct" : "incorrect"} ${expanded === item.id ? "expanded" : ""}`} key={item.id}>
          <button className="review-tile" aria-expanded={expanded === item.id} aria-controls={`solution-${item.id}`}
            aria-label={`Question ${item.sort_order}: ${reviewTitle(item)} ${item.correct ? "Correct" : "Incorrect"}`}
            onClick={() => setExpanded(expanded === item.id ? null : item.id)}>
            <span className="review-status" aria-hidden="true">{item.correct ? <Check size={15} strokeWidth={4} /> : <X size={15} strokeWidth={4} />}</span>
            <strong>{reviewTitle(item)}</strong>
            <span className="review-prompt">{reviewPrompt(item)}</span>
          </button>
          {!!(item.payload.phrase || item.payload.translation) && <button className={`review-audio ${playing === item.id ? "playing" : ""}`} onClick={() => play(item)} aria-label={`Play question ${item.sort_order} pronunciation`}><Volume2 size={23} /></button>}
          {expanded === item.id && <div className="review-solution" id={`solution-${item.id}`}>
            <strong>YOUR RESPONSE:</strong><p>{answerText(item.answer)}</p>
            <strong>CORRECT RESPONSE:</strong><p>{answerText(item.correct_answer)}</p>
          </div>}
        </div>)}</div>}
    </div>
  </div>;
}
