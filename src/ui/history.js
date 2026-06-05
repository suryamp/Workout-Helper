// ══════════════════════════════════════════
//  src/ui/history.js
//  Session-grouped workout history with filter FAB.
// ══════════════════════════════════════════

import { DAY_LABELS, DAY_ROTATION }          from '../data/days.js';
import { EXERCISES }                          from '../data/exercises.js';
import {
  getCompletedSessions,
  getLogsForSession,
  deleteSession as _deleteSession,
  computeVolume,
}                                             from '../db/index.js';
import { buildShareText, shareText }          from './share.js';
import { getUnit }                            from '../utils/settings.js';

// ── Filter + pagination state ────────────────────────────────────────────────

let _filter = {
  days:       [],      // [] = all days
  dateRange:  null,    // null | '7d' | '30d' | 'custom'
  customFrom: '',      // YYYY-MM-DD
  customTo:   '',      // YYYY-MM-DD
};
let _displayLimit = 20;
const LOAD_MORE_STEP = 20;

let _filterOverlay = null;

async function _renderWithReset() {
  window.scrollTo({ top: 0, behavior: 'instant' });
  await renderHistory();
}

function _isFilterActive() {
  return _filter.days.length > 0 || _filter.dateRange !== null;
}

function _applyFilter(sessions) {
  let out = sessions;
  if (_filter.days.length > 0) {
    out = out.filter(s => _filter.days.includes(s.day));
  }
  const now = Date.now();
  if (_filter.dateRange === '7d') {
    out = out.filter(s => s.startedAt >= now - 7 * 86400000);
  } else if (_filter.dateRange === '30d') {
    out = out.filter(s => s.startedAt >= now - 30 * 86400000);
  } else if (_filter.dateRange === 'custom') {
    if (_filter.customFrom)
      out = out.filter(s => s.startedAt >= new Date(_filter.customFrom).getTime());
    if (_filter.customTo)
      out = out.filter(s => s.startedAt < new Date(_filter.customTo).getTime() + 86400000);
  }
  return out;
}

// ── Rendering ────────────────────────────────────────────────────────────────

export async function renderHistory() {
  const cnt = document.getElementById('cnt-history');
  if (!cnt) return;

  // Fetch all session metadata cheaply, filter client-side,
  // then load logs only for the visible slice.
  const allSessions = await getCompletedSessions();
  const filtered    = _applyFilter(allSessions);
  const visible     = filtered.slice(0, _displayLimit);
  const hasMore     = filtered.length > _displayLimit;

  const activeLabel = _isFilterActive()
    ? ` <span class="history-filter-badge">${filtered.length}</span>`
    : '';

  if (filtered.length === 0) {
    cnt.innerHTML = `
      <div class="sec-label">Recent Workouts${activeLabel}</div>
      <div class="empty">${_isFilterActive() ? 'No workouts match the current filter.' : 'No workouts saved yet.'}</div>
      ${_fabHtml()}`;
    return;
  }

  const withLogs = await Promise.all(visible.map(async session => {
    const logs   = await getLogsForSession(session.startedAt);
    const volume = computeVolume(logs);
    return { session, logs, volume };
  }));

  let html = `<div class="sec-label">Recent Workouts${activeLabel}</div>`;
  html += withLogs.map(({ session, logs, volume }) => _sessionCard(session, logs, volume)).join('');

  if (hasMore) {
    const remaining = Math.min(LOAD_MORE_STEP, filtered.length - _displayLimit);
    html += `<button class="history-load-more-btn" onclick="historyLoadMore()">Show ${remaining} more</button>`;
  }

  html += _fabHtml();
  cnt.innerHTML = html;
}

