// ══════════════════════════════════════════
//  src/ui/sessionDetail.js
//  Session detail bottom sheet.
// ══════════════════════════════════════════

import { getSessionDetails } from '../db/index.js';
import { DAY_LABELS }        from '../data/days.js';
import { getVolumeAnimal }   from '../data/volumeAnimals.js';

let _overlay = null;

function _getOverlay() {
  if (_overlay) return _overlay;
  _overlay = document.createElement('div');
  _overlay.id        = 'session-detail-overlay';
  _overlay.className = 'detail-overlay';
  _overlay.innerHTML = '<div class="detail-sheet" id="session-detail-sheet"></div>';
  _overlay.addEventListener('click', e => {
    if (e.target === _overlay) closeSessionDetail();
  });

  const sheet = _overlay.querySelector('#session-detail-sheet');
  let _startY = 0, _tracking = false;
  sheet.addEventListener('touchstart', e => {
    const scroll = sheet.querySelector('.detail-scroll');
    _tracking = !scroll || scroll.scrollTop === 0;
    _startY = e.touches[0].clientY;
    if (_tracking) sheet.style.transition = 'none';
  }, { passive: true });
  sheet.addEventListener('touchmove', e => {
    if (!_tracking) return;
    const dy = Math.max(0, e.touches[0].clientY - _startY);
    sheet.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  sheet.addEventListener('touchend', e => {
    if (!_tracking) return;
    _tracking = false;
    sheet.style.transition = '';
    const dy = e.changedTouches[0].clientY - _startY;
    if (dy > 80) {
      closeSessionDetail();
    } else {
      sheet.style.transform = '';
    }
  }, { passive: true });

  document.body.appendChild(_overlay);
  return _overlay;
}

export async function openSessionDetail(startedAt) {
  const overlay = _getOverlay();
  const sheet   = document.getElementById('session-detail-sheet');
  sheet.style.transform = '';
  sheet.innerHTML = '<div class="detail-loading">Loading…</div>';
  overlay.classList.add('open');

  const details = await getSessionDetails(startedAt);
  if (!details) {
    sheet.innerHTML = '<div class="detail-loading">No data available.</div>';
    return;
  }
  sheet.innerHTML = _renderSheet(details);
}

export function closeSessionDetail() {
  _overlay?.classList.remove('open');
}

// ── Rendering ──────────────────────────────────────────────────────────────

function _renderSheet({ session, exercises, currentVolume, prevVolume }) {
  const label  = DAY_LABELS[session.day] ?? session.day;
  const date   = new Date(session.startedAt)
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const mins   = session.completedAt
    ? Math.round((session.completedAt - session.startedAt) / 60000)
    : null;
  const durStr = mins != null ? ` · ${mins} min` : '';

  const volChip = currentVolume > 0
    ? `<span class="detail-header-vol">${Math.round(currentVolume).toLocaleString()} lbs</span>`
    : '';

  return `
    <div class="detail-handle"></div>
    <div class="detail-header">
      <div class="detail-header-top">
        <span class="detail-day-chip">${label}</span>
        <div class="detail-meta">${date}${durStr}</div>  
      </div>
    </div>
    <div class="detail-scroll">
      ${_renderVolume(currentVolume, prevVolume)}
      <div class="detail-section">
        <div class="detail-section-title">Exercises</div>
        ${exercises.map(_renderExBlock).join('')}
      </div>
    </div>
    <button class="detail-close-btn" onclick="closeSessionDetail()">Close</button>`;
}

function _renderVolume(currentVolume, prevVolume) {
  if (currentVolume <= 0) return '';

  let prevLine = '';
  if (prevVolume === null) {
    prevLine = `<div class="detail-vol-row">
      <span class="detail-vol-label">Last time</span>
      <span class="detail-vol-neutral">First session</span>
    </div>`;
  } else {
    const delta  = currentVolume - prevVolume;
    const pct    = prevVolume > 0 ? Math.abs((delta / prevVolume) * 100).toFixed(1) : null;
    const sign   = delta >= 0 ? '+' : '−';
    const arrow  = delta >= 0 ? '↑' : '↓';
    const cls    = delta >= 0 ? 'detail-vol-up' : 'detail-vol-down';
    const pctStr = pct != null ? ` (${sign}${pct}% ${arrow})` : '';
    prevLine = `<div class="detail-vol-row">
      <span class="detail-vol-label">Last time</span>
      <span class="${cls}">${Math.round(prevVolume).toLocaleString()} lbs${pctStr}</span>
    </div>`;
  }

  const animal  = getVolumeAnimal(currentVolume);
  const article = /^the /i.test(animal.name) ? '' : /^[AEIOUaeiou]/.test(animal.name) ? 'an ' : 'a ';
  const animalLine = `<div class="detail-vol-animal">You lifted the weight of ${article}<strong>${animal.name}</strong> ${animal.emoji}</div>`;

  return `<div class="detail-section">
    <div class="detail-section-title">Volume</div>
    <div class="detail-vol-row">
      <span class="detail-vol-label">Today</span>
      <span class="detail-vol-today">${Math.round(currentVolume).toLocaleString()} lbs</span>
    </div>
    ${prevLine}
    ${animalLine}
  </div>`;
}

function _renderExBlock({ exerciseName, sets, prevBaselineWeight, levelUp, increment, prevWeight, streak, streakNeeded }) {
  let bannerHtml = '';
  if (levelUp && prevWeight != null && increment != null) {
    bannerHtml = `<div class="levelup-banner">
      <span class="levelup-icon">🚀</span>
      <span class="levelup-text">New weight for next time:</span>
      <span class="levelup-delta">${prevWeight + increment} lbs</span>
    </div>`;
  }

  const metaParts = [];
  if (prevBaselineWeight != null && prevBaselineWeight > 0)
    metaParts.push(`<span class="detail-prev-ref">Last time: ${prevBaselineWeight} lbs</span>`);
  else if (prevBaselineWeight === null)
    metaParts.push(`<span class="detail-prev-ref">First time</span>`);
  if (streak > 0 && streakNeeded != null && streakNeeded > 1) {
    const cls = streak >= streakNeeded ? 'detail-streak-done' : 'detail-streak';
    const txt = streak >= streakNeeded ? 'Streak complete 🚀' : `Streak ${streak}/${streakNeeded} 🚀`;
    metaParts.push(`<span class="${cls}">${txt}</span>`);
  }
  const metaHtml = metaParts.length > 0
    ? `<div class="detail-ex-meta">${metaParts.join(' · ')}</div>`
    : '';

  const setRows = sets.map((s, i) => {
    let wtClass  = '';
    let wtSuffix = '';
    if (s.weightDir ===  1) { wtClass = 'detail-wt-up';   wtSuffix = ' ↑'; }
    if (s.weightDir === -1) { wtClass = 'detail-wt-down'; wtSuffix = ' ↓'; }
    const wtStr    = s.weight > 0 ? `${s.weight} lbs` : 'BW';
    const repsClass = s.repsHit ? '' : 'detail-reps-miss';
    const repsStr  = `${s.reps} reps`;

    return `<div class="detail-set-row">
      <span class="detail-set-num">Set ${i + 1}</span>
      <span class="detail-set-wt ${wtClass}">${wtStr}${wtSuffix}</span>
      <span class="detail-set-x"> x </span>
      <span class="detail-set-reps ${repsClass}">${repsStr}</span>
    </div>`;
  }).join('');

  return `<div class="detail-ex-block">
    ${bannerHtml}
    <div class="detail-ex-name">${exerciseName}</div>
    ${metaHtml}
    <div class="detail-set-rows">${setRows}</div>
  </div>`;
}
