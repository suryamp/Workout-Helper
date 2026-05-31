# Workout Tracker — Architecture

## Directory Structure

```
workout-tracker/
├── index.html
├── ARCHITECTURE.md           ← you are here
│
├── styles/
│   ├── tokens.css            ← CSS custom properties (colors, radii, fonts)
│   ├── layout.css            ← nav, pages, containers, section labels
│   ├── components.css        ← cards, pills, buttons, modals, timer, history
│   └── animations.css        ← ALL @keyframes (components.css references by name only)
│
└── src/
    ├── main.js               ← app entry: init, nav, boot sequence, window.* globals
    │
    ├── data/
    │   ├── exercises.js      ← EXERCISES constant (the full library)
    │   └── days.js           ← DAYS constant (workout programs) + DAY_ROTATION/LABELS
    │
    ├── db/
    │   └── index.js          ← IndexedDB layer
    │
    ├── state/
    │   ├── setWidget.js      ← setState map, initSetState, getState, tapPill, lockNextSet
    │   └── session.js        ← maybeStartSession, completeSession, abandonSession,
    │                            reconcileStaleSessions, getNextDay, getLogicalDay
    │
    ├── ui/
    │   ├── render.js         ← renderDay, buildSlide, exCardInner, warmupSlide,
    │                            minsRemaining, timerHTML
    │   ├── modals.js         ← initWeightModal, initCustomTimerModal, initRestartModal,
    │                            open/close handlers
    │   ├── timer.js          ← startTimer, stopTimer, tickTimer, updateAllTimers,
    │                            customTimer, getSmartTimer, toggleTimerPresets
    │   ├── history.js        ← renderHistory, deleteEntry
    │   └── nav.js            ← showPage, setActiveTab
    │
    └── utils/
        └── time.js           ← getLogicalDay, endOfLogicalDay (shared pure helpers)
```

---

## Module Responsibilities

### `src/data/exercises.js`
Pure data — no logic, no imports. The `EXERCISES` object. Zero-dependency: can be
unit-tested, linted, or swapped for a JSON/API source without touching any other module.

### `src/data/days.js`
`DAYS`, `DAY_ROTATION`, and `DAY_LABELS`. Everything that describes _which_ exercises
run on _which_ day. References exercise keys only (not the objects), so both data files
stay independently editable.

### `src/db/index.js`
The IndexedDB layer. Imports `EXERCISES` from `../data/exercises.js` directly — no
global dependency. All imports are hoisted to the top of the file per ES module spec.

### `src/utils/time.js`
`getLogicalDay(ms?)` and `endOfLogicalDay(ms)` are pure functions used by both
`state/session.js` and `db/index.js`. Extracted once, imported where needed — no
duplicate `_getLogicalDay` anywhere in the codebase.

### `src/state/session.js`
Owns the session lifecycle: start, complete, abandon, stale-session reconciliation,
next-day rotation. Imports from `db/` and `utils/time.js`. No DOM access.

`completeSession` is guarded against double-fire: if the session already has a
`completedAt`, it returns immediately. This matters because `renderDay` calls
`completeSession` on every render of the done screen (back-button, tab focus, etc.).

### `src/state/setWidget.js`
The `setState` map and all mutations (`initSetState`, `tapPill`, `lockNextSet`,
`getState`, `clearDayState`). Also owns `renderSetWidget` since it is the only
consumer of `setState`.

`initSetState` accepts `exKey` and `exName` so that `lockNextSet` can pass the
correct exercise key to `getSmartTimer`. These fields are set once at init time by
`render.js` — no post-hoc mutation or dynamic imports required.

### `src/ui/timer.js`
All countdown logic and DOM updates (`startTimer`, `stopTimer`, `tickTimer`,
`updateAllTimers`, `toggleTimerPresets`, `customTimer`). Also owns `getSmartTimer`
since it's purely about choosing a rest duration.

**Timer ownership:** `lockNextSet` (in `setWidget.js`) is the canonical source of
timer starts — it fires after every set confirmation. `saveAndAdvance` (in `main.js`)
does _not_ start a timer; it lets the one `lockNextSet` started continue uninterrupted.
The only timers started by `saveAndAdvance` are the manual preset buttons in the
timer card, which are triggered by the user, not by navigation.

### `src/ui/modals.js`
Three modal factories (`initWeightModal`, `initCustomTimerModal`, `initRestartModal`)
and their open/close handlers. DOM-only, no business logic.