function _fabHtml() {
  const active = _isFilterActive();
  return `<div class="history-fab">
    <button class="history-fab-btn${active ? ' history-fab-active' : ''}" onclick="openHistoryFilter()">☰</button>
  </div>`;
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
    ? `<span class="session-volume">${Math.round(volume).toLocaleString()} ${getUnit()}</span>`
    : '';

  const exRows = logs
    .filter(log => log.sets?.length > 0)
    .map(log => {
      const target = EXERCISES[log.exerciseKey]?.progression?.targetReps ?? 10;
      const wt     = parseFloat(log.sets[0]?.weight) || 0;
      const wtStr  = wt > 0 ? `${wt} ${getUnit()}` : 'BW';
      const reps   = log.sets.map(s => parseInt(s.reps) || 0);
      const dots   = reps.map(r =>
        r === 0     ? '<span class="rep-dot dot-fail">●</span>'  :
        r >= target ? '<span class="rep-dot dot-hit">●</span>'   :
                      '<span class="rep-dot dot-miss">●</span>'
      ).join('');
      return `
        <div class="session-ex-row">
          <span class="session-ex-name">${log.exerciseName}</span>
          <span class="session-ex-detail">${wtStr} <span class="session-ex-dots">${dots}</span></span>
        </div>`;
    }).join('');

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
        <button class="share-btn" onclick="shareSession('${sharePayload}')">➤ Share</button>
      </div>
    </div>`;
}

// ── Filter sheet ──────────────────────────────────────────────────────────────

function _getFilterOverlay() {
  if (_filterOverlay) return _filterOverlay;

  _filterOverlay = document.createElement('div');
  _filterOverlay.className = 'filter-overlay';
  _filterOverlay.innerHTML = '<div class="filter-sheet" id="history-filter-sheet"></div>';
  _filterOverlay.addEventListener('click', e => {
    if (e.target === _filterOverlay) closeHistoryFilter();
  });

  // Swipe down to dismiss
  const sheet = _filterOverlay.querySelector('#history-filter-sheet');
  let _startY = 0, _tracking = null;
  sheet.addEventListener('touchstart', e => {
    _tracking = null;
    _startY = e.touches[0].clientY;
  }, { passive: true });
  sheet.addEventListener('touchmove', e => {
    if (_tracking === false) return;
    const dy = e.touches[0].clientY - _startY;
    if (_tracking === null) {
      if (Math.abs(dy) < 4) return;
      if (dy > 0) { _tracking = true; sheet.style.transition = 'none'; }
      else        { _tracking = false; return; }
    }
    sheet.style.transform = `translateY(${Math.max(0, dy)}px)`;
  }, { passive: true });
  sheet.addEventListener('touchend', e => {
    if (_tracking !== true) { _tracking = null; return; }
    _tracking = null;
    sheet.style.transition = '';
    if (e.changedTouches[0].clientY - _startY > 80) closeHistoryFilter();
    else sheet.style.transform = '';
  }, { passive: true });

  document.body.appendChild(_filterOverlay);
  return _filterOverlay;
}

function _renderFilterSheet() {
  const sheet = document.getElementById('history-filter-sheet');
  if (!sheet) return;

  const dayBtns = DAY_ROTATION.map(day => {
    const on = _filter.days.includes(day);
    return `<button class="filter-chip${on ? ' filter-chip-active' : ''}" onclick="toggleHistoryDayFilter('${day}')">${DAY_LABELS[day] ?? day}</button>`;
  }).join('');

  const rangeOpts = [
    { key: '7d',     label: 'Last 7 days' },
    { key: '30d',    label: 'Last 30 days' },
    { key: 'custom', label: 'Custom range' },
  ].map(({ key, label }) => {
    const on = _filter.dateRange === key;
    return `<button class="filter-chip${on ? ' filter-chip-active' : ''}" onclick="setHistoryDateRange('${key}')">${label}</button>`;
  }).join('');

  const customHtml = _filter.dateRange === 'custom' ? `
    <div class="filter-date-row">
      <div class="filter-date-group">
        <label class="filter-date-label">From</label>
        <input class="filter-date-input" type="date" value="${_filter.customFrom}" onchange="setHistoryCustomFrom(this.value)">
      </div>
      <div class="filter-date-group">
        <label class="filter-date-label">To</label>
        <input class="filter-date-input" type="date" value="${_filter.customTo}" onchange="setHistoryCustomTo(this.value)">
      </div>
    </div>` : '';

  const clearBtn = _isFilterActive()
    ? `<button class="settings-danger-btn" style="margin-top:16px;width:100%;text-align:center;" onclick="clearHistoryFilter()">Clear All Filters</button>`
    : '';

  sheet.innerHTML = `
    <div class="detail-handle"></div>
    <div class="filter-scroll">
      <div class="sec-label">Day</div>
      <div class="filter-chips-row">${dayBtns}</div>
      <div class="sec-label">Date Range</div>
      <div class="filter-chips-row">${rangeOpts}</div>
      ${customHtml}
      ${clearBtn}
    </div>
    <button class="detail-close-btn" onclick="closeHistoryFilter()">Done</button>`;
}

export function openHistoryFilter() {
  const overlay = _getFilterOverlay();
  const sheet   = document.getElementById('history-filter-sheet');
  if (sheet) { sheet.style.transform = ''; sheet.style.transition = ''; }
  _renderFilterSheet();
  overlay.classList.add('open');
}

export function closeHistoryFilter() {
  _filterOverlay?.classList.remove('open');
}

export function toggleHistoryDayFilter(day) {
  const idx = _filter.days.indexOf(day);
  if (idx >= 0) _filter.days.splice(idx, 1);
  else _filter.days.push(day);
  _displayLimit = 20;
  _renderFilterSheet();
  _renderWithReset();
}

export function setHistoryDateRange(range) {
  _filter.dateRange = _filter.dateRange === range ? null : range;
  if (_filter.dateRange !== 'custom') { _filter.customFrom = ''; _filter.customTo = ''; }
  _displayLimit = 20;
  _renderFilterSheet();
  _renderWithReset();
}

export function setHistoryCustomFrom(val) {
  _filter.customFrom = val;
  _displayLimit = 20;
  _renderWithReset();
}

export function setHistoryCustomTo(val) {
  _filter.customTo = val;
  _displayLimit = 20;
  _renderWithReset();
}

export function clearHistoryFilter() {
  _filter = { days: [], dateRange: null, customFrom: '', customTo: '' };
  _displayLimit = 20;
  _renderFilterSheet();
  _renderWithReset();
}

export function historyLoadMore() {
  _displayLimit += LOAD_MORE_STEP;
  renderHistory();
}

// ── Window-facing handlers ────────────────────────────────────────────────────

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
