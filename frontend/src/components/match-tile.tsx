"use client";

export function MatchTile({ word, matched, chosen = false, wrong = false, disabled, onClick }: {
  word: string; matched: boolean; chosen?: boolean; wrong?: boolean; disabled: boolean; onClick: () => void;
}) {
  return <div className="match-tile">
    <button className={`${matched ? "matched" : ""} ${chosen ? "chosen" : ""} ${wrong ? "wrong" : ""}`}
      disabled={disabled || matched} aria-pressed={chosen} onClick={onClick}>{word}</button>
    {matched && <span className="match-sparkles" aria-hidden="true"><i /><i /><i /><i /></span>}
  </div>;
}
