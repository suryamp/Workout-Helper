// ══════════════════════════════════════════
//  src/ui/share.js
//  Wordle-style workout share text builder and share/copy helper.
// ══════════════════════════════════════════

import { EXERCISES }  from '../data/exercises.js';
import { DAY_LABELS } from '../data/days.js';
import { getVolumeAnimal } from '../data/volumeAnimals.js';

/**
 * Emoji grade for a single set.
 *   🟩 hit target or exceeded
 *   🟨 one rep short
 *   🟥 failed (0 reps)
 */
function _setEmoji(reps, targetReps) {
  const r = parseInt(reps) || 0;
  if (r === 0)           return '🟥';
  if (r >= targetReps)   return '🟩';
  return '🟨';
}

/**
 * Build the shareable text for a completed workout session.
 *
 * @param {{ day: string, startedAt: number, completedAt: number }} session
 * @param {object[]} logs        — set-logs for this session
 * @param {object[]} [levelUps]  — optional level-up entries from the done screen
 * @returns {string}
 */
export function buildShareText(session, logs, levelUps = []) {
  const label   = DAY_LABELS[session.day] ?? session.day;
  const date    = new Date(session.startedAt)
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const mins    = session.completedAt
    ? Math.round((session.completedAt - session.startedAt) / 60000)
    : null;
  const durStr  = mins != null ? ` · ${mins} min` : '';

  const exRows = logs
    .filter(log => log.sets?.length > 0)
    .map(log => {
      const target = EXERCISES[log.exerciseKey]?.progression?.targetReps ?? 10;
      const dots   = log.sets.map(s => _setEmoji(s.reps, target)).join('');
      // Truncate long exercise names so lines stay compact in a text message
      const name   = log.exerciseName.length > 24
        ? log.exerciseName.slice(0, 22) + '…'
        : log.exerciseName;
      const wt     = parseFloat(log.sets[0]?.weight) || 0;
      const wtStr  = wt > 0 ? ` (${wt} lbs)` : '';
      return `${dots} ${name}${wtStr}`;
    });

  const volume = logs.reduce((t, log) =>
    t + log.sets.reduce((s, set) =>
      s + (parseFloat(set.weight) || 0) * (parseInt(set.reps) || 0)
    , 0)
  , 0);

  const volLine = volume > 0 ? `📦 ${Math.round(volume).toLocaleString()} lbs total` : '';
  const animalLine  = volume > 0 ? (() => {
    const a       = getVolumeAnimal(volume);
    const article = /^the /i.test(a.name) ? '' : /^[AEIOUaeiou]/.test(a.name) ? 'an ' : 'a ';
    return `\nThat's the weight of ${article}${a.name} ${a.emoji}`;
  })() : '';

  const parts = [
    `💪 ${label} · ${date}${durStr}`,
    '',
    exRows.join('\n'),
    '',
    [volLine, animalLine].filter(Boolean).join('\n'),
  ].filter((p, i, arr) => !(p === '' && arr[i - 1] === ''));

  return parts.join('\n').trim();
}

/**
 * Share text via the native share sheet on mobile, or copy to clipboard on desktop.
 * Returns 'shared', 'copied', or 'error'.
 *
 * @param {string} text
 * @returns {Promise<'shared'|'copied'|'error'>}
 */
export async function shareText(text) {
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (e) {
      if (e.name === 'AbortError') return 'error'; // user dismissed
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'error';
  }
}
