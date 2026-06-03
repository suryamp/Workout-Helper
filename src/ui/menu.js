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
  document.body.appendChild(overlay);
}

export function openMenu() {
  document.getElementById('menu-overlay')?.classList.add('open');
}

export function closeMenu() {
  document.getElementById('menu-overlay')?.classList.remove('open');
}
