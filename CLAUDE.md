# CLAUDE.md — Workout Tracker

This file gives Claude the context needed to work effectively in this codebase.

---

## What this project is

A mobile-first PWA for tracking a 4-day strength program. Vanilla JS ES modules, plain CSS, IndexedDB. No framework, no build step, no bundler. Runs directly from a static file server.

---

## Running locally

```bash
npm run dev
# or: python3 -m http.server 8080
```

IndexedDB requires an HTTP origin — do not open `index.html` directly via `file://`.

---

## Running tests

```bash
npm run test:run      # single pass, what CI runs
npm test              # watch mode for active development
npm run test:coverage # coverage report
```

Tests live in `tests/` mirroring the `src/` structure. Always run `npm run test:run` after making changes and before committing — the pre-commit hook enforces this automatically. If a change breaks an existing test, fix the test or the code before proceeding; do not skip the hook with `--no-verify`.

---

## Architecture in one paragraph

`src/main.js` is the sole entry point. It boots the app, wires all globals, and is the only file that touches `window.*`. Rendering is done by `src/ui/render.js`, which writes `innerHTML` strings. In-memory set state lives in `src/state/setWidget.js`. Session lifecycle (start/complete/abandon/reconcile) lives in `src/state/session.js`. Persistence is split across three sub-modules under `src/db/`: `connection.js` (IDB singleton, schema, low-level helpers), `sessions.js` (staging buffer, session CRUD, atomic flush + progression snapshot), and `logs.js` (progression queries, history, session details). `src/db/index.js` is a barrel that re-exports the full public API — all callers outside `db/` import from there. Pure data — no logic — lives in `src/data/exercises.js`, `src/data/days.js`, and `src/data/volumeAnimals.js`. Time math (logical day boundary) lives in `src/utils/time.js` and is imported wherever needed — never duplicated. User preferences (theme, units, colorblind, reduce motion, wake lock) are stored in `localStorage` via `src/utils/settings.js`, which also owns the `applyTheme`, `applyColorblind`, and `applyReduceMotion` functions called at boot. Screen wake lock management lives in `src/utils/wakeLock.js`. The Settings page UI lives in `src/ui/settings.js`. Share-text generation lives in `src/ui/share.js`; the session detail bottom sheet lives in `src/ui/sessionDetail.js`.

---

## Key rules — read before making changes

### 1. `window.*` globals — one place only
Inline `onclick="fnName(...)"` attributes in dynamically built HTML strings require globally scoped functions. **The only place globals are declared is the `Object.assign(window, { ... })` block at the bottom of `src/main.js`.** If you add a new `onclick=` handler anywhere in rendered HTML, its backing function must be added there and only there. If an `onclick=` stops working, that block is the first place to check.

### 2. `completeSession` is called on every done-screen render — do not remove the guard
`renderDay` calls `completeSession(day)` whenever `idx >= total`. The guard in `session.js` (`if (!session || session.completedAt) return`) makes this idempotent. If the guard is removed, sessions will be double-committed.

### 3. CSS layer contract: tokens → layout → components → animations
Each CSS file may only reference variables defined in a previous layer. `animations.css` owns **all** `@keyframes`. `components.css` references them by name but never defines them. Do not put `@keyframes` in `components.css`.

`tokens.css` defines design tokens in `:root` and overrides them in `[data-theme="light"]`, `[data-colorblind]`, and `[data-theme="light"][data-colorblind]` attribute selectors. `animations.css` owns the `[data-reduce-motion]` motion-override rules and `@media (prefers-reduced-motion)` in addition to keyframes, since both are about suppressing motion. The `--accent-rgb` variable (e.g. `200,240,67`) exists so `rgba(var(--accent-rgb), 0.x)` tint values in components and keyframes adapt automatically when the colorblind palette swaps `--accent`.

### 4. Data files are zero-dependency
`src/data/exercises.js` and `src/data/days.js` import nothing. Keep them that way — they must remain unit-testable and swappable without touching any other module.

### 5. `utils/time.js` is the single source of truth for logical-day math
`getLogicalDay` and `endOfLogicalDay` are imported from `src/utils/time.js` wherever needed. Do not reimplement or inline this logic elsewhere.

### 6. `data-page` attributes must stay in sync with page IDs
`nav.js → setActiveTab` matches tabs via `tab.dataset.page`. Every nav `<button>` in `index.html` must have a `data-page="<day-id>"` attribute matching the corresponding `showPage(id)` call. A missing or mismatched attribute causes silent failure.

### 7. IDB schema — never modify existing version blocks
`SCHEMA_VER = 2` in `src/db/connection.js`. To add a store or index: bump to `3`, add an `if (event.oldVersion < 3) { ... }` block *below* the v2 block. Never edit the v1 or v2 blocks — existing users must only run the delta.

---

## Module responsibilities (quick ref)

