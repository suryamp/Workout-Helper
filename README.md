# 💪 Workout Tracker

**Live demo: [suryamp.github.io/Workout-Helper](https://suryamp.github.io/Workout-Helper/)**

A mobile-first progressive web app (PWA) for tracking a structured 4-day strength program. Built with vanilla JavaScript and IndexedDB — no framework, no build step.

---

## Features

- **4-day program rotation** — Heavy A, Aux A, Heavy B, Aux B, cycling automatically based on your last completed session
- **Smart rest timer** — auto-starts after each set with duration based on reps hit vs. target (easy/hard/failed)
- **Set widget** — tap pills to log reps, confirm sets, and track weight per exercise
- **Auto weight progression** — suggests weight increases when you hit your success criteria
- **Superset support** — paired exercises rendered as a single linked card
- **Warm-up slides** — shown before heavy days
- **Session management** — stale sessions from previous days are auto-closed on next open
- **History tab** — filterable workout log with day and date-range filters, per-exercise rep dots, volume, and load-more pagination
- **Session detail sheet** — tap any session to see per-set analytics, volume vs. last time, and progression state; swipe down to dismiss
- **Volume animal** — done screen and session detail compare your total session volume to a real-world animal weight
- **Wordle-style share** — share a compact rep-grid summary of any session via the native share sheet or clipboard
- **Weight modal** — tap the weight chip to update lbs for any exercise
- **Custom timer** — set any arbitrary rest duration
- **Settings** — dark/light theme, colorblind palette (blue/orange), lbs/kg unit toggle, keep-screen-on, reduce motion, force update, and factory reset
- **PWA-ready** — installable, offline-capable via service worker, viewport and apple-mobile-web-app meta tags included

---

## Tech Stack

| Layer | Choice |
|---|---|
| UI | Vanilla JS (ES modules) |
| Styling | Plain CSS with custom properties |
| Persistence | IndexedDB (no external library) |
| Build | None — runs directly from the file system or any static host |

---

## Project Structure

```
workout-tracker/
├── index.html
│
├── styles/
│   ├── tokens.css        # CSS custom properties (colors, radii, fonts)
│   ├── layout.css        # Nav, pages, containers, section labels
│   ├── components.css    # Cards, pills, buttons, modals, timer, history
│   └── animations.css    # All @keyframes
│
└── src/
    ├── main.js           # App entry: boot sequence + window.* globals
    │
    ├── data/
    │   ├── exercises.js     # EXERCISES library (pure data, no imports)
    │   ├── days.js          # DAYS programs + DAY_ROTATION + DAY_LABELS
    │   └── volumeAnimals.js # Animal weight comparison table + getVolumeAnimal()
    │
    ├── db/
    │   ├── index.js      # Public API barrel
    │   ├── connection.js # IDB singleton, schema (v1+v2), seeding
    │   ├── sessions.js   # Staging buffer, atomic flush, progression snapshot
    │   └── logs.js       # Progression, history, session details
    │
    ├── state/
    │   ├── setWidget.js  # In-memory set state map and mutations
    │   └── session.js    # Session lifecycle (start, complete, abandon, reconcile)
    │
    ├── ui/
    │   ├── render.js        # renderDay, carousel, progress bar, done screen
    │   ├── share.js         # Wordle-style share text builder + share/copy helper
    │   ├── sessionDetail.js # Per-session analytics bottom sheet
    │   ├── settings.js      # Settings page rendering and toggle handlers
    │   ├── modals.js        # Weight and custom timer modals
    │   ├── timer.js         # Countdown logic, two-phase smart timer
    │   ├── history.js       # History tab rendering and entry deletion
    │   ├── home.js          # Home screen day card grid
    │   ├── menu.js          # Hamburger menu bottom sheet
    │   └── nav.js           # showPage, setActiveTab
    │
    └── utils/
        ├── time.js       # getLogicalDay, endOfLogicalDay (pure helpers)
        ├── settings.js   # localStorage preferences: getSetting, getUnit, applyTheme, etc.
        └── wakeLock.js   # Screen Wake Lock API wrapper
```

---

## Getting Started

No build step required. Serve from any static file server:

```bash
# Python
python3 -m http.server 8080

# Node (npx)
npx serve .

# VS Code
# Use the "Live Server" extension and open index.html
```

Then open `http://localhost:8080` in your browser.

> **Note:** IndexedDB requires an HTTP origin (not `file://`). Use a local server as shown above.

---

## The 4-Day Program

| Day | Type | Key Exercises |
|---|---|---|
| **Heavy A** | Squat + Press | Back Squat, Bench Press, Shrugs, Incline DB + Laterals, DB Row |
| **Aux A** | Pull + Arms | Cable Rows, Lat Pulldowns, Pushdowns, Curls, GHR, Wrist Work |
| **Heavy B** | Press + Hinge | OHP, Shrugs, Romanian Deadlift, Split Squats, DB Row, Calves |
| **Aux B** | Shoulders + Core | Face Pulls, Y-Raises, Woodchoppers, Palloff Press, Ab Work |

The app auto-advances to the next day after a session is completed. Rotation order: **Heavy A → Aux A → Heavy B → Aux B → repeat**.

---

## Logical Day Boundary

The app uses a **3 AM logical day boundary** — workouts logged between midnight and 2:59 AM count toward the previous calendar day. This prevents late-night sessions from splitting across two days in the history.

---

## Workout Flow

1. Open the app — it navigates to your next scheduled day automatically
2. Heavy days begin with a **warm-up slide** (hip flexors, clamshells, TKEs, goblet squats)
3. For each exercise:
   - Tap the **weight chip** to set your working weight (lbs or kg, configurable in Settings)
   - Tap a **pill** to enter reps (starts at target, decrements on each tap)
   - Tap **Start New Set** to confirm — this locks the set and starts the rest timer
4. Hit **Next →** to advance; **← Prev** to go back
5. On the final exercise, tap **✓ Finish** to complete the session
6. Heavy days show an optional finisher (Farmer Carries, Vest Walk, Sandbag Carry) on the last slide

---

## Auto Progression

Each exercise tracks how many consecutive sessions you've hit the target rep count. When you reach the `successesNeeded` threshold, the app suggests a weight increase by the configured `increment` (typically 5 lbs for compounds, 2.5 lbs for isolation work). A level-up banner appears on the exercise card when a new weight is ready.

---

## CSS Architecture

Layers load in strict dependency order — each layer may only reference variables defined in a previous one:

```
tokens.css → layout.css → components.css → animations.css
```

- `animations.css` owns **all** `@keyframes` and reduce-motion overrides. `components.css` references keyframes by name but never defines them.
- Theming, colorblind palette, and dark/light variants are all done through CSS custom properties in `tokens.css` — toggled via `data-theme` and `data-colorblind` attributes on `<html>`.

---

## Adding a New Exercise

1. Add an entry to `EXERCISES` in `src/data/exercises.js` with `displayName`, `sets`, `reps`, `video`, `rest`, `progression`, `estMinutes`, and `defaultWeight`.
2. Add the exercise key to the appropriate day's `steps` array in `src/data/days.js`.
3. No other changes needed.

---

## Adding a New Day

1. Add an entry to `DAYS` in `src/data/days.js`.
2. Add the key to `DAY_ROTATION` (determines cycle order) and `DAY_LABELS`.
3. Add a nav button in `index.html` with matching `data-page` and `onclick="showPage('your-key', event)"`.
4. Add a corresponding `<div id="page-your-key">` and inner container.

---

## Known Gotchas

**`onclick=` requires `window.*` registration** — dynamically rendered HTML uses string `onclick="fnName(...)"`. Any new handler must be added to the `Object.assign(window, { ... })` block at the bottom of `src/main.js`. That block is the single authoritative list of globals.

**`completeSession` is idempotent by design** — `renderDay` calls it on every done-screen render. The guard in `session.js` (`if (!session || session.completedAt) return`) makes it safe to call multiple times. Don't remove it.

**`data-page` attributes must stay in sync** — `nav.js` matches active tabs via `tab.dataset.page`. If a nav button is missing this attribute or its value doesn't match the corresponding `showPage()` call, the active tab highlight will silently fail.

---

## IDB Schema

Current version: `SCHEMA_VER = 2` (defined in `src/db/connection.js`).

To add a store or index in a future version, bump to `3` and add an `if (event.oldVersion < 3)` block below the existing v1 and v2 blocks. Never modify shipped version blocks — existing users must only run the delta. See `ARCHITECTURE.md §12` for the full migration protocol.
