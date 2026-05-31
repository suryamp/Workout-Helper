// ══════════════════════════════════════════
//  src/ui/history.js
//  Renders the history tab and handles entry deletion.
// ══════════════════════════════════════════

import { DAY_LABELS }      from '../data/days.js';
import { getHistory, deleteHistoryEntry } from '../db/index.js';

export async function renderHistory() {
  const cnt  = document.getElementById('cnt-history');
  const real = await getHistory({ includeSeeded: false, limit: 40 });

  if (real.length === 0) {
    cnt.innerHTML = `<div class="sec-label">History</div><div class="empty">No workouts saved yet.</div>`;
    return;
  }

  let html = `<div class="sec-label">Recent Workouts</div>`;
  html += real.map(w => `
    <div class="hist-card">
      <div class="hist-ex">${w.exerciseName}</div>
      <div class="hist-day">${DAY_LABELS[w.day] || w.day || ''}</div>
      <div class="hist-sets">${w.sets.map(s => `${s.weight} lbs × ${s.reps}`).join(' · ')}</div>
      <div class="hist-footer">
        <span class="hist-date">${w.dateDisplay ?? w.date}</span>
        <button class="del-btn" onclick="deleteEntry(${w.id})">Delete</button>
      </div>
    </div>
  `).join('');

  cnt.innerHTML = html;
}

export async function deleteEntry(id) {
  await deleteHistoryEntry(id);
  renderHistory();
}