| File | Owns |
|---|---|
| `src/main.js` | Boot sequence, `saveAndAdvance`/`advanceDay`/`goBack`/`restartDay`, all `window.*` exports |
| `src/data/exercises.js` | `EXERCISES` constant — pure data, no imports |
| `src/data/days.js` | `DAYS`, `DAY_ROTATION`, `DAY_LABELS` — pure data, no imports |
| `src/data/volumeAnimals.js` | `VOLUME_ANIMALS` table, `getVolumeAnimal(lbs)` — pure data, no imports |
| `src/db/index.js` | Public API barrel — re-exports from the three sub-modules below |
| `src/db/connection.js` | IDB singleton, schema v1+v2, seeding, `_idbWrite`/`_promisify`/`_requireDB`, store name constants |
| `src/db/sessions.js` | `_pending` buffer, `stageSetLog`, `abandonSession`, `completeSession` (atomic flush + progression snapshot), active/completed session CRUD |
| `src/db/logs.js` | `getProgressionData`, `getHistory`, `getSessionDetails`, `deleteHistoryEntry`, `computeVolume`, streak computation |
| `src/utils/time.js` | `getLogicalDay`, `endOfLogicalDay` — pure functions, no imports |
| `src/utils/settings.js` | `getSetting`, `setSetting`, `getUnit`, `applyTheme`, `applyColorblind`, `applyReduceMotion` — localStorage-backed preferences, no imports |
| `src/utils/wakeLock.js` | `acquireWakeLock`, `releaseWakeLock` — Screen Wake Lock API wrapper |
| `src/state/session.js` | Session start/complete/abandon/reconcile/next-day rotation. No DOM access. |
| `src/state/setWidget.js` | `_state` map, `initSetState`, `tapPill`, `_lockPill` (debounce callback), `clearDayState`, `renderSetWidget` |
| `src/ui/render.js` | `renderDay`, `buildSlide`, `exCardInner`, `warmupSlide`, `timerHTML`, `minsRemaining` |
| `src/ui/timer.js` | Countdown, `startTimer(sec, overtimeSec)`, two-phase timer logic, `getSmartTimer`, `customTimer` |
| `src/ui/share.js` | `buildShareText`, `shareText` — Wordle-style share snippet builder and native share/clipboard helper |
| `src/ui/sessionDetail.js` | `openSessionDetail`, `closeSessionDetail` — bottom sheet with per-set analytics, swipe-to-dismiss |
| `src/ui/modals.js` | Weight modal, custom timer modal — DOM only, no business logic |
| `src/ui/history.js` | `renderHistory`, `deleteEntry` |
| `src/ui/settings.js` | `renderSettings`, toggle handlers for theme/units/colorblind/wake lock/reduce motion/factory reset |
| `src/ui/nav.js` | `showPage`, `setActiveTab` |

---

## Timer ownership

The per-pill debounce in `setWidget.js` is the **canonical** source of timer starts. After a pill is tapped and left untouched for 1.5 s, `_lockPill` fires: it snapshots the weight, marks the pill locked, and calls `startTimer(sec, overtimeSec)`. `getSmartTimer` returns a two-phase config when the user hit their target reps — phase 1 is the easy window (green), phase 2 is the hard extension (red) — so the timer self-calibrates without the user selecting a preset. `saveAndAdvance` does **not** start a timer. The only other timers are the manual preset buttons in the timer card, triggered explicitly by the user.

---

## Adding an exercise

1. Add an entry to `EXERCISES` in `src/data/exercises.js`:
   ```js
   my_exercise: {
     displayName: 'My Exercise',
     sets: 3, reps: 10,
     video: 'YOUTUBE_ID',   // or 'placeholder'
     notes: '',
     rest: { easy: 60, hard: 120, failed: 180 },
     progression: { increment: 5, successesNeeded: 3, targetReps: 10 },
     estMinutes: 6, defaultWeight: 30,
   },
   ```
2. Add the key to the appropriate day's `steps` array in `src/data/days.js`.
3. No other changes needed.

## Adding a day

1. Add an entry to `DAYS` in `src/data/days.js` with `label`, `warmup`, and `steps`.
2. Add the key to `DAY_ROTATION` and `DAY_LABELS`.
3. Add a nav `<button>` in `index.html` with `data-page="your-key"` and `onclick="showPage('your-key', event)"`.
4. Add `<div id="page-your-key" class="page"><div class="container" id="cnt-your-key"></div></div>` to `index.html`.
5. Add the key to the `allDays` array in the boot sequence in `src/main.js`.

---

## Logical day boundary

The app uses a **3 AM cutoff**. Workouts between midnight and 2:59 AM belong to the previous calendar day. All time math flows through `src/utils/time.js` — do not hardcode this offset elsewhere.

---

## What not to do

- Do not add `@keyframes` to `components.css`
- Do not import anything into `src/data/exercises.js` or `src/data/days.js`
- Do not duplicate `getLogicalDay` logic — import it from `src/utils/time.js`
- Do not assign to `window.*` anywhere except the `Object.assign` block in `src/main.js`
- Do not call `startTimer` from `saveAndAdvance` — the pill debounce (`_lockPill`) owns that
- Do not remove the `if (!session || session.completedAt) return` guard in `completeSession`
- Do not modify the v1 IDB schema block when adding new stores — add a v2 block below it
