# Workout Tracker — Architecture

> A Workout Session is the primary unit of history, persistence, and analytics.

The app separates immutable **program definitions** (what should be done) from mutable **workout sessions** (what was actually done). Program definitions are source-controlled constants; sessions are append-only IndexedDB records. This boundary is the most load-bearing structural decision in the codebase — every other design follows from it.

---

## Table of Contents

1. [Module Dependency Graph](#1-module-dependency-graph)
2. [Layer Architecture](#2-layer-architecture)
3. [Domain Model](#3-domain-model)
4. [Aggregate Roots and Invariants](#4-aggregate-roots-and-invariants)
5. [State Taxonomy](#5-state-taxonomy)
6. [Critical Data Flows](#6-critical-data-flows)
7. [Persistence Layer](#7-persistence-layer)
8. [Progression Algorithm](#8-progression-algorithm)
9. [CSS Architecture](#9-css-architecture)
10. [Architectural Constraints and their Enforcement](#10-architectural-constraints-and-their-enforcement)
11. [Known Safe Evolution Paths](#11-known-safe-evolution-paths)
12. [IDB Schema Migration Protocol](#12-idb-schema-migration-protocol)

---

## 1. Module Dependency Graph

```
index.html
    └── src/main.js ──────────────────────────────────┐
          │                                            │ window.* (runtime bridge
          ├── src/data/exercises.js                   │  for onclick= attributes)
          ├── src/data/days.js                         │
          │                                            │
          ├── src/db/index.js (barrel)                 │
          │    ├── src/db/connection.js ◄── src/data/exercises.js
          │    ├── src/db/sessions.js  ◄── src/db/connection.js
          │    │                       ◄── src/utils/time.js
          │    └── src/db/logs.js      ◄── src/db/connection.js
          │                            ◄── src/data/exercises.js
          │         │                                   │
          ├── src/state/session.js ◄── src/db/index.js │
          │         │              ◄── src/data/days.js │
          │         │              ◄── src/utils/time.js│
          │         └── src/state/setWidget.js          │
          │                    │                        │
          │                    ├── src/ui/timer.js      │
          │                    └── src/ui/modals.js     │
          │                                             │
          ├── src/ui/render.js ◄── src/data/exercises.js│
          │         │          ◄── src/data/days.js     │
          │         │          ◄── src/db/index.js      │
          │         │          ◄── src/state/setWidget.js│
          │         │          ◄── src/state/session.js  │
          │         └──────────◄── src/ui/timer.js      │
          │                                             │
          ├── src/ui/timer.js ◄── src/data/exercises.js │
          ├── src/ui/modals.js ◄── src/state/setWidget.js│
          ├── src/ui/history.js ◄── src/data/days.js    │
          │          └──────────◄── src/db/index.js     │
          └── src/ui/nav.js ◄── src/ui/history.js       │
                                                         │
          ┌──────────────────────────────────────────────┘
          │  One deliberate runtime coupling:
          │  modals.js → window.restartDay (not import)
          │  Avoids: modals.js → main.js → modals.js cycle.
```

**Leaf nodes** (no outbound imports, safe to swap in isolation):

| File | What makes it a leaf |
|---|---|
| `src/data/exercises.js` | Imports nothing |
| `src/data/days.js` | Imports nothing |
| `src/utils/time.js` | Imports nothing |

**Fan-in hotspots** (imported by many — most likely to affect multiple modules on change):

| File | Imported by |
|---|---|
| `src/data/exercises.js` | `db/`, `ui/render.js`, `ui/timer.js`, `main.js` |
| `src/db/index.js` | `state/session.js`, `ui/render.js`, `ui/history.js`, `main.js` |
| `src/state/setWidget.js` | `state/session.js`, `ui/render.js`, `ui/modals.js`, `main.js` |

---

## 2. Layer Architecture

The codebase has four explicit layers. Ownership flows in one direction: each layer may call into the layers below it; it never calls up.

```
┌─────────────────────────────────────────────────────────┐
│  ui/  — render.js  timer.js  modals.js  history.js  nav │
│  Owns: DOM reads/writes, HTML strings, user interaction  │
│  Forbidden: direct IDB access, business logic            │
├─────────────────────────────────────────────────────────┤
│  state/  — session.js   setWidget.js                     │
│  Owns: session lifecycle, in-memory set state            │
│  Forbidden: DOM access, direct IDB calls from setWidget  │
├─────────────────────────────────────────────────────────┤
│  db/  — index.js                                         │
│  Owns: all IndexedDB reads and writes                    │
│  Forbidden: business logic, DOM access                   │
├─────────────────────────────────────────────────────────┤
│  data/  + utils/  — exercises.js  days.js  time.js       │
│  Owns: program definitions, pure helper functions        │
│  Forbidden: imports of any kind (data); DOM; IDB         │
└─────────────────────────────────────────────────────────┘
```

`src/main.js` is the **composition root**. It lives outside this stack deliberately — it is the only file that wires layers together, initialises the boot sequence, and exposes the `window.*` surface for inline `onclick=` handlers. Nothing else is allowed to touch `window.*`.

---

## 3. Domain Model

### 3.1 Program Definition (static, source-controlled)

```
Program
└── Day  { label, warmup: bool, steps: Step[] }
    └── Step = ExerciseKey | [ExerciseKey, ExerciseKey]  ← superset
        └── Exercise {
              displayName, sets, reps, video,
              rest: { easy, hard, failed },         ← seconds
              progression: {
                increment,                           ← lbs per level-up
                successesNeeded,                     ← consecutive wins needed
                targetReps                           ← reps = "easy win"
              },
              estMinutes, defaultWeight
            }
```

`days.js` references exercise keys only — it never imports `exercises.js`. Both files remain independently editable and individually swappable.

A **Step** is either a single exercise key (string) or a two-element array of exercise keys (superset). `render.js` distinguishes them with `Array.isArray(step)`. `saveAndAdvance` iterates items with `Array.isArray(step) ? step : [step]`. This is the only place the superset shape leaks into logic.

### 3.2 Workout Execution (mutable, persisted in IDB)

```
WorkoutSession {
  logicalDay: "YYYY-MM-DD",    ← 3AM-shifted date string; primary key of activeSessions
  day: "heavy-a" | ...,        ← which program day was performed
  startedAt: number,           ← Unix ms; primary key of completedSessions
  completedAt: number | null   ← null while in-progress
}

ExerciseLog {
  exerciseKey:  string,        ← snapshot of key at session time (safe across renames)
  exerciseName: string,        ← snapshot of displayName at session time
  uid:          string,        ← "${day}-${stepIdx}-${partIdx}"
  day:          string,
  sets:         SetLog[],
  date:         ISO8601,       ← used for compound IDB index ordering
  dateDisplay:  string,        ← locale string for display
  seeded:       bool           ← true only for install-time default entries
}

SetLog {
  weight: string,              ← stored as string to avoid float precision issues
  reps:   string
}
```

**Historical snapshot rule:** `exerciseKey` and `exerciseName` are captured at log time. If `EXERCISES.barbell_bench_press.displayName` changes next month, existing history continues to display the original name. Old logs are never orphaned.

### 3.3 Carousel Index (ephemeral)

```
_carouselIdx: { [day: string]: number }
  -1  → warmup slide (only for days where warmup: true)
   0  → steps[0]
   n  → steps[n]
  >total → done screen
```

The carousel index lives in `render.js` and is never persisted. `setVirtualIdx` / `getVirtualIdx` are the only entry points. On boot, every day is reset to `-1` (or `0` if no warmup) before the initial render.

---

## 4. Aggregate Roots and Invariants

The application has three aggregate roots. All mutations route through exactly one of them.

### 4.1 Program (immutable aggregate)

**Owner:** `src/data/` — `exercises.js` and `days.js`.

**Enforced invariants:**
- These files contain no imports and no side effects. This is verified by the zero-dependency rule: if you add an import statement, the data module becomes coupled to the module graph and loses its unit-test and swap properties.
- Keys in `days.js` are strings that reference `EXERCISES` keys. Referential integrity is not enforced at runtime — a typo in a step key will silently render an undefined exercise card. This is an accepted trade-off; TypeScript would make it compile-time safe.

### 4.2 Workout Session (primary write aggregate)

**Owner:** `src/state/session.js`, backed by `src/db/index.js`.

**Enforced invariants:**

| Invariant | Where enforced |
|---|---|
| At most one active session per logical day | `maybeStartSession` checks `sessions[logicalDay]` before writing |
| Session completion is idempotent | Guard in `session.js/completeSession`: `if (!session \| session.completedAt) return` |
| Staged logs are flushed atomically with the session | `db/completeSession` opens a single `readwrite` txn across `setLogs + activeSessions + completedSessions` |
| Stale sessions auto-close at end of their logical day | `reconcileStaleSessions` sets `completedAt = endOfLogicalDay(startedAt)` |
| History capped at 365 completed sessions | `db/completeSession` counts and cursor-deletes oldest after the put |
| Abandoning discards staged logs (no phantom entries) | `abandonSession` calls `dbAbandonSession(day)` which deletes from `_pending` by prefix, then `deleteActiveSession` removes the IDB active record |

### 4.3 Progression State (exercise-owned, session-derived)

**Owner:** `src/db/index.js` — `getProgressionData` and `_getRecentLogs`.

Progression is computed **on demand** from historical set-logs rather than stored as a separate writable record. There is no `progression` IDB store. The suggested weight and level-up status are derived each time a card is rendered by reading the `by_exercise_date` compound index.

This matters: progression cannot get out of sync with history, because it _is_ history. There is no separate mutable progression record to reconcile.

---

## 5. State Taxonomy

```
┌─────────────────────────────────────────────────────────────┐
│ PERSISTENT (IndexedDB)                                       │
│   activeSessions   — one record per in-progress day         │
│   completedSessions — append-only; capped at 365            │
│   setLogs          — one record per exercise per session     │
├─────────────────────────────────────────────────────────────┤
│ EPHEMERAL (module-level variables; lost on page close)       │
│   _state (setWidget.js)   — pill state per uid              │
│   _carouselIdx (render.js) — current step per day           │
│   _timerEnd, _interval, _remaining (timer.js) — countdown   │
│   _pending (db/index.js)  — staged set-logs awaiting commit  │
│   _db (db/index.js)       — cached IDBDatabase connection    │
├─────────────────────────────────────────────────────────────┤
│ DERIVED (computed; never stored)                             │
│   suggestedWeight  — from last N non-seeded set-logs        │
│   streak           — consecutive sessions above target reps  │
│   levelUp          — streak >= successesNeeded              │
│   nextDay          — last completed session's day + 1 in rotation│
│   minsRemaining    — sum of estMinutes for remaining steps   │
│   logicalDay       — Date.now() shifted -3h, formatted       │
└─────────────────────────────────────────────────────────────┘
```

`_pending` (in `db/index.js`) deserves special attention: it is the in-flight accumulator for the current workout. Logs are staged here on every `saveAndAdvance` call (keyed by `uid`), but nothing touches IDB until `completeSession` flushes the entire buffer atomically. This means:

- **Back navigation is safe**: re-advancing the same step overwrites the existing `_pending[uid]` entry — no duplicate logs.
- **Partial workouts are not persisted**: if the user leaves mid-session, the `_pending` buffer is discarded. Only the `activeSessions` record survives, enabling `reconcileStaleSessions` to auto-close it.

---

## 6. Critical Data Flows

### 6.1 Completing a Set

```
User taps pill (reps >= 1)
  → tapPill(uid, pillIdx)           [setWidget.js]
      pill.reps cycles: null → target → target-1 → ... → 0 → target
      → renderSetWidget(uid)

User taps "Start New Set"
  → lockNextSet(uid)                [setWidget.js]
      find first pill: reps !== null && !locked
      pill.weight = s.weight
      pill.locked = true
      → getSmartTimer(exKey, pill.reps, targetReps)   [timer.js]
          reps === 0        → rest.failed
          reps < target - 1 → rest.failed
          reps === target-1 → rest.hard
          reps >= target    → rest.easy
      → startTimer(seconds)         [timer.js]
          stopTimer() first (clears any prior interval)
          _timerEnd = Date.now() + sec*1000
          _tick() immediately, then setInterval(_tick, 500)
      → renderSetWidget(uid)
```

The timer is owned entirely by `lockNextSet`. `saveAndAdvance` does **not** start or stop the timer — the rest timer for the last set of an exercise continues counting while the user taps Next and moves to the next slide. This is intentional: gym rest doesn't care about app navigation.

### 6.2 Advancing to the Next Exercise

```
User taps "Next →"
  → saveAndAdvance(day)             [main.js]
      vidx = getVirtualIdx(day)
      idx  = Math.max(0, vidx)
      step = DAYS[day].steps[idx]
      items = Array.isArray(step) ? step : [step]

      items.forEach((key, part) → {
        uid = `${day}-${idx}-${part}`
        s   = getState(uid)
        sets = locked pills + any pending (unentered) pill
        if sets.length > 0:
          stageSetLog(day, { exerciseKey, exerciseName, uid, sets })
                                    [db/index.js — in-memory only]
      })

      → advanceDay(day)
          if vidx <= 0: await maybeStartSession(day)
                                    [session.js — writes activeSessions]
          setVirtualIdx(day, vidx + 1)
          → renderDay(day)          [render.js]
```

`maybeStartSession` is called at step 0 (first exercise, after warmup if any). It is a no-op if a session for today's logical day already exists.

### 6.3 Completing a Workout

```
User taps "✓ Finish" on the last exercise
  → saveAndAdvance(day)             (stages the last exercise log)
  → advanceDay(day)
      setVirtualIdx(day, total)     (idx now >= total)
      → renderDay(day)
          idx >= total:
          → completeSession(day)    [session.js]
              sessions = await getActiveSessions()
              session  = sessions[logicalDay]
              GUARD: if (!session || session.completedAt) return   ← idempotent
              session.completedAt = Date.now()
              → dbCompleteSession(day, session)   [db/index.js]
                  Single readwrite txn across [setLogs, activeSessions, completedSessions]:
                    1. logStore.add(entry) for each _pending entry where entry.day === day
                    2. activeStore.delete(session.logicalDay)
                    3. completedStore.put(session)
                    4. if completedSessions.count() > 365: cursor-delete oldest
                    5. oncomplete: delete _pending[uid] for all uid starting with day+'-'
          renders done screen
```

The `completeSession` idempotency guard in `session.js` is called on **every** render of the done screen (back navigation, tab focus, visibility change all re-trigger `renderDay`). The guard at line 45 of `session.js` (`if (!session || session.completedAt) return`) is the load-bearing safety valve. Removing it causes double-commits.

### 6.4 Stale Session Reconciliation

```
App opens (or tab becomes visible)
  → reconcileStaleSessions()        [session.js]
      sessions = await getActiveSessions()
      todayKey = getLogicalDay()    [utils/time.js]
      for each session:
        if getLogicalDay(session.startedAt) !== todayKey:
          session.completedAt = endOfLogicalDay(session.startedAt)
          await putCompletedSession(session)   ← marks it complete at 23:59:59 of its day
          await deleteActiveSession(logicalDay)
```

This handles the case where the user started a workout on Monday, closed the app, and reopened on Tuesday. The Monday session is moved to `completedSessions` with a synthesized `completedAt` so it appears in history correctly.

---

## 7. Persistence Layer

### 7.1 IndexedDB Schema (v1)

```
WorkoutDB (SCHEMA_VER = 1)
│
├── setLogs  { keyPath: 'id', autoIncrement: true }
│   ├── by_exercise_date  [exerciseKey, date]   compound, non-unique
│   │     Purpose: "last N logs for exercise X, newest-first"
│   │     Used by: getProgressionData(), _getRecentLogs()
│   │     Range: IDBKeyRange.bound([key,''], [key,'￿']) with 'prev' cursor
│   │     Note: '￿' (high surrogate) sorts after any ISO date string
│   │
│   ├── by_day    'day'   non-unique
│   │     Purpose: "all logs for a given workout day key"
│   │
│   ├── by_date   'date'  non-unique
│   │     Purpose: history screen newest-first full scan
│   │     Used by: getHistory() without exerciseKey filter
│   │
│   └── by_seeded 'seeded'  non-unique (sparse)
│         Purpose: filter seed records out of history queries
│         Note: only seed entries have this field set; real logs omit it
│
├── activeSessions  { keyPath: 'logicalDay' }
│   At most one entry per calendar day (3AM-shifted).
│   This store is the "is-workout-in-progress" signal.
│
└── completedSessions  { keyPath: 'startedAt' }
    └── by_completedAt  'completedAt'  non-unique
          Purpose: getCompletedSessions() newest-first, oldest-first for cap deletion
          Used by: getNextDay(), reconcileStaleSessions(), session cap eviction
```

### 7.2 The Compound Index Trick

`_getRecentLogs` uses a compound `[exerciseKey, date]` index with a `'prev'` cursor to retrieve the most recent logs for a single exercise without scanning the full table:

```js
const range = IDBKeyRange.bound(
  [exerciseKey, ''],
  [exerciseKey, '￿']
);
index.openCursor(range, 'prev');   // newest ISO date first
```

IDB compound key ranges filter on the first component and sort on the second. The high-surrogate upper bound (`'￿'`) ensures no ISO date string ever exceeds it. This makes progression data reads O(log n) against the index rather than O(n) against the full store.

### 7.3 Seed Records

On fresh install, `_seedDefaultWeights` writes one synthetic set-log per exercise to IDB. These seed records:

- Are dated 7 days in the past (so real logs always sort newer)
- Have `seeded: true` (excluded from all history queries via `!entry.seeded`)
- Set reps to `targetReps - 1` (one below the success threshold)

The reps-minus-one choice is deliberate: it bootstraps `suggestedWeight` to `defaultWeight` without falsely triggering a level-up streak. The user's first real session starts from the correct weight with a clean streak count of zero.

### 7.4 Connection Lifecycle

`_db` is a module-level singleton. `initDB()` is idempotent — subsequent calls return the cached connection. The `onversionchange` handler closes and nulls `_db` when another tab opens a newer schema version, preventing stale-connection errors.

---

## 8. Progression Algorithm

`getProgressionData(exerciseKey)` computes suggested weight and level-up status from history.

```
FETCH_LIMIT = max(10, successesNeeded + 5)
entries = _getRecentLogs(exerciseKey, FETCH_LIMIT)  ← newest-first, no seeds

lastWeight = min(entry.sets[*].weight) for entries[0]
             ↑ uses minimum across sets (conservative; protects against accidental heavy drop-sets)

streak = 0
for entry in entries (newest → oldest):
  allGood  = every set in entry has reps >= targetReps
  weightOk = min(set.weight) >= lastWeight
  if allGood AND weightOk: streak++
  else: BREAK             ← consecutive requirement; any gap resets

if streak >= successesNeeded:
  suggestedWeight = lastWeight + increment
  badge = "${newW} lbs (${increment}↑)"
  levelUp = true

elif streak > 0 AND successesNeeded > 1:
  badge = "${lastWeight} lbs · Streak ${streak}/${needed} 🚀"
  levelUp = false

else:
  badge = "${lastWeight} lbs" (or null if 0)
  levelUp = false
```

**Key design choice:** streak breaks on _any_ non-qualifying entry, even if an earlier entry qualifies. The algorithm does not count non-consecutive successes. This matches the linear progression model (StrongLifts / GZCLP style) where one failure resets progress.

**`successesNeeded` per exercise type:**
- Compounds (`barbell_back_squat`, `barbell_bench_press`, `barbell_overhead_press`, `romanian_deadlift`): `1` — any single successful session triggers weight increase
- Secondary compounds (`barbell_shrugs`, `single_arm_db_row`): `2`
- Accessory movements: `3` — deliberate conservatism; isolation work responds more slowly

---

## 9. CSS Architecture

Four files, strict layer contract. Each layer may reference variables and classes defined in earlier layers only.

```
tokens.css      — :root { --bg, --surface*, --accent*, --text*, --border*, --r, --rl }
                  Source of all design tokens. No selectors beyond :root and *.
                  Monospace font family is declared here on body.

layout.css      — nav, pages, containers, section labels
                  References: var(--bg), var(--border), var(--accent), var(--text3)
                  No animation classes.

components.css  — cards, pills, buttons, modals, timer, history, set widget, badges
                  References: all tokens, layout utility classes
                  References @keyframes by NAME ONLY — never defines them.

animations.css  — ALL @keyframes definitions
                  Only file permitted to define @keyframes.
                  components.css uses animation-name to reference them.
```

Violating the `@keyframes` rule means `components.css` becomes a motion-definition source, breaking the ability to swap all animations by swapping a single file (e.g., for reduced-motion builds).

---

## 10. Architectural Constraints and their Enforcement

These are load-bearing constraints, not style preferences. Each has a specific enforcement mechanism.

### 10.1 `window.*` globals — single declaration site

**Constraint:** Inline `onclick="fnName(...)"` in dynamically-built HTML strings require globally scoped functions. The entire `window` surface is declared exactly once, in the `Object.assign(window, {...})` block at the bottom of `main.js`.

**Why this location:** `main.js` imports every module that contributes global-facing functions. It is the only file that has visibility into all of them simultaneously, so it is the only file that can maintain the auditable, complete list.

**Failure mode:** Adding an `onclick="newFn(...)"` anywhere in rendered HTML without adding `newFn` to the `Object.assign` block causes a silent runtime error (`newFn is not defined`) — no build-time warning, no TypeScript error. The `Object.assign` block is the first place to check when an `onclick` stops working.

**One deliberate exception:** `closeRestartModal` in `modals.js` calls `window.restartDay(day)` instead of importing `restartDay` directly. This avoids a circular dependency: `modals.js` → `main.js` → `modals.js`. The call goes through the window bridge because `main.js` registers `restartDay` at startup, and `modals.js` only calls it at user interaction time (never at import time). This is documented at `modals.js:121`.

### 10.2 `completeSession` idempotency guard

**Constraint:** `renderDay` calls `completeSession(day)` on every render of the done screen. The guard in `session.js/completeSession` (`if (!session || session.completedAt) return`) makes this safe.

**Why every render:** Tab navigation, back-button taps, and `visibilitychange` all re-trigger `renderDay`. Calling `completeSession` only once (at the moment the user taps Finish) would require threading completion state through the render function — adding coupling that violates the UI/state separation principle.

**Failure mode:** Removing the guard causes every done-screen render to re-enter `dbCompleteSession`, which would write duplicate set-logs, corrupt the session record, and fail on the unique-key constraint in `completedSessions` (keyed by `startedAt`).

### 10.3 Logical day boundary — single source of truth

**Constraint:** `getLogicalDay` and `endOfLogicalDay` exist once in `src/utils/time.js`. Both `session.js` and `db/index.js` import from this file. The 3AM shift is never inlined or duplicated.

**Why 3AM:** A lifter finishing a late-night workout at 1:30AM should have it counted as the same calendar day they started at 10PM, not credited to the next day. 3AM is past any realistic end-of-workout time.

**Failure mode:** Duplicating the shift constant (e.g., `Date.now() - 3*60*60*1000` directly in `session.js`) creates a split definition. Changing the boundary from 3AM to 4AM would then require finding and updating all inline copies, with silent correctness errors if any are missed.

### 10.4 IDB v1 schema block is frozen

**Constraint:** The `if (event.oldVersion < 1) { ... }` block in `db/index.js/onupgradeneeded` must never be modified.

**Why:** Users who already have the database at v1 will not re-run this block on upgrade — IDB only runs the delta for their current `oldVersion`. Modifying the v1 block corrupts the upgrade path for existing users; their schema will differ from what the v1 block would produce today.

**Correct procedure:** See [Section 12](#12-idb-schema-migration-protocol).

### 10.5 `initSetState` idempotency

**Constraint:** `initSetState` in `setWidget.js` is a no-op if `_state[uid]` already exists.

**Why:** `renderDay` calls `exCardInner` (which calls `initSetState`) on every render. On re-render, the state from the previous render must be preserved — pill locks, reps entered, and weight — otherwise navigating backward and forward would reset the user's progress.

**Failure mode:** Removing the early-return makes every `renderDay` call reset pill state to blank, discarding reps the user already logged.

### 10.6 `getNextDay` rotation fallback

**Constraint:** If the last completed session's `day` is not in `DAY_ROTATION`, `getNextDay` emits a console warning and returns `'heavy-a'`.

**Why fallback instead of throw:** The user's history cannot be rewritten. If a day key was renamed after they had sessions stored, crashing the app would be worse than silently resetting rotation.

**Failure to maintain:** If `DAYS` keys are renamed, `DAY_ROTATION` must be updated to match. Out-of-sync rotation causes silent reset to `heavy-a` on next app open.

### 10.7 `data-page` attributes must match page IDs

**Constraint:** `setActiveTab` in `nav.js` matches tabs via `tab.dataset.page`. Every `<button class="nav-tab">` in `index.html` must carry `data-page="<day-id>"` matching its `showPage(id)` argument.

**Why `dataset.page` instead of parsing `onclick`:** The original implementation parsed the `onclick` string. The current implementation reads a semantic data attribute. This is more robust, but it introduces a new sync requirement between `data-page` and the `showPage` argument in the same button's `onclick`.

---

## 11. Known Safe Evolution Paths

### Adding an exercise

1. Add entry to `EXERCISES` in `src/data/exercises.js`.
2. Add the key to the appropriate day's `steps` array in `src/data/days.js`.
3. No other changes needed. The rest of the system is data-driven.

Exercises with `increment: 0` disable weight progression (bodyweight / time-based movements like `glute_ham_raise`, `copenhagen_planks`). `getProgressionData` still returns `suggestedWeight: lastWeight` but `levelUp` will never be true.

### Adding a day

1. Add entry to `DAYS`, `DAY_ROTATION`, and `DAY_LABELS` in `src/data/days.js`.
2. Add nav `<button class="nav-tab" data-page="your-key" onclick="showPage('your-key',event)">` to `index.html`.
3. Add `<div id="page-your-key" class="page"><div class="container" id="cnt-your-key"></div></div>` to `index.html`.
4. Add the key to `allDays` in the boot sequence in `src/main.js`.

### Changing the 3AM boundary

Edit `src/utils/time.js` only. The constant `3 * 60 * 60 * 1000` appears twice in that file (`getLogicalDay` and `endOfLogicalDay`). No other file contains the boundary value.

### Adding a new global-facing function (onclick handler)

1. Define the function in whichever module owns its logic.
2. Import it in `src/main.js`.
3. Add it to the `Object.assign(window, {...})` block.

### Extending the IDB schema

See [Section 12](#12-idb-schema-migration-protocol). Never modify the v1 block.

### Adding a new modal

1. Add `init*Modal()` in `modals.js`.
2. Call `init*Modal()` in the boot sequence in `main.js`.
3. Add open/close functions. If the close handler needs to call into `main.js` (like `restartDay`), use `window.*` rather than importing to avoid cycles.

---

## 12. IDB Schema Migration Protocol

**Current version:** `SCHEMA_VER = 1` (`src/db/index.js`).

To add a store or index:

```js
// 1. Bump SCHEMA_VER to 2 at the top of db/index.js.
const SCHEMA_VER = 2;

// 2. In onupgradeneeded, add a NEW block BELOW the v1 block.
//    Never touch the v1 block.
if (event.oldVersion < 1) {
  // ... existing v1 block, untouched ...
}

if (event.oldVersion < 2) {
  // Use event.target.transaction (the implicit upgrade txn).
  // Do NOT open a new transaction — IDB chains all upgrade ops atomically.
  const db  = event.target.result;
  const txn = event.target.transaction;
  db.createObjectStore('newStore', { keyPath: 'id' });
  txn.objectStore('newStore').createIndex('by_field', 'field');
}
```

**To migrate existing data** (e.g., backfill a new field):

```js
if (event.oldVersion < 2) {
  const store  = txn.objectStore('existingStore');
  const cursor = store.openCursor();
  cursor.onsuccess = (e) => {
    const cur = e.target.result;
    if (!cur) return;
    cur.update({ ...cur.value, newField: computeDefault(cur.value) });
    cur.continue();
  };
}
```

**Invariants to preserve:**
- The `if (event.oldVersion === 0)` seed block inside v1 must stay — it seeds `defaultWeight` on fresh installs. Do not move or gate it behind `oldVersion < 2`.
- The implicit upgrade transaction (`event.target.transaction`) is the only transaction available during `onupgradeneeded`. Creating a separate transaction from the `db` object inside `onupgradeneeded` is not allowed and will throw.

---

## Appendix: Module Responsibility Reference

| File | Owns |
|---|---|
| `src/main.js` | Boot sequence, `saveAndAdvance` / `advanceDay` / `goBack` / `restartDay`, all `window.*` exports |
| `src/data/exercises.js` | `EXERCISES` — pure data, zero imports |
| `src/data/days.js` | `DAYS`, `DAY_ROTATION`, `DAY_LABELS` — pure data, zero imports |
| `src/db/index.js` | Public API barrel — re-exports everything from the three sub-modules |
| `src/db/connection.js` | `_db` singleton, `initDB`, schema v1, seeding, `_idbWrite` / `_promisify` / `_requireDB`, store name constants |
| `src/db/sessions.js` | `_pending` accumulator, `stageSetLog`, `abandonSession`, `completeSession` (atomic flush), active/completed session CRUD |
| `src/db/logs.js` | `getProgressionData`, `getHistory`, `deleteHistoryEntry`, `_getRecentLogs`, streak computation |
| `src/utils/time.js` | `getLogicalDay`, `endOfLogicalDay` — pure functions, zero imports |
| `src/state/session.js` | Session start / complete / abandon / reconcile / next-day rotation. No DOM access. |
| `src/state/setWidget.js` | `_state` map, `initSetState`, `tapPill`, `lockNextSet`, `renderSetWidget` |
| `src/ui/render.js` | `renderDay`, `buildSlide`, `exCardInner`, `warmupSlide`, `timerHTML`, `minsRemaining` |
| `src/ui/timer.js` | Countdown, `startTimer` / `stopTimer` / `_tick` / `getSmartTimer`, `REST_DEFAULTS` |
| `src/ui/modals.js` | Weight modal, custom timer modal, restart modal — DOM only, no business logic |
| `src/ui/history.js` | `renderHistory`, `deleteEntry` |
| `src/ui/nav.js` | `showPage`, `setActiveTab` |
