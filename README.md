# 💪 Workout Tracker

A mobile-first progressive overload tracker built as a single-page web app. No accounts, no backend — everything lives in your browser's `localStorage`. Hosted on GitHub Pages.

---

## Features

- **4-day rotation** — Heavy A → Aux A → Heavy B → Aux B, auto-advancing to the next workout on each visit
- **Set tracking with rep pills** — tap to log reps per set; tap again to decrement if you missed
- **Smart rest timer** — automatically suggests rest time based on whether you hit target reps, fell short, or failed
- **Auto weight progression** — weights increase when you hit target reps for the required number of consecutive sessions; each exercise has its own increment and success threshold
- **Superset support** — exercises that share a step are shown side-by-side and logged together
- **Warmup screen** — Heavy A and Heavy B include a guided warmup before the working sets
- **Workout history** — tap the 💪 logo to review your last 40 logged sets with date, weight, and reps
- **Session tracking** — sessions start on your first "Next" tap and complete on the done screen; stale sessions (opened on a different day) are auto-closed
- **3 AM logical day boundary** — a workout started at 11 PM and one at 2:45 AM count as the same day; 3:01 AM starts a new one
- **Default weights seeded on first install** — conservative starting weights pre-loaded so progression logic has a baseline immediately

---

## Workout Structure

### Heavy A
Barbell Back Squat · Barbell Bench Press · Barbell Shrugs · Incline DB Bench Press + DB Lateral Raises · Single Arm DB Row

### Heavy B
Barbell Overhead Press · Barbell Shrugs · Romanian Deadlift · Split Squats · Single Arm DB Row · Leg Extensions · Standing Calf Raises · Seated Calf Raises

### Aux A
Cable Wide Grip Row + Straight-Arm Pulldown · Cable Kneeling Lat Pulldown · Cable Straight Bar Pushdown · Cable Internal Rotation · Full Can/Scaption + Narrow Grip EZ Bar Curl · Glute Ham Raise + Copenhagen Planks · Standing Wrist Curls · Reverse Curls · Wrist Rollers

### Aux B
Cable Kneeling Face Pulls + Y-Raises · Cable Reverse Grip Lat Pulldown · Cable External Rotation Press · Cable Rope Pushdown · Cable High-to-Low Woodchoppers · Palloff Press · Side-lying External Rotations · Wide Grip Preacher Curl · DB Hammer Curls · Weighted Crunches · Ab Wheel Rollouts · Standing Wrist Extensions · DB Pronation/Supination

---

## Files

| File | Purpose |
|---|---|
| `index.html` | Shell HTML with nav and page containers |
| `styles.css` | All styles (dark theme, mobile-first) |
| `main.js` | Exercise library, progression logic, rendering, timers, localStorage I/O |

---

## Local Development

The three source files can be served as-is — no build step required for development.

```bash
# Any static file server works, e.g.:
npx serve .
# or
python3 -m http.server
```

Then open `http://localhost:3000` (or whichever port).

## Deployment (GitHub Pages)

Push `index.html`, `styles.css`, and `main.js` to the repo root. GitHub Pages serves them as-is; the browser fetches the CSS and JS normally.

---

## Data & Privacy

All data is stored locally in your browser via `localStorage`. Nothing is sent to any server. Clearing site data in your browser will erase your history and weights.

| Key | Contents |
|---|---|
| `workoutHistory` | Up to 500 logged set entries |
| `activeSessions` | In-progress session per logical day |
| `completedSessions` | Up to 365 completed session records |
