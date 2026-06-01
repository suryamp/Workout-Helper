// ══════════════════════════════════════════
//  src/ui/history.js
//  Session-grouped workout history.
// ══════════════════════════════════════════

import { DAY_LABELS }                    from '../data/days.js';
import { EXERCISES }                     from '../data/exercises.js';
import { getSessionHistory, deleteSession as _deleteSession } from '../db/index.js';
import { buildShareText, shareText }     from './share.js';

// ── Rendering ───────────────────────────────────────────────────────────────

export async function renderHistory() {
  const cnt      = document.getElementById('cnt-history');
  const sessions = await getSessionHistory({ limit: 30 });

  if (sessions.length === 0) {
    cnt.innerHTML = `
      <div class="sec-label">History</div>
      <div class="empty">No workouts saved yet.</div>`;
    return;
  }

  let html = `<div class="sec-label">Recent Workouts</div>`;
  html += sessions.map(({ session, logs, volume }) => _sessionCard(session, logs, volume)).join('');
  cnt.innerHTML = html;
}

function _sessionCard(session, logs, volume) {
  const label   = DAY_LABELS[session.day] ?? session.day;
  const date    = new Date(session.startedAt)
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const mins    = session.completedAt
    ? Math.round((session.completedAt - session.startedAt) / 60000)
    : null;
  const durStr  = mins != null ? ` · ${mins} min` : '';
  const volStr  = volume > 0
    ? `<span class="session-volume">${Math.round(volume).toLocaleString()} lbs</span>`
    : '';

  const exRows = logs
    .filter(log => log.sets?.length > 0)
    .map(log => {
      const target  = EXERCISES[log.exerciseKey]?.progression?.targetReps ?? 10;
      const wt      = parseFloat(log.sets[0]?.weight) || 0;
      const wtStr   = wt > 0 ? `${wt} lbs` : 'BW';
      const reps    = log.sets.map(s => parseInt(s.reps) || 0);
      // Color-coded rep dots
      const dots    = reps.map(r =>
        r === 0           ? '<span class="rep-dot dot-fail">●</span>'  :
        r >= target       ? '<span class="rep-dot dot-hit">●</span>'   :
                            '<span class="rep-dot dot-miss">●</span>'
      ).join('');
      return `
        <div class="session-ex-row">
          <span class="session-ex-name">${log.exerciseName}</span>
          <span class="session-ex-detail">${wtStr} <span class="session-ex-dots">${dots}</span></span>
        </div>`;
    }).join('');

  // Encode share payload into the button — avoids closing over mutable state
  const sharePayload = encodeURIComponent(JSON.stringify({
    session: { day: session.day, startedAt: session.startedAt, completedAt: session.completedAt },
    logs:    logs.map(l => ({ exerciseKey: l.exerciseKey, exerciseName: l.exerciseName, sets: l.sets })),
  }));

  return `
    <div class="session-card">
      <div class="session-header">
        <div class="session-header-left">
          <span class="hist-day">${label}</span>
          <span class="session-date">${date}${durStr}</span>
        </div>
        <div class="session-header-right">
          
          <button class="del-icon-btn" onclick="deleteSession(${session.startedAt})" aria-label="Delete session">🚫</button>
        </div>
      </div>
      <div class="session-exercises">${exRows}</div>
      <div class="session-actions">
        <button class="details-btn" onclick="openSessionDetail(${session.startedAt})">Details</button>
        ${volStr}
        <button class="share-btn"   onclick="shareSession('${sharePayload}')">➤ Share</button>
      </div>
    </div>`;
}

// ── Window-facing handlers (registered in main.js) ──────────────────────────

export async function deleteSession(startedAt) {
  await _deleteSession(startedAt);
  renderHistory();
}

export async function shareSession(encodedPayload) {
  const { session, logs } = JSON.parse(decodeURIComponent(encodedPayload));
  const text = buildShareText(session, logs);
  const result = await shareText(text);
  if (result === 'copied') _showShareFeedback('Copied!');
}

function _showShareFeedback(msg) {
  const el = document.createElement('div');
  el.className   = 'share-toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2000);
}
