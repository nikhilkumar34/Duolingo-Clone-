export type User = {
  id: number; username: string; display_name: string; joined_at: string;
  xp: number; gems: number; hearts: number; streak: number; daily_xp: number;
};
export type Skill = {
  id: number; title: string; icon: string; lesson_id: number; lesson_count: number;
  completed_lessons: number; state: "completed" | "available" | "locked";
};
export type Unit = { id: number; number: number; title: string; color: string; skills: Skill[] };
export type Leader = { name: string; xp: number; avatar: string; me?: boolean };
export type Bootstrap = { user: User; units: Unit[]; leaderboard: Leader[] };
export type Exercise = { id: number; sort_order: number; type: "choice" | "word_bank" | "match" | "fill_blank" | "type"; prompt: string; payload: Record<string, unknown> };
export type LessonStart = { session_id: string; exercises: Exercise[]; hearts: number };
export type AnswerResult = { correct: boolean; correct_answer: unknown; explanation: string; hearts: number; complete: boolean; failed: boolean; xp_awarded: number; accuracy: number; streak: number; streak_advanced: boolean };

const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const learnerKey = "lingopath-learner-id";
const welcomeKey = "lingopath-welcome-seen";

function learnerId(): string {
  let id = window.localStorage.getItem(learnerKey);
  if (!id) {
    id = window.crypto.randomUUID();
    window.localStorage.setItem(learnerKey, id);
  }
  return id;
}

export function firstVisitWelcome(): boolean {
  if (window.localStorage.getItem(welcomeKey)) return false;
  window.localStorage.setItem(welcomeKey, "true");
  return true;
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${base}${path}`, { cache: "no-store", ...options, headers: { "Content-Type": "application/json", "X-Learner-Id": learnerId(), ...(options?.headers || {}) } });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try { message = (await response.json()).detail || message; } catch { /* ignore invalid server response */ }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export function post<T>(path: string, body?: unknown): Promise<T> {
  return api<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) });
}

export function patch<T>(path: string, body: unknown): Promise<T> {
  return api<T>(path, { method: "PATCH", body: JSON.stringify(body) });
}
