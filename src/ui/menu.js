// ══════════════════════════════════════════
//  src/ui/menu.js
//  Hamburger menu bottom sheet.
//  initMenu() appends the overlay once at boot.
//  open/close exported for main.js to expose as window.* globals.
// ══════════════════════════════════════════

export function initMenu() {
  const overlay       = document.createElement('div');
  overlay.id          = 'menu-overlay';
  overlay.className   = 'menu-overlay';
  overlay.innerHTML   = `
    <div class="menu-sheet">
      <div class="detail-handle"></div>
      <div class="menu-items">
        <button class="menu-item-btn" onclick="menuWorkouts()">Workouts</button>
        <button class="menu-item-btn" onclick="menuHistory()">History</button>
        <button class="menu-item-btn menu-item-stub" onclick="menuTrends()">Trends</button>
        <button class="menu-item-btn" onclick="menuSettings()">Settings</button>
        <button class="menu-item-btn" onclick="menuDebug()">Debug</button>
        <button class="menu-item-btn" onclick="menuExport()">Export Data</button>
        <button class="menu-item-btn" onclick="menuAbout()">About</button>
      </div>
      <button class="menu-close-btn" onclick="closeMenu()">Cancel</button>
    </div>`;

  // Tap outside the sheet to dismiss
  overlay.addEventListener('click', e => { if (e.target === overlay) closeMenu(); });

  // Swipe down to dismiss
  const sheet = overlay.querySelector('.menu-sheet');
  let _startY = 0, _tracking = false;
  sheet.addEventListener('touchstart', e => {
    _startY = e.touches[0].clientY;
    _tracking = true;
    sheet.style.transition = 'none';
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
    if (dy > 80) closeMenu();
    else sheet.style.transform = '';
  }, { passive: true });

  document.body.appendChild(overlay);
}

export function openMenu() {
  const overlay = document.getElementById('menu-overlay');
  if (!overlay) return;
  const sheet = overlay.querySelector('.menu-sheet');
  if (sheet) { sheet.style.transition = ''; sheet.style.transform = ''; }
  overlay.classList.add('open');
}

export function closeMenu() {
  document.getElementById('menu-overlay')?.classList.remove('open');
}
