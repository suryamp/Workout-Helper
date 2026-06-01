// ══════════════════════════════════════════
//  src/ui/nav.js
//  Page visibility toggling, back-button + title management.
// ══════════════════════════════════════════

import { DAY_LABELS } from '../data/days.js';
import { renderHistory } from './history.js';

const _PAGE_TITLES = {
  history:  'History',
  debug:    'Debug',
  trends:   'Trends',
  settings: 'Settings',
  about:    'About',
};

export async function showPage(id, _event) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + id)?.classList.add('active');

  const backBtn = document.getElementById('nav-back');
  const titleEl = document.getElementById('nav-title');

  if (id === 'home') {
    if (backBtn) backBtn.style.visibility = 'hidden';
    if (titleEl) titleEl.textContent = 'Workout Tracker 💪';
  } else {
    if (backBtn) backBtn.style.visibility = '';
    if (titleEl) titleEl.textContent = DAY_LABELS[id] ?? _PAGE_TITLES[id] ?? '';
  }

  if (id === 'history') await renderHistory();
}

/** No-op when nav tabs are absent; kept for backward-compat call in main.js. */
export function setActiveTab(_day) {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.page === _day);
  });
}