### `src/ui/render.js`
Pure rendering: `renderDay`, `buildSlide`, `exCardInner`, `warmupSlide`, `timerHTML`,
`minsRemaining`. Reads EXERCISES/DAYS data and state, writes `innerHTML`. Passes
`exKey` and `exName` into `initSetState` — no dynamic imports.

### `src/ui/history.js`
`renderHistory` and `deleteEntry`. Reads from `db/`, writes one container's innerHTML.

### `src/ui/nav.js`
`showPage` and `setActiveTab`. `setActiveTab` matches the active tab via `data-page`
attributes on `<button>` elements — not by parsing `onclick` strings. Each nav button
in `index.html` must carry a `data-page="<day-id>"` attribute.

### `src/main.js`
The boot sequence only:
1. `initDB()`
2. init modals
3. `reconcileStaleSessions()`
4. `visibilitychange` listener
5. determine `nextDay`
6. render all four days in parallel
7. `showPage(nextDay, null)`
8. `setActiveTab(nextDay)`

Also re-exports functions onto `window.*` — see **window.\* globals** below.

---

## Key Design Decisions

### Why not a framework?
The app is already well-structured vanilla JS with clean async/await patterns and a
proper IDB abstraction. Introducing React/Vue would add build tooling overhead with
no meaningful DX gain for a personal PWA this size.

### `window.*` globals are intentional, not a smell
Inline `onclick` attributes in dynamically-built HTML strings require global functions.
The fix is not to remove them (that would require event delegation plumbing throughout
`render.js`) but to make the global surface _explicit_ and _small_.

**There is exactly one place globals are declared: the `Object.assign(window, { ... })`
block at the bottom of `main.js`.** If you add a new inline `onclick=` handler anywhere
in rendered HTML, its backing function MUST be added to that block — and only there.
When an `onclick=` stops working, that block is the first place to check.

### CSS layer contract: tokens → layout → components → animations
Each layer references only variables defined in a previous layer. `animations.css`
owns ALL `@keyframes`; `components.css` references them by name but never defines
them. This makes theming safe and makes it obvious where motion lives.

### Data files are zero-dependency
`exercises.js` and `days.js` import nothing. This means they can be unit-tested,
linted, or even swapped for a future JSON/API source without touching any other module.

### `utils/time.js` is the single source of truth for logical-day math
`getLogicalDay` and `endOfLogicalDay` are imported from `utils/time.js` wherever
needed. There is no duplicate implementation anywhere in the codebase.

---

## IDB Schema Upgrade Path

**Current version:** `SCHEMA_VER = 1` (defined in `db/index.js`).

To add a new store or index in a future version:

1. Bump `SCHEMA_VER` to `2`.
2. Add an `if (event.oldVersion < 2) { ... }` block **below** the existing
   `if (event.oldVersion < 1)` block in `onupgradeneeded`. Never modify the v1
   block — users upgrading from v1 must only run the v2 delta.
3. Use `event.target.transaction` (the implicit upgrade transaction) for any
   `createObjectStore` / `createIndex` calls. IDB chains them all in one atomic
   upgrade.
4. If you need to migrate existing data (e.g. rename an index), open a cursor
   inside the upgrade transaction and update records in place.

The `if (event.oldVersion === 0)` seed block in the v1 section must stay — it
seeds default weights on a fresh install. Do not move or gate it on `oldVersion < 2`.

---

## Known Fragilities / Gotchas

These are intentional trade-offs, not oversights. Document them here rather than
leaving them as surprises:

### `onclick=` requires `window.*` registration
Dynamically built HTML uses string `onclick="fnName(...)"`. If a function is called
this way but not registered on `window` in `main.js`, it fails silently at runtime
(the browser logs `fnName is not defined`). The explicit `Object.assign(window, ...)`
block makes the full surface auditable, but it must be kept in sync manually.

### `completeSession` is called on every done-screen render
`renderDay` calls `completeSession(day)` whenever `idx >= total`. The guard in
`session.js` (`if (!session || session.completedAt) return`) makes this idempotent,
but if that guard is ever removed, sessions will be double-committed. Don't remove it.

### `getNextDay` falls back to `'heavy-a'` for unknown days
If the last completed `session.day` is not in `DAY_ROTATION` (e.g. after renaming a
day key), the rotation state is silently reset to `heavy-a`. A console warning is
emitted. The fix is to keep `DAY_ROTATION` in sync with any day-key renames in `DAYS`.

### `data-page` attributes must stay in sync with page IDs
`nav.js → setActiveTab` matches tabs by `tab.dataset.page`. If a nav button in
`index.html` is added without a `data-page` attribute, or if its value doesn't match
the corresponding `showPage(id)` call, the active-tab highlight will silently fail.
