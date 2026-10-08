"""Core progression and gamification checks against an isolated SQLite database."""

import tempfile
import unittest
from pathlib import Path
from uuid import uuid4

from app import main


class LessonFlowTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=Path(__file__).parent)
        self.original_path = main.DB_PATH
        self.learner_id = str(uuid4())
        main.DB_PATH = Path(self.temp.name) / "test.db"
        with main.db() as connection:
            connection.executescript(main.SCHEMA)
            main.seed(connection)
            main.sync_reference_path(connection)

    def tearDown(self):
        main.DB_PATH = self.original_path
        self.temp.cleanup()

    def test_lesson_completion_unlocks_next_skill_and_persists_xp(self):
        initial = main.bootstrap(x_learner_id=self.learner_id)
        self.assertEqual(initial["user"]["display_name"], "Your Name")
        self.assertEqual((initial["user"]["xp"], initial["user"]["hearts"], initial["user"]["streak"]), (0, 0, 0))
        self.assertEqual(initial["units"][0]["skills"][0]["state"], "available")
        self.assertEqual(initial["units"][0]["skills"][1]["state"], "locked")
        self.assertEqual(len(initial["units"]), 8)
        self.assertEqual([skill["id"] for skill in initial["units"][0]["skills"]],
                         [1, 2, 22, 23, 41, 42, 43, 44, 45, 46, 3])
        self.assertTrue(all(len(unit["skills"]) == 11 for unit in initial["units"]))
        started = main.start_lesson(1, x_learner_id=self.learner_id)
        self.assertEqual(started["hearts"], 5)
        self.assertEqual(len(started["exercises"]), 13)
        self.assertEqual(started["exercises"][-1]["payload"]["phrase"], "Quiero un helado y un vaso de agua.")
        with main.db() as connection:
            answers = [main.json.loads(row[0]) for row in connection.execute(
                "SELECT answer_json FROM exercises WHERE lesson_id = 1 ORDER BY sort_order"
            )]
        for exercise, answer in zip(started["exercises"], answers):
            result = main.answer(started["session_id"], main.AnswerIn(exercise_id=exercise["id"], answer=answer), x_learner_id=self.learner_id)
        self.assertTrue(result["complete"])
        self.assertEqual(result["xp_awarded"], 20)
        self.assertEqual(result["accuracy"], 100)
        self.assertTrue(result["streak_advanced"])
        self.assertEqual(result["streak"], 1)
        updated = main.bootstrap(x_learner_id=self.learner_id)
        self.assertEqual(updated["user"]["xp"], initial["user"]["xp"] + 20)
        self.assertEqual(updated["user"]["daily_xp"], initial["user"]["daily_xp"] + 20)
        self.assertEqual(updated["units"][0]["skills"][0]["state"], "completed")
        self.assertEqual(updated["units"][0]["skills"][1]["state"], "available")

    def test_path_lessons_unlock_in_display_order(self):
        for lesson_id, next_skill_id in [(1, 2), (2, 22), (22, 23), (23, 41), (41, 42)]:
            started = main.start_lesson(lesson_id, x_learner_id=self.learner_id)
            with main.db() as connection:
                answers = [main.json.loads(row[0]) for row in connection.execute(
                    "SELECT answer_json FROM exercises WHERE lesson_id = ? ORDER BY sort_order", (lesson_id,)
                )]
            for exercise, answer in zip(started["exercises"], answers):
                result = main.answer(started["session_id"], main.AnswerIn(exercise_id=exercise["id"], answer=answer), x_learner_id=self.learner_id)
            self.assertTrue(result["complete"])
            path = [skill for unit in main.bootstrap(x_learner_id=self.learner_id)["units"] for skill in unit["skills"]]
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
        started = main.start_lesson(1, x_learner_id=self.learner_id)
        for exercise in started["exercises"][:5]:
            result = main.answer(started["session_id"], main.AnswerIn(exercise_id=exercise["id"], answer=None), x_learner_id=self.learner_id)
        self.assertTrue(result["failed"])
        self.assertEqual(result["hearts"], 0)
        self.assertEqual(main.bootstrap(x_learner_id=self.learner_id)["user"]["xp"], 0)
        self.assertEqual(main.practice_refill(x_learner_id=self.learner_id)["hearts"], 1)
        self.assertEqual(main.bootstrap(x_learner_id=self.learner_id)["user"]["hearts"], 1)

    def test_streak_is_awarded_once_per_day(self):
        started = main.start_lesson(1, x_learner_id=self.learner_id)
        with main.db() as connection:
            answers = [main.json.loads(row[0]) for row in connection.execute(
                "SELECT answer_json FROM exercises WHERE lesson_id = 1 ORDER BY sort_order"
            )]
        for exercise, answer in zip(started["exercises"], answers):
            first = main.answer(started["session_id"], main.AnswerIn(exercise_id=exercise["id"], answer=answer), x_learner_id=self.learner_id)
        self.assertTrue(first["streak_advanced"])
        again = main.start_lesson(1, x_learner_id=self.learner_id)
        for exercise, answer in zip(again["exercises"], answers):
            second = main.answer(again["session_id"], main.AnswerIn(exercise_id=exercise["id"], answer=answer), x_learner_id=self.learner_id)
        self.assertFalse(second["streak_advanced"])
        self.assertEqual(second["streak"], 1)
        self.assertEqual(main.bootstrap(x_learner_id=self.learner_id)["user"]["streak"], 1)

    def test_visitors_have_separate_progress_and_editable_names(self):
        other_id = str(uuid4())
        self.assertEqual(main.bootstrap(x_learner_id=other_id)["user"]["xp"], 0)
        saved = main.update_profile(main.ProfileIn(display_name="  Alex   Rivera  "), x_learner_id=self.learner_id)
        self.assertEqual(saved["display_name"], "Alex Rivera")
        self.assertEqual(main.bootstrap(x_learner_id=self.learner_id)["user"]["display_name"], "Alex Rivera")
        self.assertEqual(main.bootstrap(x_learner_id=other_id)["user"]["display_name"], "Your Name")
        started = main.start_lesson(1, x_learner_id=self.learner_id)
        self.assertEqual(main.bootstrap(x_learner_id=other_id)["user"]["hearts"], 0)
        with self.assertRaises(main.HTTPException):
            main.answer(started["session_id"], main.AnswerIn(exercise_id=started["exercises"][0]["id"], answer="anything"), x_learner_id=other_id)

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
