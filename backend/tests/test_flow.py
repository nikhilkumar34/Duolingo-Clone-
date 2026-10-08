"""Core progression and gamification checks against an isolated SQLite database."""

import tempfile
import unittest
from pathlib import Path

from app import main


class LessonFlowTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=Path(__file__).parent)
        self.original_path = main.DB_PATH
        main.DB_PATH = Path(self.temp.name) / "test.db"
        with main.db() as connection:
            connection.executescript(main.SCHEMA)
            main.seed(connection)
            main.sync_reference_path(connection)

    def tearDown(self):
        main.DB_PATH = self.original_path
        self.temp.cleanup()

    def test_lesson_completion_unlocks_next_skill_and_persists_xp(self):
        initial = main.bootstrap()
        self.assertEqual(initial["units"][0]["skills"][0]["state"], "completed")
        self.assertEqual(initial["units"][0]["skills"][1]["state"], "available")
        self.assertEqual(len(initial["units"]), 8)
        self.assertEqual([skill["id"] for skill in initial["units"][0]["skills"]],
                         [1, 2, 22, 23, 41, 42, 43, 44, 45, 46, 3])
        self.assertTrue(all(len(unit["skills"]) == 11 for unit in initial["units"]))
        started = main.start_lesson(2)
        self.assertEqual(len(started["exercises"]), 13)
        self.assertEqual(started["exercises"][-1]["payload"]["phrase"], "Quiero un helado y un vaso de agua.")
        with main.db() as connection:
            answers = [main.json.loads(row[0]) for row in connection.execute(
                "SELECT answer_json FROM exercises WHERE lesson_id = 2 ORDER BY sort_order"
            )]
        for exercise, answer in zip(started["exercises"], answers):
            result = main.answer(started["session_id"], main.AnswerIn(exercise_id=exercise["id"], answer=answer))
        self.assertTrue(result["complete"])
        self.assertEqual(result["xp_awarded"], 20)
        self.assertEqual(result["accuracy"], 100)
        self.assertTrue(result["streak_advanced"])
        self.assertEqual(result["streak"], 2)
        updated = main.bootstrap()
        self.assertEqual(updated["user"]["xp"], initial["user"]["xp"] + 20)
        self.assertEqual(updated["user"]["daily_xp"], initial["user"]["daily_xp"] + 20)
        self.assertEqual(updated["units"][0]["skills"][1]["state"], "completed")
        self.assertEqual(updated["units"][0]["skills"][2]["state"], "available")

    def test_path_lessons_unlock_in_display_order(self):
        for lesson_id, next_skill_id in [(2, 22), (22, 23), (23, 41), (41, 42)]:
            started = main.start_lesson(lesson_id)
            with main.db() as connection:
                answers = [main.json.loads(row[0]) for row in connection.execute(
                    "SELECT answer_json FROM exercises WHERE lesson_id = ? ORDER BY sort_order", (lesson_id,)
                )]
            for exercise, answer in zip(started["exercises"], answers):
                result = main.answer(started["session_id"], main.AnswerIn(exercise_id=exercise["id"], answer=answer))
            self.assertTrue(result["complete"])
            path = [skill for unit in main.bootstrap()["units"] for skill in unit["skills"]]
            self.assertEqual(next(skill for skill in path if skill["state"] == "available")["id"], next_skill_id)

    def test_extended_lessons_have_playable_exercises(self):
        with main.db() as connection:
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM skills").fetchone()[0], 88)
            for lesson_id in range(41, 89):
                kinds = {row[0] for row in connection.execute(
                    "SELECT type FROM exercises WHERE lesson_id = ?", (lesson_id,)
                )}
                self.assertEqual(kinds, {"choice", "word_bank", "match", "fill_blank", "type"})

    def test_wrong_answers_consume_hearts_and_practice_restores_one(self):
        started = main.start_lesson(2)
        for exercise in started["exercises"][:5]:
            result = main.answer(started["session_id"], main.AnswerIn(exercise_id=exercise["id"], answer=None))
        self.assertTrue(result["failed"])
        self.assertEqual(result["hearts"], 0)
        self.assertEqual(main.bootstrap()["user"]["xp"], 74)
        self.assertEqual(main.practice_refill()["hearts"], 1)
        self.assertEqual(main.bootstrap()["user"]["hearts"], 1)

    def test_streak_is_awarded_once_per_day(self):
        started = main.start_lesson(2)
        with main.db() as connection:
            answers = [main.json.loads(row[0]) for row in connection.execute(
                "SELECT answer_json FROM exercises WHERE lesson_id = 2 ORDER BY sort_order"
            )]
        for exercise, answer in zip(started["exercises"], answers):
            first = main.answer(started["session_id"], main.AnswerIn(exercise_id=exercise["id"], answer=answer))
        self.assertTrue(first["streak_advanced"])
        again = main.start_lesson(2)
        for exercise, answer in zip(again["exercises"], answers):
            second = main.answer(again["session_id"], main.AnswerIn(exercise_id=exercise["id"], answer=answer))
        self.assertFalse(second["streak_advanced"])
        self.assertEqual(second["streak"], 2)
        self.assertEqual(main.bootstrap()["user"]["streak"], 2)

    def test_path_extension_is_idempotent(self):
        with main.db() as connection:
            before = [connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
                      for table in ("units", "skills", "lessons", "exercises")]
            main.sync_reference_path(connection)
            after = [connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
                     for table in ("units", "skills", "lessons", "exercises")]
        self.assertEqual(before, after)


if __name__ == "__main__":
    unittest.main()
