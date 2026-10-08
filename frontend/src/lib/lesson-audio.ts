import pronunciations from "./pronunciations.json";

export type LessonEffect = "tap" | "correct" | "wrong" | "combo" | "complete";

const activeEffects = new Set<HTMLAudioElement>();

export function pronunciationSource(phrase: string, language: "es-ES" | "en-US") {
  return (pronunciations as Record<string, string>)[`${language}:${phrase}`] ?? null;
}

export function playEffect(effect: LessonEffect) {
  if (typeof document === "undefined") return;
  const audio = document.createElement("audio");
  audio.src = `/audio/effects/${effect}.wav`;
  audio.volume = effect === "tap" ? 0.18 : 0.32;
  activeEffects.add(audio);
  const release = () => activeEffects.delete(audio);
  audio.addEventListener("ended", release, { once: true });
  audio.addEventListener("error", release, { once: true });
  void audio.play().catch(release);
}
