// ══════════════════════════════════════════
//  src/data/days.js
//  Workout program definitions.
//  References exercise keys only — no EXERCISES import needed.
// ══════════════════════════════════════════

/** Cycle order for "next workout" rotation. */
export const DAY_ROTATION = ['heavy-a', 'acc-a', 'heavy-b', 'acc-b'];

/** Display labels for nav and history cards. */
export const DAY_LABELS = {
  'heavy-a': 'Heavy A',
  'heavy-b': 'Heavy B',
  'acc-a':   'Accessory A',
  'acc-b':   'Accessory B',
};

/**
 * Each entry:
 *   label   — display name shown on the done screen
 *   warmup  — whether to show the warm-up slide before step 0
 *   steps   — ordered array of exercise keys (or [key, key] for supersets)
 */
export const DAYS = {
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
    label: 'Accessory A', warmup: false,
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
    label: 'Accessory B', warmup: false,
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
