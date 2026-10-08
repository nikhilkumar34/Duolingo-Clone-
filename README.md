# LingoPath — Duolingo-inspired Spanish learning app

A full-stack learning-path demo built for the supplied assignment. It recreates the dark Duolingo web layout and the core lesson loop: unlock skills, answer varied exercises, receive instant feedback, earn XP, build a streak, and manage hearts. The Spanish course is seeded on first API startup; each browser gets a fresh learner profile.

## Stack

- **Frontend:** Next.js 16 App Router, React 19, TypeScript, CSS, local Nunito font, Lucide icons
- **Backend:** Python 3.11+, FastAPI, Uvicorn
- **Database:** SQLite via Python's standard `sqlite3` module

## Run locally

Open two terminals from the repository root.

**Backend**

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

**Frontend**

```powershell
cd frontend
npm install
Copy-Item .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). API docs are at [http://localhost:8000/docs](http://localhost:8000/docs).

On macOS/Linux, activate the virtual environment with `source .venv/bin/activate` and copy the environment file with `cp .env.example .env.local`.

## Configuration

| Variable | Location | Default | Purpose |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | Frontend | `http://localhost:8000` | Public API origin |
| `DUO_DB_PATH` | Backend | `backend/duolingo.db` | SQLite database file |
| `FRONTEND_ORIGINS` | Backend | `http://localhost:3000` | Comma-separated CORS origins |

For deployment, point `NEXT_PUBLIC_API_URL` at the public backend URL. Set `FRONTEND_ORIGINS` to the frontend URL. The SQLite database needs a persistent disk; an ephemeral filesystem will reset progress after a restart.

## Features

- Eight seeded units with 11 ordered lessons each (88 total), with completed, available, and locked path states. Each circular path node opens a real lesson.
- Lessons using **multiple choice, word bank translation, matching, fill in the blank, and typed answers**.
- Spanish and English pronunciation clips for the seeded lesson vocabulary.
- Server-checked answers, immediate feedback, progress bar, lesson completion and out-of-hearts states.
- Persistent XP, daily XP goal, streak, hearts, gems, and skill completion.
- First-visit welcome animation, zeroed starting stats, and an editable profile name. Starting lesson one grants five tutorial hearts so a new learner can play immediately.
- One heart regenerates every 30 minutes. Mocked practice restores one heart; 350 gems refill all hearts.
- Profile statistics and achievements, seeded leaderboard, quests, shop, practice, guidebook, and status popovers.
- Desktop and mobile layouts. Super, social, speech, and settings actions show clear placeholders.

## Architecture

`frontend/src/app/page.tsx` contains the app shell, page views, reusable cards, lesson player, and interaction state. `frontend/src/lib/api.ts` defines API types and fetch helpers. `frontend/src/app/globals.css` contains the responsive design system.

`backend/app/main.py` owns schema creation, seed data, progression rules, and HTTP endpoints. The backend is authoritative for answers, hearts, XP, and unlocks. The frontend receives only exercise prompts and options; the answer key stays in SQLite until feedback is returned.

### Database schema

| Table | Purpose / key relationships |
| --- | --- |
| `users` | One record per browser learner ID; editable name, XP, gems, hearts, streak, daily XP and activity dates |
| `units` | Ordered course units and display colors |
| `skills` | Ordered skills belonging to a unit |
| `lessons` | Lessons belonging to a skill |
| `exercises` | Ordered lesson questions, JSON prompt payloads and answer keys |
| `skill_progress` | Per-user completed lesson count, keyed by `(user_id, skill_id)` |
| `lesson_sessions` | Attempt state, start/end timestamps, correct count |
| `session_answers` | One checked answer per exercise in an attempt |

Foreign keys are enabled for every connection. A unique `(session_id, exercise_id)` key and ordered-answer checks prevent duplicate XP or jumping ahead within a session.

The frontend stores a random learner UUID in that browser's local storage and sends it as `X-Learner-Id`. This separates demo progress without requiring sign-up. Clearing browser storage starts a new profile. The ID is not an authentication credential, so this is appropriate for a demo rather than private user accounts.

### API overview

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | Health check |
| `GET /api/bootstrap` | Learner, path/unlocks, leaderboard |
| `POST /api/lessons/{lesson_id}/start` | Start an unlocked lesson and get questions |
| `POST /api/sessions/{session_id}/answer` | Check the next answer, update hearts, finish lesson and award XP |
| `POST /api/practice/refill` | Mocked practice: recover one heart |
| `POST /api/hearts/refill` | Spend 350 gems to refill hearts |
| `PATCH /api/profile` | Update the current learner's display name |

## Verification

From the repository root after installing backend requirements:

```powershell
$env:PYTHONPATH = "backend"
python -m unittest discover -s backend/tests -v
```

From `frontend/`:

```powershell
npm run typecheck
npm run build
```

The backend tests use a separate temporary database and cover a complete lesson, XP/unlock persistence, wrong-answer heart loss, failure, and practice refill.

## Assumptions and scope

- The demo uses per-browser learner IDs instead of account authentication.
- The Spanish course is seeded through Unit 8. Existing learner progress survives course content updates. Completed lessons can be replayed.
- Real social features, subscriptions, and purchasing are placeholders as permitted by the assignment.
- The leaderboard contains seeded peers and sorts the learner by current XP. It is a demo league rather than live multiplayer ranking.
- The interface is an original implementation inspired by the provided screenshots. Decorative graphics use CSS and emoji rather than copied Duolingo assets.

## Live demo

- Frontend: https://duolingo-clone-nikhil.vercel.app
- Backend health check: https://duolingo-clone-production-e382.up.railway.app/api/health
- Source: https://github.com/nikhilkumar34/Duolingo-Clone-

The public frontend runs on Vercel and calls the Railway API. Railway stores the SQLite database on a `/data` volume. Each visitor's browser keeps its own learner ID and progress.

## Deploy

Publish this repository to GitHub first, then:

1. Create a Railway service from the repository. In service settings set its root directory to `/backend`, start command to `uvicorn app.main:app --host 0.0.0.0 --port $PORT`, and healthcheck path to `/api/health`. Generate a public domain targeting port `8080`, and set `PORT=8080`.
2. Attach a Railway volume at `/data`. Set `DUO_DB_PATH=/data/duolingo.db` so XP, streaks, hearts, and completed lessons survive restarts. Set `FRONTEND_ORIGINS` to the final Vercel origin (or a comma-separated list of allowed origins).
3. Deploy `frontend/` to Vercel as a Next.js project. Set `NEXT_PUBLIC_API_URL` to the public Railway URL, including `https://` but no trailing slash. This demo was deployed with the Vercel CLI because the GitHub app connection was not configured. From `frontend/`, run `vercel deploy --prod` after linking the project. Redeploy if the variable changes because Next.js embeds public variables at build time.
4. Open the Vercel URL, complete a lesson, refresh, and verify the new XP and path state still appear. Submit both the public GitHub URL and the Vercel URL.

Railway [monorepo](https://docs.railway.com/deployments/monorepo) and [volume](https://docs.railway.com/volumes/reference) guides explain the root directory and persistent mount; Vercel documents [Next.js deployment](https://vercel.com/docs/frameworks/full-stack/nextjs) and [public environment variables](https://vercel.com/docs/environment-variables/framework-environment-variables). Railway's current UI no longer enables config-as-code for new services, so these settings are entered in the service dashboard.
