// ══════════════════════════════════════════
//  src/ui/nav.js
//  Tab navigation and page visibility toggling.
// ══════════════════════════════════════════

import { renderHistory } from './history.js';

export async function showPage(id, event) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  // FIX #9: use event.target directly rather than parsing onclick string
  if (event?.target) event.target.classList.add('active');
  if (id === 'history') await renderHistory();
}

/**
 * Highlight the nav tab whose data-page attribute matches `day`.
 * 
 * @param {string} day  e.g. 'heavy-a'
 */
export function setActiveTab(day) {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.page === day);
  });
}
