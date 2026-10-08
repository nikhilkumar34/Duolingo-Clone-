"""Small persistent learning API for the demo Spanish course."""

from __future__ import annotations

import json
import os
import random
import sqlite3
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

DB_PATH = Path(os.getenv("DUO_DB_PATH", Path(__file__).resolve().parents[1] / "duolingo.db"))
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="LingoPath API", version="1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("FRONTEND_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@contextmanager
def db():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def now() -> datetime:
    return datetime.now(timezone.utc)


def as_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    return dict(row) if row else None


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
  client_id TEXT UNIQUE, joined_at TEXT NOT NULL, xp INTEGER NOT NULL DEFAULT 0, gems INTEGER NOT NULL DEFAULT 0,
  hearts INTEGER NOT NULL DEFAULT 0, hearts_updated_at TEXT NOT NULL,
  streak INTEGER NOT NULL DEFAULT 0, last_active_date TEXT,
  daily_xp INTEGER NOT NULL DEFAULT 0, daily_xp_date TEXT
);
CREATE TABLE IF NOT EXISTS units (
  id INTEGER PRIMARY KEY, section INTEGER NOT NULL, number INTEGER NOT NULL,
  title TEXT NOT NULL, color TEXT NOT NULL, sort_order INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS skills (
  id INTEGER PRIMARY KEY, unit_id INTEGER NOT NULL REFERENCES units(id),
  title TEXT NOT NULL, icon TEXT NOT NULL, sort_order INTEGER NOT NULL,
  lesson_count INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS lessons (
  id INTEGER PRIMARY KEY, skill_id INTEGER NOT NULL REFERENCES skills(id),
  title TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS exercises (
  id INTEGER PRIMARY KEY, lesson_id INTEGER NOT NULL REFERENCES lessons(id),
  sort_order INTEGER NOT NULL, type TEXT NOT NULL, prompt TEXT NOT NULL,
  payload_json TEXT NOT NULL, answer_json TEXT NOT NULL, explanation TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS skill_progress (
  user_id INTEGER NOT NULL REFERENCES users(id), skill_id INTEGER NOT NULL REFERENCES skills(id),
  completed_lessons INTEGER NOT NULL DEFAULT 0, completed_at TEXT,
  PRIMARY KEY (user_id, skill_id)
);
CREATE TABLE IF NOT EXISTS lesson_sessions (
  id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
  lesson_id INTEGER NOT NULL REFERENCES lessons(id), started_at TEXT NOT NULL,
  finished_at TEXT, status TEXT NOT NULL DEFAULT 'active', correct_count INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS session_answers (
  session_id TEXT NOT NULL REFERENCES lesson_sessions(id),
  exercise_id INTEGER NOT NULL REFERENCES exercises(id), answer_json TEXT NOT NULL,
  is_correct INTEGER NOT NULL, answered_at TEXT NOT NULL,
  PRIMARY KEY (session_id, exercise_id)
);
"""


def seed(connection: sqlite3.Connection) -> None:
    if connection.execute("SELECT COUNT(*) FROM users").fetchone()[0]:
        return
    stamp = now().isoformat()
    connection.execute(
        "INSERT INTO users (id, username, display_name, joined_at, hearts_updated_at, daily_xp_date) VALUES (1, ?, ?, ?, ?, ?)",
        ("legacy_learner", "Your Name", stamp, stamp, date.today().isoformat()),
    )
    units = [
        (1, 1, 1, "Order at a café", "#58cc02", 1),
        (2, 1, 2, "Greet people and say goodbye", "#ce82ff", 2),
        (3, 1, 3, "Say where you are from", "#00cba9", 3),
        (4, 1, 4, "Talk about food", "#ffb020", 4),
    ]
    connection.executemany("INSERT INTO units VALUES (?, ?, ?, ?, ?, ?)", units)
    skill_data = [
        (1, 1, "Order food and drinks", "star", 1, 1),
        (2, 1, "Use polite phrases", "star", 2, 1),
        (3, 1, "Café review", "trophy", 3, 1),
        (4, 2, "Say hello", "star", 1, 1),
        (5, 2, "Introduce yourself", "star", 2, 1),
        (6, 2, "Greeting review", "trophy", 3, 1),
        (7, 3, "Where are you from?", "star", 1, 1),
        (8, 3, "Talk about places", "star", 2, 1),
        (9, 3, "Places review", "trophy", 3, 1),
        (10, 4, "Meals and snacks", "star", 1, 1),
        (11, 4, "At the restaurant", "star", 2, 1),
        (12, 4, "Food review", "trophy", 3, 1),
    ]
    connection.executemany("INSERT INTO skills VALUES (?, ?, ?, ?, ?, ?)", skill_data)
    connection.executemany(
        "INSERT INTO lessons VALUES (?, ?, ?, 1)",
        [(i, i, skill[2]) for i, skill in enumerate(skill_data, 1)],
    )
    # A short reusable curriculum. Every lesson contains all five required exercise formats.
    content = [
        ("choice", "Which one of these is ‘sandwich’?", {"choices": [{"label": "taco", "emoji": "🌮"}, {"label": "café", "emoji": "☕"}, {"label": "un sándwich", "emoji": "🥪"}]}, "un sándwich", "‘Un sándwich’ means ‘a sandwich’."),
        ("word_bank", "Write this in English", {"phrase": "Un sándwich.", "words": ["sandwich", "you", "A"]}, ["A", "sandwich"], "Un sándwich means a sandwich."),
        ("match", "Match the pairs", {"pairs": [["un café", "a coffee"], ["agua", "water"], ["pan", "bread"]]}, [["un café", "a coffee"], ["agua", "water"], ["pan", "bread"]], "Nice matching!"),
        ("fill_blank", "Complete the sentence", {"before": "Quiero un", "after": ", por favor.", "translation": "I want a coffee, please.", "choices": ["café", "gato", "libro"]}, "café", "Quiero un café, por favor."),
        ("type", "Type this in Spanish", {"phrase": "Thank you", "placeholder": "Type in Spanish"}, "gracias", "‘Gracias’ means ‘thank you’."),
        ("choice", "Which one of these is ‘water’?", {"choices": [{"label": "agua", "emoji": "💧"}, {"label": "pan", "emoji": "🥖"}, {"label": "leche", "emoji": "🥛"}]}, "agua", "‘Agua’ means ‘water’."),
        ("word_bank", "Write this in English", {"phrase": "Quiero un té con hielo, por favor.", "words": ["please", "ice", "with", "a", "coffee", "I", "tea", "want"]}, ["I", "want", "a", "tea", "with", "ice", "please"], "I want a tea with ice, please."),
    ]
    themes = {
        4: ("hola", "hello", "👋"),
        5: ("me llamo Ana", "my name is Ana", "🙂"),
        6: ("buenos días", "good morning", "☀️"),
        7: ("España", "Spain", "🇪🇸"),
        8: ("México", "Mexico", "🇲🇽"),
        9: ("la ciudad", "the city", "🏙️"),
        10: ("la manzana", "the apple", "🍎"),
        11: ("la ensalada", "the salad", "🥗"),
        12: ("la sopa", "the soup", "🥣"),
    }
    exercise_id = 1
    for lesson_id in range(1, 13):
        rows = list(content)
        if lesson_id in themes:
            spanish, english, emoji = themes[lesson_id]
            rows[0] = ("choice", f"Which one of these is ‘{english}’?", {"choices": [{"label": "un café", "emoji": "☕"}, {"label": spanish, "emoji": emoji}, {"label": "agua", "emoji": "💧"}]}, spanish, f"‘{spanish}’ means ‘{english}’.")
            rows[1] = ("word_bank", "Write this in English", {"phrase": spanish.capitalize() + ".", "words": [english, "coffee", "water"]}, [english], f"‘{spanish}’ means ‘{english}’.")
        for index, (kind, prompt, payload, answer, explanation) in enumerate(rows, 1):
            connection.execute(
                "INSERT INTO exercises (id, lesson_id, sort_order, type, prompt, payload_json, answer_json, explanation) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (exercise_id, lesson_id, index, kind, prompt, json.dumps(payload, ensure_ascii=False), json.dumps(answer, ensure_ascii=False), explanation),
            )
            exercise_id += 1


def sync_reference_path(connection: sqlite3.Connection) -> None:
    """Add the units visible in the reference recording without resetting progress."""
    connection.execute(
        "UPDATE units SET title = ?, color = ? WHERE id = 4",
        ("Introduce family and friends", "#58cc02"),
    )
    extra_units = [
        (5, 1, 5, "Describe people's personalities", "#28b7ec", 5),
        (6, 1, 6, "Say where your things are", "#ee6cc5", 6),
        (7, 1, 7, "Talk about places in the city", "#58cc02", 7),
        (8, 1, 8, "Discuss languages", "#ffb020", 8),
    ]
    connection.executemany("INSERT OR IGNORE INTO units VALUES (?, ?, ?, ?, ?, ?)", extra_units)
    skill_titles = [
        (10, "Introduce your family"), (11, "Talk about friends"), (12, "Family review"),
    ]
    connection.executemany("UPDATE skills SET title = ? WHERE id = ?", [(title, skill_id) for skill_id, title in skill_titles])
    connection.executemany(
        "UPDATE skills SET icon = ? WHERE id = ?",
        [("headphones", 5), ("book", 7), ("headphones", 8), ("headphones", 11), ("dumbbell", 17)],
    )
    connection.executemany("UPDATE lessons SET title = ? WHERE skill_id = ?", [(title, skill_id) for skill_id, title in skill_titles])
    extra_skills = [
        (13, 5, "Describe a person", "book", 1, 1),
        (14, 5, "Use personality words", "headphones", 2, 1),
        (15, 5, "Personality review", "trophy", 3, 1),
        (16, 6, "Find your things", "headphones", 1, 1),
        (17, 6, "Describe positions", "star", 2, 1),
        (18, 6, "Location review", "trophy", 3, 1),
        (19, 7, "Explore the city", "headphones", 1, 1),
        (20, 7, "Ask for directions", "book", 2, 1),
        (21, 7, "City review", "trophy", 3, 1),
    ]
    connection.executemany("INSERT OR IGNORE INTO skills VALUES (?, ?, ?, ?, ?, ?)", extra_skills)
    connection.executemany(
        "INSERT OR IGNORE INTO lessons VALUES (?, ?, ?, 1)",
        [(skill[0], skill[0], skill[2]) for skill in extra_skills],
    )
    themes = {
        10: ("mi familia", "my family", "👨‍👩‍👧"),
        11: ("mi amigo", "my friend", "👫"),
        12: ("mi hermana", "my sister", "👧"),
        13: ("simpático", "nice", "🙂"),
        14: ("inteligente", "intelligent", "🧠"),
        15: ("divertido", "funny", "😄"),
        16: ("la llave", "the key", "🔑"),
        17: ("encima", "on top", "⬆️"),
        18: ("debajo", "underneath", "⬇️"),
        19: ("la ciudad", "the city", "🏙️"),
        20: ("la calle", "the street", "🛣️"),
        21: ("el parque", "the park", "🌳"),
    }
    for lesson_id, (spanish, english, emoji) in themes.items():
        existing = connection.execute("SELECT id FROM exercises WHERE lesson_id = ? ORDER BY sort_order LIMIT 1", (lesson_id,)).fetchone()
        choice_payload = {"choices": [
            {"label": "un café", "emoji": "☕"},
            {"label": spanish, "emoji": emoji},
            {"label": "agua", "emoji": "💧"},
        ]}
        word_payload = {"phrase": spanish.capitalize() + ".", "words": [english, "coffee", "water"]}
        rows = [
            ("choice", f"Which one of these is ‘{english}’?", choice_payload, spanish, f"‘{spanish}’ means ‘{english}’."),
            ("word_bank", "Write this in English", word_payload, [english], f"‘{spanish}’ means ‘{english}’."),
            ("match", "Match the pairs", {"pairs": [["un café", "a coffee"], ["agua", "water"], ["pan", "bread"]]}, [["un café", "a coffee"], ["agua", "water"], ["pan", "bread"]], "Nice matching!"),
            ("fill_blank", "Complete the sentence", {"before": "Quiero un", "after": ", por favor.", "translation": "I want a coffee, please.", "choices": ["café", "gato", "libro"]}, "café", "Quiero un café, por favor."),
            ("type", "Type this in Spanish", {"phrase": "Thank you", "placeholder": "Type in Spanish"}, "gracias", "‘Gracias’ means ‘thank you’."),
        ]
        if existing:
            # The first two questions carry the unit theme; preserve answer history for prior lessons.
            if lesson_id <= 12 and connection.execute("SELECT COUNT(*) FROM session_answers WHERE exercise_id IN (SELECT id FROM exercises WHERE lesson_id = ?)", (lesson_id,)).fetchone()[0] == 0:
                for sort_order, (kind, prompt, payload, answer, explanation) in enumerate(rows[:2], 1):
                    connection.execute(
                        "UPDATE exercises SET prompt = ?, payload_json = ?, answer_json = ?, explanation = ? WHERE lesson_id = ? AND sort_order = ?",
                        (prompt, json.dumps(payload, ensure_ascii=False), json.dumps(answer, ensure_ascii=False), explanation, lesson_id, sort_order),
                    )
            continue
        for sort_order, (kind, prompt, payload, answer, explanation) in enumerate(rows, 1):
            connection.execute(
                "INSERT INTO exercises (lesson_id, sort_order, type, prompt, payload_json, answer_json, explanation) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (lesson_id, sort_order, kind, prompt, json.dumps(payload, ensure_ascii=False), json.dumps(answer, ensure_ascii=False), explanation),
            )
    # Longer core lessons support the five- and ten-answer combo moments in the reference.
    bonus = [
        ("choice", "Which one of these is ‘coffee’?", {"choices": [{"label": "agua", "emoji": "💧"}, {"label": "un café", "emoji": "☕"}, {"label": "pan", "emoji": "🥖"}]}, "un café", "‘Un café’ means ‘a coffee’."),
        ("word_bank", "Write this in English", {"phrase": "Agua, por favor.", "words": ["coffee", "please", "Water", "tea"]}, ["Water", "please"], "Water, please."),
        ("fill_blank", "Complete the sentence", {"before": "Un", "after": ", por favor.", "translation": "A sandwich, please.", "choices": ["café", "sándwich", "agua"]}, "sándwich", "Un sándwich, por favor."),
        ("match", "Match the pairs", {"pairs": [["té", "tea"], ["leche", "milk"], ["hielo", "ice"]]}, [["té", "tea"], ["leche", "milk"], ["hielo", "ice"]], "Nice matching!"),
        ("type", "Write this in Spanish", {"phrase": "I want a glass of water, please.", "placeholder": "Type in Spanish"}, "Quiero un vaso de agua, por favor", "Quiero un vaso de agua, por favor."),
    ]
    for lesson_id in range(1, 13):
        if connection.execute("SELECT COUNT(*) FROM exercises WHERE lesson_id = ?", (lesson_id,)).fetchone()[0] >= 12:
            continue
        for sort_order, (kind, prompt, payload, expected, explanation) in enumerate(bonus, 8):
            connection.execute(
                "INSERT INTO exercises (lesson_id, sort_order, type, prompt, payload_json, answer_json, explanation) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (lesson_id, sort_order, kind, prompt, json.dumps(payload, ensure_ascii=False), json.dumps(expected, ensure_ascii=False), explanation),
            )
    spoken_challenge = (
        "word_bank", "Write this in English",
        {"phrase": "Quiero un helado y un vaso de agua.", "words": ["glass", "I", "coffee", "and", "an", "want", "ice", "of", "a", "water", "cream"]},
        ["I", "want", "an", "ice", "cream", "and", "a", "glass", "of", "water"],
        "I want an ice cream and a glass of water.",
    )
    kind, prompt, payload, expected, explanation = spoken_challenge
    for lesson_id in range(1, 13):
        if connection.execute("SELECT 1 FROM exercises WHERE lesson_id = ? AND sort_order = 13", (lesson_id,)).fetchone():
            continue
        connection.execute(
            "INSERT INTO exercises (lesson_id, sort_order, type, prompt, payload_json, answer_json, explanation) VALUES (?, 13, ?, ?, ?, ?, ?)",
            (lesson_id, kind, prompt, json.dumps(payload, ensure_ascii=False), json.dumps(expected, ensure_ascii=False), explanation),
        )

    # Every circular path node represents a lesson. The chest remains a reward marker.
    # Keep existing IDs (and their progress) while placing two new lessons before each review.
    additional_skills = [
        (22, 1, 3, "Learn café words", "star", "el té", "tea", "🍵"),
        (23, 1, 4, "Order more food", "star", "el pan", "bread", "🥖"),
        (24, 2, 3, "Greet in the afternoon", "star", "buenas tardes", "good afternoon", "🌇"),
        (25, 2, 4, "Say goodbye", "headphones", "adiós", "goodbye", "👋"),
        (26, 3, 3, "Talk about countries", "star", "Francia", "France", "🇫🇷"),
        (27, 3, 4, "Say where you live", "headphones", "vivo en Madrid", "I live in Madrid", "🏙️"),
        (28, 4, 3, "Name family members", "star", "mi madre", "my mother", "👩"),
        (29, 4, 4, "Describe your family", "headphones", "mi padre", "my father", "👨"),
        (30, 5, 3, "Describe traits", "star", "amable", "kind", "🙂"),
        (31, 5, 4, "Talk about personalities", "headphones", "tímido", "shy", "🙈"),
        (32, 6, 3, "Find objects", "star", "la mesa", "the table", "🪑"),
        (33, 6, 4, "Say where things are", "headphones", "dentro", "inside", "📦"),
        (34, 7, 3, "Name city places", "star", "el museo", "the museum", "🏛️"),
        (35, 7, 4, "Find the station", "headphones", "la estación", "the station", "🚉"),
        (36, 8, 1, "Name languages", "book", "español", "Spanish", "🇪🇸"),
        (37, 8, 2, "Talk about speaking", "headphones", "hablo español", "I speak Spanish", "🗣️"),
        (38, 8, 3, "Ask about languages", "star", "inglés", "English", "🇬🇧"),
        (39, 8, 4, "Practice language phrases", "headphones", "aprendo español", "I learn Spanish", "📚"),
        (40, 8, 5, "Language review", "trophy", "francés", "French", "🇫🇷"),
    ]
    connection.executemany(
        "UPDATE skills SET sort_order = 5 WHERE id = ?",
        [(review_id,) for review_id in (3, 6, 9, 12, 15, 18, 21)],
    )
    for skill_id, unit_id, order, title, icon, spanish, english, emoji in additional_skills:
        connection.execute(
            "INSERT OR IGNORE INTO skills (id, unit_id, title, icon, sort_order, lesson_count) VALUES (?, ?, ?, ?, ?, 1)",
            (skill_id, unit_id, title, icon, order),
        )
        connection.execute(
            "INSERT OR IGNORE INTO lessons (id, skill_id, title, sort_order) VALUES (?, ?, ?, 1)",
            (skill_id, skill_id, title),
        )
        if connection.execute("SELECT 1 FROM exercises WHERE lesson_id = ?", (skill_id,)).fetchone():
            continue
        spanish_sentence = spanish[0].upper() + spanish[1:] + "."
        english_sentence = english[0].upper() + english[1:] + "."
        word_answer = english.split()
        rows = [
            ("choice", f"Which one of these is ‘{english}’?", {"choices": [
                {"label": "un café", "emoji": "☕"}, {"label": spanish, "emoji": emoji}, {"label": "agua", "emoji": "💧"},
            ]}, spanish, f"‘{spanish}’ means ‘{english}’."),
            ("word_bank", "Write this in English", {"phrase": spanish_sentence, "words": [*word_answer, "coffee", "water"]}, word_answer, f"‘{spanish}’ means ‘{english}’."),
            ("match", "Match the pairs", {"pairs": [[spanish, english], ["agua", "water"], ["leche", "milk"]]},
             [[spanish, english], ["agua", "water"], ["leche", "milk"]], "Nice matching!"),
            ("fill_blank", "Complete the Spanish translation", {"before": "", "after": ".", "translation": english_sentence,
             "choices": [spanish, "café", "agua"]}, spanish, spanish_sentence),
            ("type", "Type this in Spanish", {"phrase": english_sentence, "placeholder": "Type in Spanish"}, spanish, spanish_sentence),
        ]
        for exercise_order, (exercise_type, prompt, payload, answer, explanation) in enumerate(rows, 1):
            connection.execute(
                "INSERT INTO exercises (lesson_id, sort_order, type, prompt, payload_json, answer_json, explanation) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (skill_id, exercise_order, exercise_type, prompt, json.dumps(payload, ensure_ascii=False),
                 json.dumps(answer, ensure_ascii=False), explanation),
            )

    # Continue each unit with six more playable lessons before its review.
    # IDs are stable so future content updates do not invalidate saved progress.
    extended_vocabulary = {
        1: [
            ("Ask for water", "headphones", "el agua", "water", "💧"),
            ("Order milk", "star", "la leche", "milk", "🥛"),
            ("Add sugar", "book", "el azúcar", "sugar", "🍬"),
            ("Choose a dessert", "star", "el helado", "ice cream", "🍦"),
            ("Order a juice", "headphones", "el jugo", "juice", "🧃"),
            ("Ask for the bill", "star", "la cuenta", "the bill", "🧾"),
        ],
        2: [
            ("Practice hola", "headphones", "hola", "hello", "👋"),
            ("Greet in the morning", "star", "buenos días", "good morning", "🌅"),
            ("Greet at night", "book", "buenas noches", "good night", "🌙"),
            ("See you later", "star", "hasta luego", "see you later", "🙋"),
            ("Ask how someone is", "headphones", "¿cómo estás?", "how are you?", "💬"),
            ("Meet someone", "star", "mucho gusto", "nice to meet you", "🤝"),
        ],
        3: [
            ("Name Spain", "star", "España", "Spain", "🇪🇸"),
            ("Name Mexico", "headphones", "México", "Mexico", "🇲🇽"),
            ("Name the United States", "book", "Estados Unidos", "United States", "🇺🇸"),
            ("Say your origin", "star", "soy de España", "I am from Spain", "🗺️"),
            ("Live in Mexico", "headphones", "vivo en México", "I live in Mexico", "🏡"),
            ("Describe nationality", "star", "soy español", "I am Spanish", "🌍"),
        ],
        4: [
            ("Talk about a brother", "headphones", "mi hermano", "my brother", "👦"),
            ("Talk about a sister", "star", "mi hermana", "my sister", "👧"),
            ("Introduce a son", "book", "mi hijo", "my son", "👶"),
            ("Introduce a daughter", "star", "mi hija", "my daughter", "👧"),
            ("Introduce your friends", "headphones", "mis amigos", "my friends", "🧑‍🤝‍🧑"),
            ("Say my family", "star", "mi familia", "my family", "👨‍👩‍👧"),
        ],
        5: [
            ("Describe a friendly person", "star", "simpático", "friendly", "😊"),
            ("Say someone is funny", "headphones", "divertido", "funny", "😄"),
            ("Say someone is smart", "book", "inteligente", "intelligent", "🧠"),
            ("Describe a serious person", "star", "serio", "serious", "🧐"),
            ("Say someone works hard", "headphones", "trabajador", "hardworking", "💪"),
            ("Say someone is generous", "star", "generoso", "generous", "🎁"),
        ],
        6: [
            ("Find the key", "star", "la llave", "the key", "🔑"),
            ("Find the book", "headphones", "el libro", "the book", "📚"),
            ("Find the chair", "book", "la silla", "the chair", "🪑"),
            ("Say underneath", "star", "debajo", "underneath", "⬇️"),
            ("Say on top", "headphones", "encima", "on top", "⬆️"),
            ("Say next to", "star", "al lado", "next to", "↔️"),
        ],
        7: [
            ("Visit the park", "star", "el parque", "the park", "🌳"),
            ("Find a street", "headphones", "la calle", "the street", "🛣️"),
            ("Find the bank", "book", "el banco", "the bank", "🏦"),
            ("Visit a restaurant", "star", "el restaurante", "the restaurant", "🍽️"),
            ("Visit the library", "headphones", "la biblioteca", "the library", "📚"),
            ("Go to the right", "star", "a la derecha", "to the right", "➡️"),
        ],
        8: [
            ("Name German", "star", "alemán", "German", "🇩🇪"),
            ("Name Italian", "headphones", "italiano", "Italian", "🇮🇹"),
            ("Name Portuguese", "book", "portugués", "Portuguese", "🇵🇹"),
            ("Say what you speak", "star", "hablo inglés", "I speak English", "🗣️"),
            ("Ask about French", "headphones", "¿hablas francés?", "do you speak French?", "🇫🇷"),
            ("Say you want to learn", "star", "quiero aprender", "I want to learn", "📖"),
        ],
    }
    connection.execute("UPDATE skills SET sort_order = 11 WHERE icon = 'trophy' AND unit_id BETWEEN 1 AND 8")
    for unit_id, vocabulary in extended_vocabulary.items():
        unit_words = [(spanish, english, emoji) for _, _, spanish, english, emoji in vocabulary]
        for offset, (title, icon, spanish, english, emoji) in enumerate(vocabulary):
            skill_id = 41 + (unit_id - 1) * 6 + offset
            connection.execute(
                "INSERT OR IGNORE INTO skills (id, unit_id, title, icon, sort_order, lesson_count) VALUES (?, ?, ?, ?, ?, 1)",
                (skill_id, unit_id, title, icon, offset + 5),
            )
            connection.execute(
                "INSERT OR IGNORE INTO lessons (id, skill_id, title, sort_order) VALUES (?, ?, ?, 1)",
                (skill_id, skill_id, title),
            )
            connection.execute("UPDATE skills SET title = ? WHERE id = ?", (title, skill_id))
            connection.execute("UPDATE lessons SET title = ? WHERE id = ?", (title, skill_id))
            if connection.execute("SELECT 1 FROM exercises WHERE lesson_id = ?", (skill_id,)).fetchone():
                continue
            distractors = [word for word in unit_words if word[0] != spanish and word[1] != english]
            choice_words = [(spanish, english, emoji), *distractors[:2]]
            word_choices = [*english.split(), *[word[1] for word in distractors[:2]]]
            fill_choices = [spanish, *[word[0] for word in distractors[:2]]]
            rng = random.Random(skill_id)
            rng.shuffle(choice_words)
            rng.shuffle(word_choices)
            rng.shuffle(fill_choices)
            match_words = [(spanish, english), *[(word[0], word[1]) for word in distractors[:2]]]
            rows = [
                ("choice", f"Which one of these is ‘{english}’?",
                 {"choices": [{"label": source, "emoji": picture} for source, _, picture in choice_words]},
                 spanish, f"‘{spanish}’ means ‘{english}’."),
                ("word_bank", "Write this in English",
                 {"phrase": spanish, "words": word_choices},
                 english.split(), f"‘{spanish}’ means ‘{english}’."),
                ("match", "Match the pairs", {"pairs": [[source, target] for source, target in match_words]},
                 [[source, target] for source, target in match_words], "Nice matching!"),
                ("fill_blank", "Complete the Spanish translation",
                 {"before": "", "after": "", "translation": english,
                  "choices": fill_choices},
                 spanish, f"‘{spanish}’ means ‘{english}’."),
                ("type", "Type this in Spanish", {"phrase": english, "placeholder": "Type in Spanish"},
                 spanish, f"‘{spanish}’ means ‘{english}’."),
            ]
            for exercise_order, (exercise_type, prompt, payload, answer, explanation) in enumerate(rows, 1):
                connection.execute(
                    "INSERT INTO exercises (lesson_id, sort_order, type, prompt, payload_json, answer_json, explanation) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (skill_id, exercise_order, exercise_type, prompt, json.dumps(payload, ensure_ascii=False),
                     json.dumps(answer, ensure_ascii=False), explanation),
                )


def sync_first_lesson_reference(connection: sqlite3.Connection) -> None:
    """Keep the observed Unit 1, Lesson 1 sequence in existing databases."""
    def picture(word: str, choices: list[tuple[str, str]], answer: str):
        return ("choice", f"Which one of these is “{word}”?",
                {"choices": [{"label": label, "emoji": emoji} for label, emoji in choices], "tag": "NEW WORD"},
                answer, f"{answer} means {word}.")

    def meaning(word: str, choices: list[str], answer: str):
        return ("choice", "Select the correct meaning",
                {"mode": "meaning", "phrase": word, "choices": [{"label": choice} for choice in choices]},
                answer, f"{answer} means {word}.")

    pairs = [["cat", "gato"], ["milk", "leche"], ["mom", "mamá"], ["water", "agua"], ["dog", "perro"]]
    rows = [
        picture("cat", [("gato", "🐈"), ("papá", "👨"), ("agua", "💧")], "gato"),
        picture("dog", [("papá", "👨"), ("perro", "🐕"), ("agua", "💧")], "perro"),
        picture("water", [("gato", "🐈"), ("papá", "👨"), ("agua", "💧")], "agua"),
        picture("milk", [("mamá", "👩"), ("gato", "🐈"), ("leche", "🥛")], "leche"),
        ("match", "Select the matching pairs", {"pairs": pairs, "right_order": ["mamá", "perro", "gato", "leche", "agua"]}, pairs, "Correct!"),
        meaning("dog", ["agua", "perro", "gato"], "perro"),
        meaning("water", ["leche", "agua", "perro"], "agua"),
        picture("mom", [("agua", "💧"), ("mamá", "👩"), ("gato", "🐈")], "mamá"),
        picture("dad", [("gato", "🐈"), ("papá", "👨"), ("leche", "🥛")], "papá"),
        meaning("dad", ["leche", "mamá", "papá"], "papá"),
        meaning("cat", ["perro", "gato", "agua"], "gato"),
        ("match", "Select the matching pairs", {"pairs": [["mom", "mamá"], ["milk", "leche"],
                                                ["cat", "gato"], ["water", "agua"], ["dog", "perro"]],
                                                "right_order": ["perro", "agua", "leche", "gato", "mamá"]},
         [["mom", "mamá"], ["milk", "leche"], ["cat", "gato"], ["water", "agua"], ["dog", "perro"]], "Nice!"),
    ]
    rows[0][2]["reference_lesson"] = True
    for order, (kind, prompt, payload, expected, explanation) in enumerate(rows, 1):
        connection.execute(
            "UPDATE exercises SET type = ?, prompt = ?, payload_json = ?, answer_json = ?, explanation = ?, is_active = 1 "
            "WHERE lesson_id = 1 AND sort_order = ?",
            (kind, prompt, json.dumps(payload, ensure_ascii=False), json.dumps(expected, ensure_ascii=False),
             explanation, order),
        )
    # Preserve old answer records while hiding the former thirteenth question.
    connection.execute("UPDATE exercises SET is_active = 0 WHERE lesson_id = 1 AND sort_order > 12")


def sync_second_lesson_reference(connection: sqlite3.Connection) -> None:
    """Keep the observed Unit 1, Lesson 2 sequence in existing databases."""
    def picture(word: str, choices: list[tuple[str, str]], answer: str):
        return ("choice", f"Which one of these is “{word}”?",
                {"choices": [{"label": label, "emoji": emoji} for label, emoji in choices], "tag": "NEW WORD"},
                answer, f"{answer} means {word}.")

    def meaning(word: str, choices: list[str], answer: str):
        return ("choice", "Select the correct meaning",
                {"mode": "meaning", "phrase": word, "choices": [{"label": choice} for choice in choices]},
                answer, f"{answer} means {word}.")

    first_pairs = [["mom", "mamá"], ["dog", "perro"], ["dad", "papá"], ["book", "libro"], ["house", "casa"]]
    second_pairs = [["cat", "gato"], ["suitcase", "maleta"], ["water", "agua"], ["house", "casa"], ["milk", "leche"]]
    final_pairs = [["my house", "mi casa"], ["my dog", "mi perro"], ["my mom", "mi mamá"], ["my cat", "mi gato"], ["my dad", "mi papá"]]
    rows = [
        picture("book", [("libro", "📖"), ("perro", "🐕"), ("agua", "💧")], "libro"),
        picture("house", [("libro", "📖"), ("casa", "🏠"), ("perro", "🐕")], "casa"),
        picture("suitcase", [("casa", "🏠"), ("leche", "🥛"), ("maleta", "🧳")], "maleta"),
        ("match", "Select the matching pairs", {"pairs": first_pairs, "right_order": ["casa", "libro", "perro", "papá", "mamá"]}, first_pairs, "Correct!"),
        ("match", "Select the matching pairs", {"pairs": second_pairs, "right_order": ["gato", "maleta", "leche", "agua", "casa"]}, second_pairs, "Correct!"),
        ("word_bank", "Write this in English", {"phrase": "Mi maleta.", "words": ["suitcase", "cat", "my", "house"]}, ["my", "suitcase"], "Mi maleta means my suitcase."),
        meaning("suitcase", ["casa", "maleta", "libro"], "maleta"),
        ("word_bank", "Write this in English", {"phrase": "Mi casa.", "words": ["book", "house", "my", "dog"]}, ["my", "house"], "Mi casa means my house."),
        meaning("house", ["maleta", "casa", "libro"], "casa"),
        ("word_bank", "Write this in English", {"phrase": "Mi libro.", "words": ["cat", "my", "book", "dog"]}, ["my", "book"], "Mi libro means my book."),
        meaning("book", ["libro", "perro", "agua"], "libro"),
        ("match", "Select the matching pairs", {"pairs": final_pairs, "right_order": ["mi casa", "mi perro", "mi mamá", "mi gato", "mi papá"]}, final_pairs, "Nice!"),
    ]
    rows[0][2]["reference_lesson"] = True
    for order, (kind, prompt, payload, expected, explanation) in enumerate(rows, 1):
        connection.execute(
            "UPDATE exercises SET type = ?, prompt = ?, payload_json = ?, answer_json = ?, explanation = ?, is_active = 1 "
            "WHERE lesson_id = 2 AND sort_order = ?",
            (kind, prompt, json.dumps(payload, ensure_ascii=False), json.dumps(expected, ensure_ascii=False), explanation, order),
        )
    connection.execute("UPDATE exercises SET is_active = 0 WHERE lesson_id = 2 AND sort_order > 12")


def sync_third_lesson_reference(connection: sqlite3.Connection) -> None:
    """Keep Unit 1, Lesson 3 as a complete café vocabulary lesson."""
    def picture(word: str, choices: list[tuple[str, str]], answer: str):
        return ("choice", f"Which one of these is “{word}”?",
                {"choices": [{"label": label, "emoji": emoji} for label, emoji in choices], "tag": "NEW WORD"},
                answer, f"{answer} means {word}.")

    def meaning(word: str, choices: list[str], answer: str):
        return ("choice", "Select the correct meaning",
                {"mode": "meaning", "phrase": word, "choices": [{"label": choice} for choice in choices]},
                answer, f"{answer} means {word}.")

    pairs = [["tea", "té"], ["bread", "pan"], ["coffee", "café"], ["milk", "leche"], ["water", "agua"]]
    rows = [
        picture("tea", [("té", "🍵"), ("pan", "🥖"), ("agua", "💧")], "té"),
        picture("bread", [("café", "☕"), ("pan", "🥖"), ("leche", "🥛")], "pan"),
        picture("coffee", [("agua", "💧"), ("café", "☕"), ("té", "🍵")], "café"),
        ("match", "Select the matching pairs", {"pairs": pairs,
         "right_order": ["pan", "agua", "té", "leche", "café"]}, pairs, "Correct!"),
        meaning("tea", ["té", "café", "pan"], "té"),
        ("word_bank", "Write this in English", {"phrase": "Un té, por favor.",
         "words": ["a", "tea", "please", "coffee"]}, ["a", "tea", "please"], "Un té means a tea."),
        picture("ice", [("hielo", "🧊"), ("azúcar", "🍬"), ("leche", "🥛")], "hielo"),
        meaning("bread", ["café", "pan", "hielo"], "pan"),
        ("word_bank", "Write this in English", {"phrase": "Un café, por favor.",
         "words": ["a", "coffee", "please", "tea"]}, ["a", "coffee", "please"], "Un café means a coffee."),
        ("match", "Select the matching pairs", {"pairs": [["tea", "té"], ["coffee", "café"],
         ["ice", "hielo"], ["bread", "pan"]], "right_order": ["café", "hielo", "pan", "té"]},
         [["tea", "té"], ["coffee", "café"], ["ice", "hielo"], ["bread", "pan"]], "Nice!"),
        meaning("ice", ["hielo", "leche", "agua"], "hielo"),
        ("word_bank", "Write this in English", {"phrase": "Quiero un pan.",
         "words": ["I", "want", "a", "bread", "coffee"]}, ["I", "want", "a", "bread"], "Quiero un pan means I want a bread."),
    ]
    rows[0][2]["reference_lesson"] = True
    for order, (kind, prompt, payload, expected, explanation) in enumerate(rows, 1):
        updated = connection.execute(
            "UPDATE exercises SET type = ?, prompt = ?, payload_json = ?, answer_json = ?, explanation = ?, is_active = 1 "
            "WHERE lesson_id = 22 AND sort_order = ?",
            (kind, prompt, json.dumps(payload, ensure_ascii=False), json.dumps(expected, ensure_ascii=False), explanation, order),
        )
        if updated.rowcount == 0:
            connection.execute(
                "INSERT INTO exercises (lesson_id, sort_order, type, prompt, payload_json, answer_json, explanation, is_active) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, 1)",
                (22, order, kind, prompt, json.dumps(payload, ensure_ascii=False), json.dumps(expected, ensure_ascii=False), explanation),
            )
    connection.execute("UPDATE exercises SET is_active = 0 WHERE lesson_id = 22 AND sort_order > 12")


def migrate_schema(connection: sqlite3.Connection) -> None:
    if "is_active" not in {row[1] for row in connection.execute("PRAGMA table_info(exercises)")}:
        connection.execute("ALTER TABLE exercises ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1")
    if "client_id" not in {row[1] for row in connection.execute("PRAGMA table_info(users)")}:
        connection.execute("ALTER TABLE users ADD COLUMN client_id TEXT")
    connection.execute("CREATE UNIQUE INDEX IF NOT EXISTS users_client_id_idx ON users(client_id)")


with db() as connection:
    connection.executescript(SCHEMA)
    migrate_schema(connection)
    seed(connection)
    sync_reference_path(connection)
    sync_first_lesson_reference(connection)
    sync_second_lesson_reference(connection)
    sync_third_lesson_reference(connection)


def learner(connection: sqlite3.Connection, client_id: str) -> int:
    try:
        identifier = str(UUID(client_id))
    except (ValueError, TypeError, AttributeError):
        raise HTTPException(400, "Invalid learner ID") from None
    row = connection.execute("SELECT id FROM users WHERE client_id = ?", (identifier,)).fetchone()
    if row:
        return row["id"]
    stamp = now().isoformat()
    connection.execute(
        "INSERT OR IGNORE INTO users (username, display_name, client_id, joined_at, xp, gems, hearts, hearts_updated_at, streak, daily_xp, daily_xp_date) VALUES (?, 'Your Name', ?, ?, 0, 0, 0, ?, 0, 0, ?)",
        (f"learner_{identifier.replace('-', '')}", identifier, stamp, stamp, date.today().isoformat()),
    )
    return connection.execute("SELECT id FROM users WHERE client_id = ?", (identifier,)).fetchone()["id"]


def refresh_user(connection: sqlite3.Connection, user_id: int) -> dict[str, Any]:
    user = as_dict(connection.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone())
    assert user
    elapsed = now() - datetime.fromisoformat(user["hearts_updated_at"])
    gained = max(0, int(elapsed.total_seconds() // 1800))
    has_started = connection.execute("SELECT 1 FROM lesson_sessions WHERE user_id = ? LIMIT 1", (user_id,)).fetchone()
    if gained and user["hearts"] < 5 and has_started:
        hearts = min(5, user["hearts"] + gained)
        updated = (datetime.fromisoformat(user["hearts_updated_at"]) + timedelta(minutes=30 * gained)).isoformat()
        connection.execute("UPDATE users SET hearts = ?, hearts_updated_at = ? WHERE id = ?", (hearts, updated, user_id))
        user["hearts"] = hearts
        user["hearts_updated_at"] = updated
    if user["daily_xp_date"] != date.today().isoformat():
        connection.execute("UPDATE users SET daily_xp = 0, daily_xp_date = ? WHERE id = ?", (date.today().isoformat(), user_id))
        user["daily_xp"] = 0
        user["daily_xp_date"] = date.today().isoformat()
    return user


def path_data(connection: sqlite3.Connection, user_id: int) -> list[dict[str, Any]]:
    units = [dict(row) for row in connection.execute("SELECT * FROM units ORDER BY sort_order")]
    skills = [dict(row) for row in connection.execute("""
      SELECT s.*, l.id AS lesson_id, COALESCE(p.completed_lessons, 0) AS completed_lessons
      FROM skills s JOIN lessons l ON l.skill_id = s.id
      JOIN units u ON u.id = s.unit_id
      LEFT JOIN skill_progress p ON p.skill_id = s.id AND p.user_id = ?
      ORDER BY u.sort_order, s.sort_order, s.id
    """, (user_id,))]
    first_incomplete = next((skill["id"] for skill in skills if skill["completed_lessons"] < skill["lesson_count"]), None)
    for skill in skills:
        skill["state"] = "completed" if skill["completed_lessons"] >= skill["lesson_count"] else ("available" if skill["id"] == first_incomplete else "locked")
    for unit in units:
        unit["skills"] = [skill for skill in skills if skill["unit_id"] == unit["id"]]
    return units


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/bootstrap")
def bootstrap(x_learner_id: str = Header(...)):
    with db() as connection:
        user_id = learner(connection, x_learner_id)
        user = refresh_user(connection, user_id)
        leaders = [
            {"name": "定", "xp": 114, "avatar": "定"},
            {"name": "Günel Günel", "xp": 111, "avatar": "G"},
            {"name": "Santiago", "xp": 94, "avatar": "S"},
            {"name": "Shruti Thakre", "xp": 89, "avatar": "S"},
            {"name": "Duo_247b49b8", "xp": 83, "avatar": "D"},
            {"name": "Pauleen Joy Bonaobra", "xp": 82, "avatar": "P"},
            {"name": user["display_name"], "xp": user["xp"], "avatar": user["display_name"][0].upper(), "me": True},
        ]
        leaders.sort(key=lambda person: person["xp"], reverse=True)
        return {
            "user": user,
            "units": path_data(connection, user_id),
            "leaderboard": leaders,
        }


class AnswerIn(BaseModel):
    exercise_id: int
    answer: Any


@app.post("/api/lessons/{lesson_id}/start")
def start_lesson(lesson_id: int, x_learner_id: str = Header(...)):
    with db() as connection:
        user_id = learner(connection, x_learner_id)
        user = refresh_user(connection, user_id)
        skill = connection.execute("SELECT skill_id FROM lessons WHERE id = ?", (lesson_id,)).fetchone()
        if not skill:
            raise HTTPException(404, "Lesson not found")
        state = next((s["state"] for u in path_data(connection, user_id) for s in u["skills"] if s["id"] == skill["skill_id"]), None)
        if state == "locked":
            raise HTTPException(403, "Complete the previous skill first")
        first_lesson = not connection.execute("SELECT 1 FROM lesson_sessions WHERE user_id = ? LIMIT 1", (user_id,)).fetchone()
        if user["hearts"] < 1 and first_lesson:
            connection.execute("UPDATE users SET hearts = 5, hearts_updated_at = ? WHERE id = ?", (now().isoformat(), user_id))
            user["hearts"] = 5
        if user["hearts"] < 1:
            raise HTTPException(403, "Out of hearts")
        session_id = str(uuid4())
        connection.execute("INSERT INTO lesson_sessions (id, user_id, lesson_id, started_at) VALUES (?, ?, ?, ?)", (session_id, user_id, lesson_id, now().isoformat()))
        exercises = [dict(row) for row in connection.execute("SELECT id, sort_order, type, prompt, payload_json FROM exercises WHERE lesson_id = ? AND is_active = 1 ORDER BY sort_order", (lesson_id,))]
        for exercise in exercises:
            exercise["payload"] = json.loads(exercise.pop("payload_json"))
        return {"session_id": session_id, "exercises": exercises, "hearts": user["hearts"]}


def normalize(value: Any) -> Any:
    if isinstance(value, str):
        return " ".join(value.lower().strip().strip(".!?¿¡").split())
    if isinstance(value, list):
        return [normalize(item) for item in value]
    return value


def next_streak(current: int, last_active: date | None, today: date) -> tuple[int, bool]:
    """Count one active day, preserving the streak for repeat lessons that day."""
    if last_active == today:
        return current, False
    if last_active == today - timedelta(days=1):
        return current + 1, True
    return 1, True


@app.post("/api/sessions/{session_id}/answer")
def answer(session_id: str, submitted: AnswerIn, x_learner_id: str = Header(...)):
    with db() as connection:
        user_id = learner(connection, x_learner_id)
        session = connection.execute("SELECT * FROM lesson_sessions WHERE id = ?", (session_id,)).fetchone()
        if not session or session["status"] != "active" or session["user_id"] != user_id:
            raise HTTPException(404, "Active lesson session not found")
        exercise = connection.execute("SELECT * FROM exercises WHERE id = ? AND lesson_id = ?", (submitted.exercise_id, session["lesson_id"])).fetchone()
        if not exercise:
            raise HTTPException(400, "Exercise is not in this lesson")
        answered = connection.execute("SELECT COUNT(*) FROM session_answers WHERE session_id = ?", (session_id,)).fetchone()[0]
        if exercise["sort_order"] != answered + 1:
            raise HTTPException(409, "Exercises must be answered in order")
        expected = json.loads(exercise["answer_json"])
        if exercise["type"] == "match":
            correct = sorted(map(str, submitted.answer)) == sorted(map(str, expected)) if isinstance(submitted.answer, list) else False
        else:
            correct = normalize(submitted.answer) == normalize(expected)
        connection.execute(
            "INSERT INTO session_answers VALUES (?, ?, ?, ?, ?)",
            (session_id, submitted.exercise_id, json.dumps(submitted.answer, ensure_ascii=False), int(correct), now().isoformat()),
        )
        if correct:
            connection.execute("UPDATE lesson_sessions SET correct_count = correct_count + 1 WHERE id = ?", (session_id,))
        else:
            connection.execute("UPDATE users SET hearts = MAX(0, hearts - 1), hearts_updated_at = ? WHERE id = ?", (now().isoformat(), user_id))
        user = refresh_user(connection, user_id)
        total = connection.execute("SELECT COUNT(*) FROM exercises WHERE lesson_id = ? AND is_active = 1", (session["lesson_id"],)).fetchone()[0]
        failed = user["hearts"] == 0
        complete = answered + 1 == total and not failed
        xp_awarded = 0
        streak_advanced = False
        streak = user["streak"]
        accuracy = 0
        if failed:
            connection.execute("UPDATE lesson_sessions SET status = 'failed', finished_at = ? WHERE id = ?", (now().isoformat(), session_id))
        elif complete:
            correct_count = session["correct_count"] + int(correct)
            accuracy = round(100 * correct_count / total)
            xp_awarded = 15 + (correct_count == total) * 5
            skill_id = connection.execute("SELECT skill_id FROM lessons WHERE id = ?", (session["lesson_id"],)).fetchone()[0]
            connection.execute("INSERT INTO skill_progress VALUES (?, ?, 1, ?) ON CONFLICT(user_id, skill_id) DO UPDATE SET completed_lessons = 1, completed_at = excluded.completed_at", (user_id, skill_id, now().isoformat()))
            today = date.today()
            last = date.fromisoformat(user["last_active_date"]) if user["last_active_date"] else None
            streak, streak_advanced = next_streak(user["streak"], last, today)
            connection.execute("UPDATE users SET xp = xp + ?, daily_xp = daily_xp + ?, streak = ?, last_active_date = ? WHERE id = ?", (xp_awarded, xp_awarded, streak, today.isoformat(), user_id))
            connection.execute("UPDATE lesson_sessions SET status = 'completed', finished_at = ? WHERE id = ?", (now().isoformat(), session_id))
        return {"correct": correct, "correct_answer": expected, "explanation": exercise["explanation"], "hearts": user["hearts"], "complete": complete, "failed": failed, "xp_awarded": xp_awarded, "accuracy": accuracy, "streak": streak, "streak_advanced": streak_advanced}


@app.post("/api/practice/refill")
def practice_refill(x_learner_id: str = Header(...)):
    with db() as connection:
        user_id = learner(connection, x_learner_id)
        user = refresh_user(connection, user_id)
        # Mocked practice action requested by the brief: it restores one heart.
        hearts = min(5, user["hearts"] + 1)
        connection.execute("UPDATE users SET hearts = ?, hearts_updated_at = ? WHERE id = ?", (hearts, now().isoformat(), user_id))
        return {"hearts": hearts}


@app.post("/api/hearts/refill")
def gems_refill(x_learner_id: str = Header(...)):
    with db() as connection:
        user_id = learner(connection, x_learner_id)
        user = refresh_user(connection, user_id)
        if user["gems"] < 350:
            raise HTTPException(400, "Not enough gems")
        connection.execute("UPDATE users SET hearts = 5, gems = gems - 350, hearts_updated_at = ? WHERE id = ?", (now().isoformat(), user_id))
        return {"hearts": 5, "gems": user["gems"] - 350}


class ProfileIn(BaseModel):
    display_name: str


@app.patch("/api/profile")
def update_profile(submitted: ProfileIn, x_learner_id: str = Header(...)):
    name = " ".join(submitted.display_name.split())
    if not 1 <= len(name) <= 40:
        raise HTTPException(400, "Name must be between 1 and 40 characters")
    with db() as connection:
        user_id = learner(connection, x_learner_id)
        connection.execute("UPDATE users SET display_name = ? WHERE id = ?", (name, user_id))
        return {"display_name": name}
