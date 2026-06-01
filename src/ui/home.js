// ══════════════════════════════════════════
//  src/ui/home.js
//  Home screen: one day card per program day, last-completed date, "Up Next" badge.
// ══════════════════════════════════════════

import { DAY_LABELS, DAY_ROTATION } from '../data/days.js';
import { getCompletedSessions }     from '../db/index.js';

/**
 * Render the home screen.
 * @param {string} nextDay — day key that should wear the "Up Next" badge
 */
export async function renderHome(nextDay) {
  const cnt = document.getElementById('cnt-home');
  if (!cnt) return;

  const sessions = await getCompletedSessions();   // newest-first

  // Last completed timestamp per day (first hit per day = most recent)
  const lastCompleted = {};
  for (const s of sessions) {
    if (!lastCompleted[s.day] && s.completedAt) {
      lastCompleted[s.day] = s.completedAt;
    }
  }

  const cards = DAY_ROTATION
    .map(day => _dayCard(day, day === nextDay, lastCompleted[day]))
    .join('');

  cnt.innerHTML = `
    <div class="sec-label">Select your program</div>
    <div class="home-cards">${cards}</div>`;
}

function _dayCard(day, isNext, lastTs) {
  const label   = DAY_LABELS[day] ?? day;
  const dateStr = lastTs
    ? new Date(lastTs).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Not yet completed';
  const badge = isNext
    ? '<span class="home-next-badge">Up Next</span>'
    : '';
  return `
    <div class="home-day-card${isNext ? ' home-day-card-next' : ''}" onclick="startDay('${day}')">
      <div class="home-day-top">
        <span class="home-day-label">${label}</span>
        ${badge}
      </div>
      <div class="home-day-last">Last: ${dateStr}</div>
    </div>`;
}
