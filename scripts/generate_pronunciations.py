"""Generate pronunciation assets for the seeded course's spoken prompts."""

import asyncio
import hashlib
import json
import sqlite3
import sys
from pathlib import Path

import edge_tts


ROOT = Path(__file__).resolve().parents[1]
DB_PATH = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "backend" / "duolingo.db"
OUT_DIR = ROOT / "frontend" / "public" / "audio" / "pronunciation"
MAP_PATH = ROOT / "frontend" / "src" / "lib" / "pronunciations.json"


def requested_phrases() -> set[tuple[str, str]]:
    wanted: set[tuple[str, str]] = set()
    with sqlite3.connect(DB_PATH) as connection:
        for exercise_type, raw_payload in connection.execute("SELECT type, payload_json FROM exercises"):
            payload = json.loads(raw_payload)
            if exercise_type == "choice":
                wanted.update(("es-ES", choice["label"]) for choice in payload["choices"])
            elif exercise_type == "word_bank":
                wanted.add(("es-ES", payload["phrase"]))
            elif exercise_type == "type":
                wanted.add(("en-US", payload["phrase"]))
    return wanted


async def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    mapping = json.loads(MAP_PATH.read_text(encoding="utf-8")) if MAP_PATH.exists() else {}
    pending = [(language, phrase) for language, phrase in sorted(requested_phrases())
               if f"{language}:{phrase}" not in mapping]
    semaphore = asyncio.Semaphore(5)

    async def generate(language: str, phrase: str) -> tuple[str, str]:
        key = f"{language}:{phrase}"
        filename = f"{language.lower()}-{hashlib.sha256(key.encode()).hexdigest()[:16]}.mp3"
        target = OUT_DIR / filename
        voice = "es-ES-ElviraNeural" if language == "es-ES" else "en-US-JennyNeural"
        async with semaphore:
            for attempt in range(3):
                try:
                    await edge_tts.Communicate(phrase, voice).save(str(target))
                    break
                except Exception:
                    if attempt == 2:
                        raise
                    await asyncio.sleep(1 + attempt)
        return key, f"/audio/pronunciation/{filename}"

    for key, path in await asyncio.gather(*(generate(*phrase) for phrase in pending)):
        mapping[key] = path
    MAP_PATH.write_text(json.dumps(dict(sorted(mapping.items())), ensure_ascii=False, indent=2) + "\n",
                        encoding="utf-8")
    print(f"Pronunciation clips: {len(mapping)} total, {len(pending)} new")


if __name__ == "__main__":
    asyncio.run(main())
