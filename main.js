// ══════════════════════════════════════════
//  SESSION TRACKING
//  A session begins on the first Next → tap and ends on the done screen.
//  Active sessions live in 'activeSessions' (one per day, overwritten on
//  restart). Completed sessions accumulate in 'completedSessions'.
//
//  Logical day boundary: 3 am. A workout started at 11 pm and one started
//  at 2:45 am share the same logical day; 3:01 am starts a new one.
//
//  Stale-session rule: if the app is opened on a different logical day than
//  an active session was started, close it with completedAt set to 23:59:59
//  of the day it was started (best approximation of "finished that day").
// ══════════════════════════════════════════

function getLogicalDay(ms = Date.now()) {
  const d = new Date(ms - 3 * 60 * 60 * 1000);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function loadActiveSessions() {
  try { return JSON.parse(localStorage.getItem('activeSessions') || '{}'); }
  catch { return {}; }
}

function saveActiveSessions(sessions) {
  localStorage.setItem('activeSessions', JSON.stringify(sessions));
}

function loadCompletedSessions() {
  try { return JSON.parse(localStorage.getItem('completedSessions') || '[]'); }
  catch { return []; }
}

function appendCompletedSession(session) {
  const completed = loadCompletedSessions();
  completed.unshift(session);
  if (completed.length > 365) completed.length = 365;
  localStorage.setItem('completedSessions', JSON.stringify(completed));
}

function maybeStartSession(day) {
  const sessions = loadActiveSessions();
  if (sessions[day]) return;
  sessions[day] = { day, startedAt: Date.now(), completedAt: null };
  saveActiveSessions(sessions);
}

function completeSession(day) {
  const sessions = loadActiveSessions();
  const session  = sessions[day];
  if (!session) return;
  session.completedAt = Date.now();
  appendCompletedSession(session);
  delete sessions[day];
  saveActiveSessions(sessions);
}

function clearDayState(day) {
  Object.keys(setState)
    .filter(k => k.startsWith(day + '-'))
    .forEach(k => delete setState[k]);
}

function abandonSession(day) {
  clearDayState(day);
  const sessions = loadActiveSessions();
  delete sessions[day];
  saveActiveSessions(sessions);
}

function endOfLogicalDay(ms) {
  const shifted = ms - 3 * 60 * 60 * 1000;
  const d = new Date(shifted);
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  return next.getTime() + 3 * 60 * 60 * 1000 - 1;
}

function reconcileStaleSessions() {
  const sessions = loadActiveSessions();
  const todayKey = getLogicalDay();
  let dirty = false;
  for (const day of Object.keys(sessions)) {
    const session = sessions[day];
    if (getLogicalDay(session.startedAt) !== todayKey) {
      session.completedAt = endOfLogicalDay(session.startedAt);
      appendCompletedSession(session);
      delete sessions[day];
      dirty = true;
    }
  }
  if (dirty) saveActiveSessions(sessions);
}

// ══════════════════════════════════════════
//  NEXT WORKOUT ROTATION
//  heavy-a → acc-a → heavy-b → acc-b → heavy-a → …
//  Derives which tab to show on load from the last completed session.
// ══════════════════════════════════════════
const DAY_ROTATION = ['heavy-a', 'acc-a', 'heavy-b', 'acc-b'];

function getNextDay() {
  const completed = loadCompletedSessions();
  if (completed.length === 0) return 'heavy-a';
  const lastDay = completed[0].day;
  const idx = DAY_ROTATION.indexOf(lastDay);
  if (idx === -1) return 'heavy-a';
  return DAY_ROTATION[(idx + 1) % DAY_ROTATION.length];
}

// ══════════════════════════════════════════
//  EXERCISE LIBRARY
//  defaultWeight = conservative starting weight seeded on first load.
// ══════════════════════════════════════════
const EXERCISES = {

  // ── Main compounds ─────────────────────
  barbell_back_squat: {
    displayName:  'Barbell Back Squat',
    sets: 5, reps: 5,
    video: 'ultWZbUMPL8', notes: '',
    rest: { easy: 90, hard: 180, failed: 300 },
    progression: { increment: 5, successesNeeded: 1, targetReps: 5 },
    estMinutes: 15, defaultWeight: 95,
  },
  barbell_bench_press: {
    displayName:  'Barbell Bench Press',
    sets: 5, reps: 5,
    video: 'rT7DgCr-3pg', notes: '',
    rest: { easy: 90, hard: 180, failed: 300 },
    progression: { increment: 5, successesNeeded: 1, targetReps: 5 },
    estMinutes: 15, defaultWeight: 75,
  },
  barbell_overhead_press: {
    displayName:  'Barbell Overhead Press',
    sets: 5, reps: 5,
    video: 'QAQ64hK4Xxs', notes: '',
    rest: { easy: 90, hard: 180, failed: 300 },
    progression: { increment: 5, successesNeeded: 1, targetReps: 5 },
    estMinutes: 15, defaultWeight: 55,
  },
  romanian_deadlift: {
    displayName:  'Romanian Deadlift',
    sets: 3, reps: 6,
    video: 'xY8BywOKkLQ', notes: '',
    rest: { easy: 120, hard: 180, failed: 300 },
    progression: { increment: 5, successesNeeded: 1, targetReps: 6 },
    estMinutes: 12, defaultWeight: 75,
  },

  // ── Secondary compounds ─────────────────
  barbell_shrugs: {
    displayName:  'Barbell Shrugs',
    sets: 4, reps: 10,
    video: 'g6qbq4Lf1FI', notes: '',
    rest: { easy: 60, hard: 120, failed: 180 },
    progression: { increment: 5, successesNeeded: 2, targetReps: 10 },
    estMinutes: 8, defaultWeight: 95,
  },
  single_arm_db_row: {
    displayName:  'Single Arm DB Row',
    sets: 3, reps: 8,
    video: 'FWJR5Ve8bnQ', notes: 'Fat grips optional',
    rest: { easy: 60, hard: 90, failed: 180 },
    progression: { increment: 5, successesNeeded: 2, targetReps: 8 },
    estMinutes: 8, defaultWeight: 35,
  },
  split_squats: {
    displayName:  'Split Squats',
    sets: 3, reps: 8,
    video: 'placeholder', notes: '',
    rest: { easy: 60, hard: 90, failed: 180 },
    progression: { increment: 5, successesNeeded: 2, targetReps: 8 },
    estMinutes: 8, defaultWeight: 25,
  },
  leg_extensions: {
    displayName:  'Leg Extensions',
    sets: 3, reps: 12,
    video: 'YyvSfVjQeL0', notes: '',
    rest: { easy: 60, hard: 90, failed: 120 },
    progression: { increment: 5, successesNeeded: 3, targetReps: 12 },
    estMinutes: 7, defaultWeight: 50,
  },
  standing_calf_raises: {
    displayName:  'Standing Calf Raises',
    sets: 4, reps: 12,
    video: 'gwLzBJYoWlI', notes: '',
    rest: { easy: 45, hard: 60, failed: 90 },
    progression: { increment: 5, successesNeeded: 3, targetReps: 12 },
    estMinutes: 6, defaultWeight: 45,
  },
  seated_calf_raises: {
    displayName:  'Seated Calf Raises',
    sets: 3, reps: 15,
    video: 'JbyjNymZOt0', notes: '',
    rest: { easy: 45, hard: 60, failed: 90 },
    progression: { increment: 5, successesNeeded: 3, targetReps: 15 },
    estMinutes: 5, defaultWeight: 25,
  },

  // ── Acc A ───────────────────────────────
  cable_wide_grip_row: {
    displayName:  'Cable Wide Grip Row',
    sets: 3, reps: 10,
    video: 'sjJ0z4R3w0M', notes: '',
    progression: { increment: 5, successesNeeded: 3, targetReps: 10 },
    estMinutes: 6, defaultWeight: 40,
  },
  cable_straight_arm_pulldown: {
    displayName:  'Cable Straight-Arm Pulldown',
    sets: 3, reps: 12,
    video: 'G9uNaXGTJ4w', notes: '',
    progression: { increment: 5, successesNeeded: 3, targetReps: 12 },
    estMinutes: 6, defaultWeight: 25,
  },
  cable_kneeling_lat_pulldown: {
    displayName:  'Cable Kneeling Lat Pulldown',
    sets: 3, reps: 10,
    video: 'KA0bfBIOxHY', notes: '',
    progression: { increment: 5, successesNeeded: 3, targetReps: 10 },
    estMinutes: 6, defaultWeight: 40,
  },
  cable_straight_bar_pushdown: {
    displayName:  'Cable Straight Bar Pushdown',
    sets: 3, reps: 10,
    video: '1FjkhpZsaxc', notes: '',
    progression: { increment: 5, successesNeeded: 3, targetReps: 10 },
    estMinutes: 5, defaultWeight: 30,
  },
  cable_internal_rotation: {
    displayName:  'Cable Internal Rotation',
    sets: 2, reps: 12,
    video: 'Eh8pu_wUKHU', notes: '',
    progression: { increment: 2.5, successesNeeded: 3, targetReps: 12 },
    estMinutes: 4, defaultWeight: 10,
  },
  full_can_scaption: {
    displayName:  'Full Can / Scaption',
    sets: 2, reps: 12,
    video: '-NA8lUy5_Qc', notes: '',
    progression: { increment: 2.5, successesNeeded: 3, targetReps: 12 },
    estMinutes: 4, defaultWeight: 10,
  },
  narrow_grip_ez_bar_curl: {
    displayName:  'Narrow Grip EZ Bar Curl',
    sets: 3, reps: 8,
    video: 'cdmnvo3augg', notes: '',
    progression: { increment: 2.5, successesNeeded: 3, targetReps: 8 },
    estMinutes: 5, defaultWeight: 30,
  },
  glute_ham_raise: {
    displayName:  'Glute Ham Raise',
    sets: 3, reps: 8,
    video: '24pK_4kEUsM', notes: '',
    progression: { increment: 0, successesNeeded: 3, targetReps: 8 },
    estMinutes: 6, defaultWeight: 0,
  },
  copenhagen_planks: {
    displayName:  'Copenhagen Planks',
    sets: 3, reps: 20,
    video: 'aDsaGBnvDQo', notes: '',
    progression: { increment: 0, successesNeeded: 3, targetReps: 20 },
    estMinutes: 5, defaultWeight: 0,
  },
  standing_wrist_curls: {
    displayName:  'Standing Wrist Curls (behind back)',
    sets: 3, reps: 15,
    video: 'Cj9RNAYD7iY', notes: '',
    progression: { increment: 2.5, successesNeeded: 3, targetReps: 15 },
    estMinutes: 4, defaultWeight: 20,
  },
  reverse_curls_ez_bar: {
    displayName:  'Reverse Curls (EZ Bar)',
    sets: 3, reps: 8,
    video: 'MOEMvgYzNZQ', notes: '',
    progression: { increment: 2.5, successesNeeded: 3, targetReps: 8 },
    estMinutes: 4, defaultWeight: 25,
  },
  wrist_rollers: {
    displayName:  'Wrist Rollers',
    sets: 1, reps: 30,
    video: 'qb0A0pHGhyA', notes: '',
    progression: { increment: 0, successesNeeded: 3, targetReps: 30 },
    estMinutes: 3, defaultWeight: 10,
  },

  // ── Acc B ───────────────────────────────
  cable_kneeling_face_pulls: {
    displayName:  'Cable Kneeling Face Pulls',
    sets: 3, reps: 12,
    video: '_L5P--9cFDg', notes: '',
    progression: { increment: 5, successesNeeded: 3, targetReps: 12 },
    estMinutes: 6, defaultWeight: 25,
  },
  cable_y_raises: {
    displayName:  'Cable Y-Raises',
    sets: 3, reps: 12,
    video: 'placeholder', notes: '',
    progression: { increment: 2.5, successesNeeded: 3, targetReps: 12 },
    estMinutes: 5, defaultWeight: 10,
  },
  cable_reverse_grip_lat_pulldown: {
    displayName:  'Cable Reverse Grip Lat Pulldown',
    sets: 3, reps: 10,
    video: 'rguA3pm73rs', notes: '',
    progression: { increment: 5, successesNeeded: 3, targetReps: 10 },
    estMinutes: 6, defaultWeight: 40,
  },
  cable_external_rotation_press: {
    displayName:  'Cable External Rotation Press',
    sets: 2, reps: 10,
    video: 'mO8YJAxVG2M', notes: '',
    progression: { increment: 2.5, successesNeeded: 3, targetReps: 10 },
    estMinutes: 4, defaultWeight: 10,
  },
  cable_rope_pushdown: {
    displayName:  'Cable Rope Pushdown',
    sets: 3, reps: 10,
    video: 'kiuVA0gs3EI', notes: '',
    progression: { increment: 5, successesNeeded: 3, targetReps: 10 },
    estMinutes: 5, defaultWeight: 30,
  },
  cable_high_to_low_woodchoppers: {
    displayName:  'Cable High to Low Woodchoppers',
    sets: 3, reps: 10,
    video: 'pAplQXk3dkU', notes: '',
    progression: { increment: 5, successesNeeded: 3, targetReps: 10 },
    estMinutes: 6, defaultWeight: 20,
  },
  palloff_press: {
    displayName:  'Palloff Press',
    sets: 3, reps: 8,
    video: 'AH_QZLm_0-s', notes: '',
    progression: { increment: 5, successesNeeded: 3, targetReps: 8 },
    estMinutes: 6, defaultWeight: 20,
  },
  side_lying_external_rotations: {
    displayName:  'Side-lying External Rotations',
    sets: 3, reps: 15,
    video: 'jJo1CbgXb_A', notes: '',
    progression: { increment: 2.5, successesNeeded: 3, targetReps: 15 },
    estMinutes: 5, defaultWeight: 10,
  },
  wide_grip_preacher_curl: {
    displayName:  'Wide Grip BB / Preacher Curl',
    sets: 3, reps: 8,
    video: 'soxrZlIl35U', notes: '',
    progression: { increment: 2.5, successesNeeded: 3, targetReps: 8 },
    estMinutes: 5, defaultWeight: 30,
  },
  db_hammer_curls: {
    displayName:  'DB Hammer Curls',
    sets: 3, reps: 10,
    video: 'P5sXHLmXmBM', notes: '',
    progression: { increment: 2.5, successesNeeded: 3, targetReps: 10 },
    estMinutes: 5, defaultWeight: 25,
  },
  weighted_crunches: {
    displayName:  'Weighted Crunches',
    sets: 3, reps: 10,
    video: 'Yg6GsyZoqK0', notes: '',
    progression: { increment: 5, successesNeeded: 3, targetReps: 10 },
    estMinutes: 5, defaultWeight: 25,
  },
  ab_wheel_rollouts: {
    displayName:  'Ab Wheel Rollouts',
    sets: 3, reps: 8,
    video: 'XWJmFD_AdbM', notes: '',
    progression: { increment: 0, successesNeeded: 3, targetReps: 8 },
    estMinutes: 5, defaultWeight: 0,
  },
  standing_wrist_extensions: {
    displayName:  'Standing Wrist Extensions',
    sets: 3, reps: 15,
    video: 'yz2eCSWoY4E', notes: '',
    progression: { increment: 2.5, successesNeeded: 3, targetReps: 15 },
    estMinutes: 4, defaultWeight: 15,
  },
  db_pronation_supination: {
    displayName:  'DB Pronation / Supination',
    sets: 2, reps: 10,
    video: 'iB_Vw3xIJKM', notes: '',
    progression: { increment: 2.5, successesNeeded: 3, targetReps: 10 },
    estMinutes: 3, defaultWeight: 10,
  },

  // ── Acc A extras ────────────────────────
  incline_db_bench_press: {
    displayName:  'Incline DB Bench Press',
    sets: 3, reps: 8,
    video: 'hChjZQhX1Ls', notes: '',
    progression: { increment: 5, successesNeeded: 3, targetReps: 8 },
    estMinutes: 7, defaultWeight: 30,
  },
  db_lateral_raises: {
    displayName:  'DB Lateral Raises',
    sets: 3, reps: 12,
    video: '3VcKaXpzqRo', notes: '',
    progression: { increment: 2.5, successesNeeded: 3, targetReps: 12 },
    estMinutes: 5, defaultWeight: 15,
  },
};

// ══════════════════════════════════════════
//  HELPER — resolve a step key (or array of keys) → exercise object(s)
// ══════════════════════════════════════════
function resolveStep(step){
  if(Array.isArray(step)) return step.map(k => EXERCISES[k]);
  return EXERCISES[step];
}

function exName(key){ return EXERCISES[key]?.displayName ?? key; }

const REST_DEFAULTS = { easy: 90, hard: 180, failed: 300 };

function getRestTimes(key){
  return EXERCISES[key]?.rest ?? REST_DEFAULTS;
}

// ══════════════════════════════════════════
//  TIME REMAINING
// ══════════════════════════════════════════
function minsRemaining(day, currentIdx){
  const steps = DAYS[day].steps;
  return steps.slice(currentIdx).reduce((sum, step) => {
    const keys = Array.isArray(step) ? step : [step];
    const mins = Math.max(...keys.map(k => EXERCISES[k]?.estMinutes ?? 5));
    return sum + mins;
  }, 0);
}

// ══════════════════════════════════════════
//  DAYS
// ══════════════════════════════════════════
const DAYS = {
  'heavy-a': {
    label: 'Heavy A', warmup: true,
    steps: [
      'barbell_back_squat',
      'barbell_bench_press',
      'barbell_shrugs',
      ['incline_db_bench_press', 'db_lateral_raises'],
      'single_arm_db_row',
    ],
  },
  'heavy-b': {
    label: 'Heavy B', warmup: true,
    steps: [
      'barbell_overhead_press',
      'barbell_shrugs',
      'romanian_deadlift',
      'split_squats',
      'single_arm_db_row',
      'leg_extensions',
      'standing_calf_raises',
      'seated_calf_raises',
    ],
  },
  'acc-a': {
    label: 'Acc A', warmup: false,
    steps: [
      ['cable_wide_grip_row', 'cable_straight_arm_pulldown'],
      'cable_kneeling_lat_pulldown',
      'cable_straight_bar_pushdown',
      'cable_internal_rotation',
      ['full_can_scaption', 'narrow_grip_ez_bar_curl'],
      ['glute_ham_raise', 'copenhagen_planks'],
      'standing_wrist_curls',
      'reverse_curls_ez_bar',
      'wrist_rollers',
    ],
  },
  'acc-b': {
    label: 'Acc B', warmup: false,
    steps: [
      ['cable_kneeling_face_pulls', 'cable_y_raises'],
      'cable_reverse_grip_lat_pulldown',
      'cable_external_rotation_press',
      'cable_rope_pushdown',
      'cable_high_to_low_woodchoppers',
      'palloff_press',
      'side_lying_external_rotations',
      'wide_grip_preacher_curl',
      'db_hammer_curls',
      'weighted_crunches',
      'ab_wheel_rollouts',
      'standing_wrist_extensions',
      'db_pronation_supination',
    ],
  },
};

// ══════════════════════════════════════════
//  SEED DEFAULT WEIGHTS
//  On first load (empty history), write one synthetic entry per exercise
//  so getProgressionData has a lastWeight to work from immediately.
//  Marked with seeded:true so they can be distinguished if ever needed.
// ══════════════════════════════════════════
function seedDefaultWeights() {
  const existing = JSON.parse(localStorage.getItem('workoutHistory') || '[]');
  if (existing.length > 0) return; // only run once, on a fresh install

  const seeded = [];
  // Use a timestamp slightly in the past so real entries always sort newer.
  const seedDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  for (const [key, ex] of Object.entries(EXERCISES)) {
    if (!ex.progression || ex.defaultWeight == null) continue;
    const w = ex.defaultWeight;
    const numSets = ex.sets ?? 3;
    const targetReps = ex.progression.targetReps;
    // Build sets array: all sets at default weight, all reps at target - 1.
    // One rep below target so the first real session can establish the streak
    // rather than inheriting a false "streak 1" from seeded data.
    const sets = Array.from({ length: numSets }, () => ({
      weight: String(w),
      reps: String(targetReps - 1),
    }));
    seeded.push({
      exerciseKey: key,
      exercise: ex.displayName,
      uid: `seed-${key}`,
      day: 'seed',
      sets,
      date: seedDate.toLocaleString(),
      seeded: true,
    });
  }

  localStorage.setItem('workoutHistory', JSON.stringify(seeded));
}

// ══════════════════════════════════════════
//  SET STATE
// ══════════════════════════════════════════
const setState = {};

function initSetState(uid, numSets, suggestedWeight, targetReps) {
  if (setState[uid]) return;
  setState[uid] = {
    weight: suggestedWeight || 0,
    targetReps,
    pills: Array.from({length: numSets}, () => ({ reps: null, locked: false })),
  };
}

function getState(uid) { return setState[uid]; }

function tapPill(uid, pillIdx) {
  const s = getState(uid);
  if (!s) return;
  const pill = s.pills[pillIdx];
  const target = s.targetReps;
  if (pill.reps === null) {
    pill.reps = target;
  } else if (pill.reps === 0) {
    pill.reps = target;
  } else {
    pill.reps -= 1;
  }
  renderSetWidget(uid);
}

function lockNextSet(uid) {
  const s = getState(uid);
  if (!s) return;
  const pill = s.pills.find(p => p.reps !== null && !p.locked);
  if (!pill) return;
  pill.weight = s.weight || 0;
  pill.locked = true;
  startTimer(getSmartTimer(s.exKey || '', pill.reps, s.targetReps));
  renderSetWidget(uid);
}

// ── Weight modal ──────────────────────────
function openWeightModal(uid) {
  const s = getState(uid);
  if (!s) return;
  const modal = document.getElementById('weight-modal');
  const input = document.getElementById('weight-modal-input');
  const title = document.getElementById('weight-modal-title');
  title.textContent = s.exName || 'Weight';
  input.value = s.weight || '';
  modal.dataset.uid = uid;
  modal.classList.add('open');
  setTimeout(() => input.focus(), 80);
}

function closeWeightModal(save) {
  const modal = document.getElementById('weight-modal');
  const uid = modal.dataset.uid;
  if (save && uid) {
    const input = document.getElementById('weight-modal-input');
    const val = parseFloat(input.value);
    if (!isNaN(val)) {
      getState(uid).weight = val;
      renderSetWidget(uid);
    }
  }
  modal.classList.remove('open');
}

function renderSetWidget(uid) {
  const s = getState(uid);
  if (!s) return;
  const container = document.getElementById('sw-' + uid);
  if (!container) return;

  const weightLbl = s.weight ? `${s.weight} lbs` : 'Set Wgt';
  const weightEmpty = !s.weight;

  const pillsHTML = s.pills.map((pill, i) => {
    let cls = 'set-pill';
    let label = '';
    if (pill.reps === null) {
      cls += ' pill-empty';
      label = `<span class="pill-num">${i + 1}</span>`;
    } else if (pill.locked) {
      cls += ' pill-locked';
      label = `<span class="pill-num">${pill.reps}</span>`;
    } else {
      cls += ' pill-pending';
      label = `<span class="pill-num">${pill.reps}</span>`;
    }
    return `<button class="${cls}" onclick="tapPill('${uid}',${i})" aria-label="Set ${i+1}">${label}</button>`;
  }).join('');

  const hasPending = s.pills.some(p => p.reps !== null && !p.locked);
  const allLocked  = s.pills.every(p => p.locked);

  container.innerHTML = `
    <div class="sw-weight-row">
      <button class="weight-chip${weightEmpty ? ' weight-chip-empty' : ''}" onclick="openWeightModal('${uid}')">
        <span class="weight-chip-val">${weightLbl}</span>
      </button>
      ${allLocked ? `<span class="sets-done-badge">✓ done</span>` : ''}
    </div>
    <div class="sw-pills">${pillsHTML}</div>
    ${!allLocked ? `
    <button class="btn-new-set${hasPending ? ' btn-new-set-ready' : ''}"
            onclick="lockNextSet('${uid}')"
            ${hasPending ? '' : 'disabled'}>
      Start New Set
    </button>` : ''}
  `;
}

// ══════════════════════════════════════════
//  TIMER STATE
// ══════════════════════════════════════════
let timerInterval=null, remaining=0, customSec=120;
let timerEnd=null;
let timerPresetsVisible = false;

async function startTimer(sec){
  stopTimer();
  timerEnd = Date.now() + sec * 1000;
  tickTimer();
  timerInterval = setInterval(tickTimer, 500);
}

function stopTimer(){ if(timerInterval){ clearInterval(timerInterval); timerInterval=null; } }

function openCustomTimerModal(){
  const modal = document.getElementById('custom-timer-modal');
  const input = document.getElementById('custom-timer-input');
  input.value = customSec;
  modal.classList.add('open');
  setTimeout(() => { input.focus(); input.select(); }, 80);
}

function closeCustomTimerModal(start){
  const modal = document.getElementById('custom-timer-modal');
  if(start){
    const val = parseInt(document.getElementById('custom-timer-input').value);
    if(!isNaN(val) && val > 0){ customSec = val; startTimer(customSec); }
  }
  modal.classList.remove('open');
}

function customTimer(){ openCustomTimerModal(); }

function tickTimer(){
  if(timerEnd){
    remaining = Math.max(0, Math.round((timerEnd - Date.now()) / 1000));
  }
  updateAllTimers();
  if(remaining===0 && timerInterval){ stopTimer(); }
}

function updateAllTimers(){
  const m=Math.floor(remaining/60), s=remaining%60;
  const txt=`${m}:${s.toString().padStart(2,'0')}`;
  document.querySelectorAll('.timer-display').forEach(el=>{
    el.textContent = txt;
    el.className = 'timer-display'+(remaining<=10&&remaining>0?' urgent':(remaining===0?' done':''));
  });
}

function toggleTimerPresets(){
  timerPresetsVisible = !timerPresetsVisible;
  document.querySelectorAll('.timer-presets-wrap').forEach(el=>{ el.classList.toggle('hidden',!timerPresetsVisible); });
}

// ══════════════════════════════════════════
//  WEIGHT PROGRESSION HELPERS
// ══════════════════════════════════════════

// Canonical weight for a history entry: minimum across all sets.
function sessionWeight(entry) {
  if (!entry.sets.length) return 0;
  return Math.min(...entry.sets.map(s => parseFloat(s.weight) || 0));
}

function getProgressionData(key){
  const hist = JSON.parse(localStorage.getItem('workoutHistory')||'[]');
  const ex   = EXERCISES[key];
  if(!ex?.progression) return { suggestedWeight: null, badge: null, levelUp: false };
  const cfg  = ex.progression;
  const name = ex.displayName;

  // entries is newest-first (guaranteed by hist.unshift on every save)
  const entries = hist.filter(h => h.exerciseKey === key || h.exercise === name);
  if(entries.length === 0) return { suggestedWeight: null, badge: null, levelUp: false };

  const lastWeight = sessionWeight(entries[0]);
  const targetReps = cfg.targetReps;

  let streak = 0;
  for(const entry of entries){
    const allRepsGood = entry.sets.every(s => parseInt(s.reps) >= targetReps);
    const weightGood  = sessionWeight(entry) >= lastWeight;
    if(allRepsGood && weightGood) streak++;
    else break;
  }

  const needed = cfg.successesNeeded;
  if(streak >= needed && cfg.increment > 0){
    const newW = lastWeight + cfg.increment;
    return {
      suggestedWeight: newW,
      badge: `${newW} lbs (${cfg.increment}↑)`,
      levelUp: true,
      prevWeight: lastWeight,
      increment: cfg.increment,
    };
  } else if(streak > 0 && needed > 1){
    return { suggestedWeight: lastWeight, badge: `${lastWeight} lbs · Streak ${streak}/${needed} 🚀`, levelUp: false };
  } else {
    return { suggestedWeight: lastWeight, badge: lastWeight > 0 ? `${lastWeight} lbs` : null, levelUp: false };
  }
}

function getSmartTimer(key, enteredReps, targetReps){
  const ex   = EXERCISES[key];
  const rest = getRestTimes(key);
  const target = targetReps ?? ex?.progression?.targetReps;
  if(target === undefined) return rest.hard;
  if(enteredReps === null || enteredReps === undefined) return rest.hard;
  if(enteredReps === 0) return rest.failed;
  if(enteredReps >= target) return rest.easy;
  if(enteredReps >= target - 1) return rest.hard;
  return rest.failed;
}

// ══════════════════════════════════════════
//  CAROUSEL STATE
// ══════════════════════════════════════════
const carouselIdx = {};
function getVirtualIdx(day){ return carouselIdx[day] ?? -1; }
function setVirtualIdx(day,i){ carouselIdx[day] = i; }

// ══════════════════════════════════════════
//  BUILD TIMER HTML
// ══════════════════════════════════════════
function timerHTML(){
  return `<div class="timer-card">
    <div class="timer-lbl">Rest Timer</div>
    <div class="timer-display done">0:00</div>
    <div class="timer-presets-wrap">
      <div class="timer-presets">
        <button class="t-pre" onclick="startTimer(${REST_DEFAULTS.easy})">90s<small>easy win</small></button>
        <button class="t-pre" onclick="startTimer(${REST_DEFAULTS.hard})">3 min<small>hard set</small></button>
        <button class="t-pre" onclick="startTimer(${REST_DEFAULTS.failed})">5 min<small>failed</small></button>
        <button class="t-pre" onclick="customTimer()">Custom<small>manual</small></button>
      </div>
    </div>
  </div>`;
}

// ══════════════════════════════════════════
//  BUILD EXERCISE CARD INNER HTML
// ══════════════════════════════════════════
function exCardInner(key, uid){
  const ex  = EXERCISES[key];
  const vid = ex.video === 'placeholder' ? null : `https://www.youtube.com/watch?v=${ex.video}`;
  const prog       = getProgressionData(key);
  const targetReps = ex.progression?.targetReps ?? 10;
  const numSets    = ex.sets ?? 3;

  const badgeHTML = prog.badge
    ? `<div class="weight-badge${prog.badge.includes('🚀') ? ' pending' : ''}"> · ${prog.badge}</div>`
    : '';

  // Level-up banner — shown above the set widget when a new weight is earned.
  const levelUpHTML = prog.levelUp ? `
    <div class="levelup-banner">
      <span class="levelup-icon">⬆</span>
      <span class="levelup-text">New weight: <strong>${prog.suggestedWeight} lbs</strong></span>
      <span class="levelup-delta">+${prog.increment} lbs</span>
    </div>` : '';

  initSetState(uid, numSets, prog.suggestedWeight, targetReps);
  getState(uid).exKey  = key;
  getState(uid).exName = ex.displayName;
  getState(uid).targetReps = targetReps;

  const setsLabel = `${numSets} sets · ${targetReps} reps`;

  return `
    <div class="ex-header">
      <div class="ex-meta">
        <div class="ex-name">${ex.displayName}</div>
        <div class="ex-sets-lbl">${setsLabel}${badgeHTML}</div>
        ${ex.notes ? `<div class="ex-notes">${ex.notes}</div>` : ''}
      </div>
      ${vid
        ? `<a href="${vid}" target="_blank" class="yt-btn">▶</a>`
        : `<span class="yt-btn" style="opacity:.35;cursor:default">▶</span>`}
    </div>
    ${levelUpHTML}
    <div id="sw-${uid}"></div>
  `;
}

function initWidgets(step, day, stepIdx) {
  const items = Array.isArray(step) ? step : [step];
  items.forEach((ex, part) => {
    const uid = `${day}-${stepIdx}-${part}`;
    renderSetWidget(uid);
  });
}

// ══════════════════════════════════════════
//  BUILD ONE SLIDE
// ══════════════════════════════════════════
function buildSlide(step, day, stepIdx){
  const isSuperset = Array.isArray(step);
  const uid0 = `${day}-${stepIdx}-0`;

  if(isSuperset){
    const uid1 = `${day}-${stepIdx}-1`;
    return `<div class="ss-box">
      <div class="ss-label-wrap"><span class="ss-label">⚡ Superset</span></div>
      <div class="ss-inner-card">${exCardInner(step[0], uid0)}</div>
      <div class="ss-divider"></div>
      <div class="ss-inner-card">${exCardInner(step[1], uid1)}</div>
    </div>`;
  } else {
    return `<div class="ex-card">${exCardInner(step, uid0)}</div>`;
  }
}

// ══════════════════════════════════════════
//  WARMUP SLIDE
// ══════════════════════════════════════════
function warmupSlide(){
  return `<div class="warmup-slide-card">
    <div class="warmup-title">Warm-Up</div>
    <div class="warmup-row"><span class="wn">Hip Flexor Stretch</span><span class="ws">30–45s/side</span></div>
    <div class="warmup-row"><span class="wn">Banded Clamshells</span><span class="ws">2×15/side</span></div>
    <div class="warmup-row"><span class="wn">Banded TKEs</span><span class="ws">2×15–20/side</span></div>
    <div class="warmup-row"><span class="wn">Goblet Squat w/ Pause</span><span class="ws">2×5 (3s)</span></div>
  </div>`;
}

// ══════════════════════════════════════════
//  RENDER FULL DAY PAGE
// ══════════════════════════════════════════
function renderDay(day){
  const cnt = document.getElementById('cnt-'+day);
  if(!cnt) return;
  const data  = DAYS[day];
  const steps = data.steps;
  const vidx  = getVirtualIdx(day);
  const total = steps.length;

  let html = timerHTML();

  // ── Warmup ──
  if(data.warmup && vidx < 0){
    const firstStep = steps[0];
    const firstName = Array.isArray(firstStep) ? exName(firstStep[0]) + ' + …' : exName(firstStep);
    html += `<div class="progress-bar-wrap">
      <div class="progress-bar-track"><div class="progress-bar-fill" style="width:0%"></div></div>
      <div class="progress-count">Warm Up</div>
    </div>`;
    html += `<div class="slides-viewport"><div class="slides-track">
      <div class="slide">${warmupSlide()}</div>
    </div></div>`;
    html += `<div class="next-up-bar"><span class="next-up-label">Next up</span><span class="next-up-name">${firstName}</span></div>`;
    html += `<div class="action-row">
      <button class="btn-back" disabled>← Prev</button>
      <div></div>
      <button class="btn-save" onclick="advanceDay('${day}')">Next →</button>
    </div>`;
    cnt.innerHTML = html;
    return;
  }

  const idx = Math.max(0, vidx);

  // ── Done ──
  if(idx >= total){
    completeSession(day);
    html += `<div class="day-done">
      <div class="done-big">🎉</div>
      <div class="done-msg">${data.label} complete!<br>Nice work.</div>
      <button class="restart-btn" onclick="openRestartModal('${day}')">Restart Workout</button>
    </div>`;
    cnt.innerHTML = html;
    return;
  }

  // ── Progress bar ──
  const barTotal = data.warmup ? total + 1 : total;
  const barIdx   = data.warmup ? idx + 1 : idx;
  const mins     = minsRemaining(day, idx);
  html += `<div class="progress-bar-wrap">
    <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${(barIdx/barTotal)*100}%"></div></div>
    <div class="progress-count">${idx+1} / ${total} · ~${mins} min</div>
  </div>`;

  // ── Slide ──
  html += `<div class="slides-viewport" id="vp-${day}"><div class="slides-track" id="track-${day}">`;
  html += `<div class="slide">${buildSlide(steps[idx], day, idx)}</div>`;
  html += `</div></div>`;

  // ── Next up banner ──
  const nextStep = idx + 1 < total ? steps[idx+1] : null;
  if(nextStep){
    const nextName = Array.isArray(nextStep)
      ? exName(nextStep[0]) + ' + ' + exName(nextStep[1])
      : exName(nextStep);
    html += `<div class="next-up-bar"><span class="next-up-label">Next up</span><span class="next-up-name">${nextName}</span></div>`;
  }

  // ── Action row ──
  const isLast    = idx === total - 1;
  const canGoBack = data.warmup ? vidx > -1 : idx > 0;

  html += `<div class="action-row">
    <button class="btn-back" onclick="goBack('${day}')" ${canGoBack?'':' disabled'}>← Prev</button>
    <div></div>
    <button class="btn-save${isLast?' last-item':''}" onclick="saveAndAdvance('${day}')">
      ${isLast ? '✓ Finish' : 'Next →'}
    </button>
  </div>`;

  if(isLast && (day==='heavy-a'||day==='heavy-b')){
    html += `<div class="fin-card">
      <div class="fin-title">Optional Finisher</div>
      <div class="fin-row">Farmer Carries<span>3×40–50m</span></div>
      <div class="fin-row">Vest Walk<span>20–30 min</span></div>
      <div class="fin-row">Sandbag Bear Hug Carry<span>when available</span></div>
    </div>`;
  }

  cnt.innerHTML = html;
  initWidgets(steps[idx], day, idx);
}

// ══════════════════════════════════════════
//  SAVE + ADVANCE
// ══════════════════════════════════════════
function saveAndAdvance(day){
  const vidx  = getVirtualIdx(day);
  const idx   = Math.max(0, vidx);
  const step  = DAYS[day].steps[idx];
  const items = Array.isArray(step) ? step : [step];

  items.forEach((key, part) => {
    const uid = `${day}-${idx}-${part}`;
    const s   = getState(uid);
    if(!s) return;

    // Locked pills carry their own snapshotted weight from lock time.
    const sets = s.pills
      .filter(p => p.locked)
      .map(p => ({ weight: String(p.weight ?? s.weight ?? 0), reps: String(p.reps) }));

    const pendingPill = s.pills.find(p => p.reps !== null && !p.locked);
    if(pendingPill){
      sets.push({ weight: String(s.weight || 0), reps: String(pendingPill.reps) });
    }

    if(sets.length === 0) return;

    if(part === 0){
      const lastReps = parseInt(sets[sets.length - 1].reps) || 0;
      startTimer(getSmartTimer(key, lastReps, s.targetReps));
    }

    const ex    = EXERCISES[key];
    const entry = {
      exerciseKey: key,
      exercise: ex?.displayName ?? key,
      uid, day, sets,
      date: new Date().toLocaleString(),
    };
    let hist = JSON.parse(localStorage.getItem('workoutHistory')||'[]');
    hist.unshift(entry);
    if(hist.length > 500) hist = hist.slice(0, 500);
    localStorage.setItem('workoutHistory', JSON.stringify(hist));
  });

  advanceDay(day);
}

function advanceDay(day){
  const vidx = getVirtualIdx(day);
  if(vidx <= 0) maybeStartSession(day);
  setVirtualIdx(day, vidx + 1);
  renderDay(day);
}

function goBack(day){
  const vidx = getVirtualIdx(day);
  const newVidx = vidx - 1;
  if(!DAYS[day].warmup && newVidx < 0) return;
  setVirtualIdx(day, newVidx);
  renderDay(day);
}

function openRestartModal(day){
  const modal = document.getElementById('restart-modal');
  modal.dataset.day = day;
  modal.classList.add('open');
}

function closeRestartModal(confirm){
  const modal = document.getElementById('restart-modal');
  const day   = modal.dataset.day;
  modal.classList.remove('open');
  if(confirm && day) restartDay(day);
}

function restartDay(day){
  const data = DAYS[day];
  abandonSession(day);
  setVirtualIdx(day, data.warmup ? -1 : 0);
  renderDay(day);
}

// ══════════════════════════════════════════
//  HISTORY
// ══════════════════════════════════════════
const DAY_LABELS = {'heavy-a':'Heavy A','heavy-b':'Heavy B','acc-a':'Acc A','acc-b':'Acc B'};

function renderHistory(){
  const cnt  = document.getElementById('cnt-history');
  const hist = JSON.parse(localStorage.getItem('workoutHistory')||'[]');
  // Filter out seeded entries from history display
  const real = hist.filter(w => !w.seeded);
  if(real.length === 0){
    cnt.innerHTML = `<div class="sec-label">History</div><div class="empty">No workouts saved yet.</div>`;
    return;
  }
  let html = `<div class="sec-label">Recent Workouts</div>`;
  html += real.slice(0,40).map((w,i) => `
    <div class="hist-card">
      <div class="hist-ex">${w.exercise}</div>
      <div class="hist-day">${DAY_LABELS[w.day]||w.day||''}</div>
      <div class="hist-sets">${w.sets.map(s=>`${s.weight} lbs × ${s.reps}`).join(' · ')}</div>
      <div class="hist-footer">
        <span class="hist-date">${w.date}</span>
        <button class="del-btn" onclick="deleteEntry(${i})">Delete</button>
      </div>
    </div>
  `).join('');
  cnt.innerHTML = html;
}

function deleteEntry(i){
  let hist = JSON.parse(localStorage.getItem('workoutHistory')||'[]');
  // deleteEntry index is into real (non-seeded) entries, so map back to full array
  const real = hist.map((w,idx) => ({w,idx})).filter(({w}) => !w.seeded);
  if(real[i]) hist.splice(real[i].idx, 1);
  localStorage.setItem('workoutHistory',JSON.stringify(hist));
  renderHistory();
}

// ══════════════════════════════════════════
//  NAV
// ══════════════════════════════════════════
function showPage(id,event){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('page-'+id).classList.add('active');
  if(event&&event.target) event.target.classList.add('active');
  if(id==='history') renderHistory();
}

// ══════════════════════════════════════════
//  MODALS — init once
// ══════════════════════════════════════════
function initWeightModal(){
  const modal = document.createElement('div');
  modal.id = 'weight-modal';
  modal.className = 'wmodal-overlay';
  modal.innerHTML = `
    <div class="wmodal-box">
      <div class="wmodal-title" id="weight-modal-title">Weight</div>
      <div class="wmodal-sub">lbs</div>
      <input class="wmodal-input" id="weight-modal-input" type="number" inputmode="decimal" placeholder="0" step="2.5">
      <div class="wmodal-note">Plate math coming soon</div>
      <div class="wmodal-actions">
        <button class="wmodal-btn wmodal-cancel" onclick="closeWeightModal(false)">Cancel</button>
        <button class="wmodal-btn wmodal-confirm" onclick="closeWeightModal(true)">Save</button>
      </div>
    </div>
  `;
  modal.addEventListener('click', e => { if(e.target === modal) closeWeightModal(false); });
  modal.addEventListener('keydown', e => { if(e.key === 'Enter') closeWeightModal(true); if(e.key === 'Escape') closeWeightModal(false); });
  document.body.appendChild(modal);
}

function initCustomTimerModal(){
  const modal = document.createElement('div');
  modal.id = 'custom-timer-modal';
  modal.className = 'wmodal-overlay';
  modal.innerHTML = `
    <div class="wmodal-box">
      <div class="wmodal-title">Custom Timer</div>
      <div class="wmodal-sub">seconds</div>
      <input class="wmodal-input" id="custom-timer-input" type="number" inputmode="numeric" placeholder="120" min="1">
      <div class="wmodal-actions">
        <button class="wmodal-btn wmodal-cancel" onclick="closeCustomTimerModal(false)">Cancel</button>
        <button class="wmodal-btn wmodal-confirm" onclick="closeCustomTimerModal(true)">Start</button>
      </div>
    </div>
  `;
  modal.addEventListener('click', e => { if(e.target === modal) closeCustomTimerModal(false); });
  modal.addEventListener('keydown', e => { if(e.key === 'Enter') closeCustomTimerModal(true); if(e.key === 'Escape') closeCustomTimerModal(false); });
  document.body.appendChild(modal);
}

function initRestartModal(){
  const modal = document.createElement('div');
  modal.id = 'restart-modal';
  modal.className = 'wmodal-overlay';
  modal.innerHTML = `
    <div class="wmodal-box">
      <div class="wmodal-title">Restart Workout?</div>
      <div class="wmodal-sub">This will clear your progress for this session</div>
      <div class="wmodal-actions">
        <button class="wmodal-btn wmodal-cancel" onclick="closeRestartModal(false)">Cancel</button>
        <button class="wmodal-btn wmodal-confirm wmodal-danger" onclick="closeRestartModal(true)">Restart</button>
      </div>
    </div>
  `;
  modal.addEventListener('click', e => { if(e.target === modal) closeRestartModal(false); });
  modal.addEventListener('keydown', e => { if(e.key === 'Escape') closeRestartModal(false); });
  document.body.appendChild(modal);
}

// ══════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════
initWeightModal();
initCustomTimerModal();
initRestartModal();

seedDefaultWeights();
reconcileStaleSessions();

document.addEventListener('visibilitychange', () => {
  if(document.visibilityState === 'visible') reconcileStaleSessions();
});

// Activate the next workout in rotation, then render all days.
const nextDay = getNextDay();
['heavy-a','heavy-b','acc-a','acc-b'].forEach(day => {
  const data = DAYS[day];
  setVirtualIdx(day, data.warmup ? -1 : 0);
  renderDay(day);
});

// Show the correct tab on load and sync nav highlight.
showPage(nextDay, null);
document.querySelectorAll('.nav-tab').forEach(tab => {
  const tabDay = tab.textContent.trim().toLowerCase().replace(' ', '-');
  // Match tab label to day key via the onclick attribute
  const onclick = tab.getAttribute('onclick') || '';
  if(onclick.includes(`'${nextDay}'`)) tab.classList.add('active');
  else tab.classList.remove('active');
});