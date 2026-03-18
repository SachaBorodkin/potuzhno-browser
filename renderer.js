'use strict';

// ─── SEARCH ENGINES ──────────────────────────────────────────────
const ENGINES = [
  { id:'google',     name:'Google',     icon:'https://www.google.com/favicon.ico',     url:'https://www.google.com/search?q={q}' },
  { id:'duckduckgo', name:'DuckDuckGo', icon:'https://duckduckgo.com/favicon.ico',     url:'https://duckduckgo.com/?q={q}' },
  { id:'bing',       name:'Bing',       icon:'https://www.bing.com/favicon.ico',       url:'https://www.bing.com/search?q={q}' },
  { id:'brave',      name:'Brave',      icon:'https://search.brave.com/favicon.ico',   url:'https://search.brave.com/search?q={q}' },
  { id:'ecosia',     name:'Ecosia',     icon:'https://www.ecosia.org/favicon.ico',     url:'https://www.ecosia.org/search?q={q}' },
  { id:'startpage',  name:'Startpage',  icon:'https://www.startpage.com/favicon.ico',  url:'https://www.startpage.com/search?query={q}' },
];

let currentEngine = localStorage.getItem('pb-engine') || 'google';

function buildEngineSelect() {
  const sel = document.getElementById('engine-select');
  sel.innerHTML = '';
  ENGINES.forEach(e => {
    const opt = document.createElement('option');
    opt.value = e.id;
    opt.textContent = e.name;
    if (e.id === currentEngine) opt.selected = true;
    sel.appendChild(opt);
  });
  updateEngineIcon();
}

function setEngine(id) {
  currentEngine = id;
  localStorage.setItem('pb-engine', id);
  updateEngineIcon();
}

function updateEngineIcon() {
  const eng = ENGINES.find(e => e.id === currentEngine);
  const img = document.getElementById('engine-icon');
  if (eng) { img.src = eng.icon; img.style.display = 'block'; }
}

function buildSearchUrl(query) {
  const eng = ENGINES.find(e => e.id === currentEngine) || ENGINES[0];
  return eng.url.replace('{q}', encodeURIComponent(query));
}

// ─── STATE ───────────────────────────────────────────────────────
const webviewsEl    = document.getElementById('webviews');
const tabsEl        = document.getElementById('tabs-container');
const urlbar        = document.getElementById('urlbar');
const statusText    = document.getElementById('status-text');
const sidePanel     = document.getElementById('side-panel');
const panelTitle    = document.getElementById('panel-title');
const zoomIndicator = document.getElementById('zoom-indicator');

let tabs        = [];
let activeTab   = null;
let bookmarks   = [];
let history     = [];
let downloads   = {};
let activePanel = null;
let zoomLevel   = 1.0;
let isIncognito = false;

// ─── INIT ─────────────────────────────────────────────────────────
async function init() {
  const params = new URLSearchParams(window.location.search);
  isIncognito = params.get('incognito') === '1';

  if (isIncognito) {
    document.body.classList.add('incognito');
    document.getElementById('incognito-badge').style.display = 'inline';
  }

  buildEngineSelect();

  if (!isIncognito) {
    try { bookmarks = await window.browserAPI.loadBookmarks() || []; } catch(e) { bookmarks = []; }
    try { history   = await window.browserAPI.loadHistory()   || []; } catch(e) { history   = []; }
  }

  renderBookmarksBar();
  setupDownloadListeners();
  setupKeyboardShortcuts();
  setupContextMenu();

  newTab();
}

// ─── TABS ─────────────────────────────────────────────────────────
function getDefaultPage() {
  // Build a file:// URL pointing to newtab.html next to index.html
  try {
    // window.location.href is like file:///C:/path/to/index.html
    const base = window.location.href.replace(/[^/\\]+$/, '');
    return base + 'newtab.html';
  } catch(e) {
    return 'https://www.google.com';
  }
}

function newTab(url) {
  const src = url || getDefaultPage();
  const id  = Date.now();

  const webview = document.createElement('webview');
  webview.src = src;
  webview.setAttribute('allowpopups', '');
  webviewsEl.appendChild(webview);

  const tab = { id, url: src, title: 'New Tab', webview };
  tabs.push(tab);

  attachWebviewEvents(webview, tab);
  switchTab(id);
  renderTabs();
}

function attachWebviewEvents(webview, tab) {
  webview.addEventListener('did-navigate', e => {
    tab.url = e.url;
    if (activeTab && activeTab.id === tab.id) {
      urlbar.value = e.url;
      updateBookmarkBtn();
    }
    if (!isIncognito && !e.url.startsWith('file://')) {
      addToHistory(tab.title, e.url);
    }
    renderTabs();
  });

  webview.addEventListener('did-navigate-in-page', e => {
    tab.url = e.url;
    if (activeTab && activeTab.id === tab.id) urlbar.value = e.url;
  });

  webview.addEventListener('page-title-updated', e => {
    tab.title = e.title || 'New Tab';
    if (activeTab && activeTab.id === tab.id) updateBookmarkBtn();
    renderTabs();
  });

  webview.addEventListener('did-start-loading', () => {
    if (activeTab && activeTab.id === tab.id) statusText.textContent = 'Loading...';
  });

  webview.addEventListener('did-stop-loading', () => {
    if (activeTab && activeTab.id === tab.id) statusText.textContent = 'Ready';
  });

  webview.addEventListener('update-target-url', e => {
    if (activeTab && activeTab.id === tab.id)
      statusText.textContent = e.url || 'Ready';
  });

  webview.addEventListener('new-window', e => {
    newTab(e.url);
  });
}

function switchTab(id) {
  // Hide all
  tabs.forEach(t => t.webview.classList.remove('active'));

  activeTab = tabs.find(t => t.id === id) || null;
  if (!activeTab) return;

  // Show active
  activeTab.webview.classList.add('active');
  urlbar.value = activeTab.url || '';
  updateBookmarkBtn();
  renderTabs();
}

function closeTab(id) {
  const idx = tabs.findIndex(t => t.id === id);
  if (idx === -1) return;
  tabs[idx].webview.remove();
  tabs.splice(idx, 1);

  if (tabs.length === 0) { newTab(); return; }
  if (activeTab && activeTab.id === id)
    switchTab(tabs[Math.max(0, idx - 1)].id);
  renderTabs();
}

function renderTabs() {
  tabsEl.innerHTML = '';
  tabs.forEach(tab => {
    const el = document.createElement('div');
    el.className = 'tab' + (activeTab && tab.id === activeTab.id ? ' active' : '');
    if (isIncognito) el.classList.add('incognito-tab');

    el.innerHTML =
      '<div class="tab-favicon"></div>' +
      '<span class="tab-title">' + esc(tab.title) + '</span>' +
      '<span class="tab-close" data-id="' + tab.id + '">&#10005;</span>';

    el.addEventListener('click', e => {
      const delBtn = e.target.closest('.tab-close');
      if (delBtn) closeTab(parseInt(delBtn.dataset.id));
      else switchTab(tab.id);
    });

    tabsEl.appendChild(el);
  });
}

// ─── NAVIGATION ──────────────────────────────────────────────────
function navigate(raw) {
  const val = (raw !== undefined ? raw : urlbar.value).trim();
  if (!val) return;

  let url;
  if (/^(https?|file):\/\//.test(val)) {
    url = val;
  } else if (/^[a-zA-Z0-9]([a-zA-Z0-9-]*\.)+[a-zA-Z]{2,}(\/.*)?$/.test(val) && !val.includes(' ')) {
    url = 'https://' + val;
  } else {
    url = buildSearchUrl(val);
  }

  if (activeTab) {
    activeTab.url = url;
    activeTab.webview.src = url;
    urlbar.value = url;
  }
}

function navBack()    { if (activeTab) try { activeTab.webview.goBack();    } catch(e){} }
function navForward() { if (activeTab) try { activeTab.webview.goForward(); } catch(e){} }
function navReload()  { if (activeTab) try { activeTab.webview.reload();    } catch(e){} }

urlbar.addEventListener('keydown', e => { if (e.key === 'Enter') navigate(); });
urlbar.addEventListener('focus', () => { urlbar.select(); });

// ─── ZOOM ────────────────────────────────────────────────────────
function setZoom(delta) {
  zoomLevel = Math.min(3.0, Math.max(0.25, zoomLevel + delta));
  if (activeTab) try { activeTab.webview.setZoomFactor(zoomLevel); } catch(e){}
  zoomIndicator.textContent = Math.round(zoomLevel * 100) + '%';
}

function resetZoom() {
  zoomLevel = 1.0;
  if (activeTab) try { activeTab.webview.setZoomFactor(1.0); } catch(e){}
  zoomIndicator.textContent = '100%';
}

// ─── DEVTOOLS ────────────────────────────────────────────────────
function openDevTools() {
  if (activeTab) {
    try { activeTab.webview.openDevTools(); } catch(e){}
  }
  try { window.browserAPI.openDevTools(); } catch(e){}
}

// ─── INCOGNITO ───────────────────────────────────────────────────
function openIncognito() {
  try { window.browserAPI.newIncognitoWindow(); } catch(e){}
}

// ─── BOOKMARKS ───────────────────────────────────────────────────
function isBookmarked(url) {
  return url && bookmarks.some(b => b.url === url);
}

function updateBookmarkBtn() {
  const btn = document.getElementById('bookmark-add-btn');
  if (!btn) return;
  btn.classList.toggle('active-bookmark', activeTab ? isBookmarked(activeTab.url) : false);
  btn.title = (activeTab && isBookmarked(activeTab.url))
    ? 'Remove bookmark (Ctrl+D)' : 'Bookmark this page (Ctrl+D)';
}

async function toggleBookmarkThis() {
  if (!activeTab) return;
  const url = activeTab.url;
  if (!url || url.startsWith('file://')) return;

  const idx = bookmarks.findIndex(b => b.url === url);
  if (idx >= 0) {
    bookmarks.splice(idx, 1);
  } else {
    bookmarks.unshift({ title: activeTab.title || url, url, time: Date.now() });
  }
  updateBookmarkBtn();
  renderBookmarksBar();
  renderBookmarks();
  if (!isIncognito) await window.browserAPI.saveBookmarks(bookmarks);
}

function renderBookmarksBar() {
  const bar = document.getElementById('bookmarks-bar');
  bar.innerHTML = '';
  bookmarks.slice(0, 14).forEach((bm, i) => {
    const chip = document.createElement('div');
    chip.className = 'bm-chip';
    chip.innerHTML =
      esc(bm.title.slice(0, 22)) +
      '<span class="bm-chip-del" data-i="' + i + '">&#10005;</span>';
    chip.addEventListener('click', e => {
      if (e.target.dataset.i !== undefined) {
        bookmarks.splice(parseInt(e.target.dataset.i), 1);
        renderBookmarksBar(); renderBookmarks();
        if (!isIncognito) window.browserAPI.saveBookmarks(bookmarks);
      } else {
        newTab(bm.url);
      }
    });
    bar.appendChild(chip);
  });
}

function renderBookmarks() {
  const list  = document.getElementById('bookmarks-list');
  if (!list) return;
  const q = (document.getElementById('bookmarks-search').value || '').toLowerCase();
  const items = bookmarks.filter(b =>
    b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q)
  );
  list.innerHTML = '';
  if (!items.length) {
    list.innerHTML = '<div style="padding:14px;font-size:12px;color:rgba(255,255,255,0.3);text-align:center">No bookmarks yet</div>';
    return;
  }
  items.forEach((bm, i) => {
    const el = document.createElement('div');
    el.className = 'list-item';
    el.innerHTML =
      '<div class="list-item-row">' +
        '<div class="list-item-title">' + esc(bm.title) + '</div>' +
        '<span class="list-item-del" data-i="' + i + '">&#10005;</span>' +
      '</div>' +
      '<div class="list-item-meta">' + esc(getHost(bm.url)) + '</div>';
    el.addEventListener('click', e => {
      if (e.target.dataset.i !== undefined) {
        bookmarks.splice(parseInt(e.target.dataset.i), 1);
        renderBookmarksBar(); renderBookmarks();
        if (!isIncognito) window.browserAPI.saveBookmarks(bookmarks);
      } else { newTab(bm.url); }
    });
    list.appendChild(el);
  });
}

// ─── HISTORY ─────────────────────────────────────────────────────
function addToHistory(title, url) {
  // Avoid duplicates in a row
  if (history[0] && history[0].url === url) return;
  history.unshift({ title: title || url, url, time: Date.now() });
  if (history.length > 500) history = history.slice(0, 500);
  if (!isIncognito) window.browserAPI.saveHistory(history).catch(() => {});
  if (activePanel === 'history') renderHistory();
}

function renderHistory() {
  const list = document.getElementById('history-list');
  if (!list) return;
  const q = (document.getElementById('history-search').value || '').toLowerCase();
  const items = history.filter(h =>
    (h.title || '').toLowerCase().includes(q) || (h.url || '').toLowerCase().includes(q)
  );
  list.innerHTML = '';
  if (!items.length) {
    list.innerHTML = '<div style="padding:14px;font-size:12px;color:rgba(255,255,255,0.3);text-align:center">No history yet</div>';
    return;
  }
  items.slice(0, 100).forEach((item, i) => {
    const el = document.createElement('div');
    el.className = 'list-item';
    el.innerHTML =
      '<div class="list-item-row">' +
        '<div class="list-item-title">' + esc(item.title) + '</div>' +
        '<span class="list-item-del" data-i="' + i + '">&#10005;</span>' +
      '</div>' +
      '<div class="list-item-meta">' + esc(getHost(item.url)) + ' &mdash; ' + timeAgo(item.time) + '</div>';
    el.addEventListener('click', e => {
      if (e.target.dataset.i !== undefined) {
        history.splice(parseInt(e.target.dataset.i), 1);
        renderHistory();
        if (!isIncognito) window.browserAPI.saveHistory(history).catch(() => {});
      } else { newTab(item.url); }
    });
    list.appendChild(el);
  });
}

function clearHistory() {
  history = [];
  if (!isIncognito) window.browserAPI.saveHistory([]).catch(() => {});
  renderHistory();
}

// ─── DOWNLOADS ───────────────────────────────────────────────────
function setupDownloadListeners() {
  window.browserAPI.onDownloadStarted(d => {
    downloads[d.id] = { ...d, progress: 0, done: false };
    renderDownloads();
    if (activePanel !== 'downloads') togglePanel('downloads');
  });
  window.browserAPI.onDownloadUpdated(d => {
    if (!downloads[d.id]) return;
    downloads[d.id].receivedBytes = d.receivedBytes;
    downloads[d.id].totalBytes    = d.totalBytes;
    downloads[d.id].progress      = d.totalBytes > 0
      ? Math.round((d.receivedBytes / d.totalBytes) * 100) : 0;
    if (activePanel === 'downloads') renderDownloads();
  });
  window.browserAPI.onDownloadDone(d => {
    if (!downloads[d.id]) return;
    downloads[d.id].done     = true;
    downloads[d.id].state    = d.state;
    downloads[d.id].progress = d.state === 'completed' ? 100 : downloads[d.id].progress;
    renderDownloads();
  });
}

function renderDownloads() {
  const list = document.getElementById('downloads-list');
  if (!list) return;
  const items = Object.values(downloads).reverse();
  list.innerHTML = '';
  if (!items.length) {
    list.innerHTML = '<div style="padding:14px;font-size:12px;color:rgba(255,255,255,0.3);text-align:center">No downloads yet</div>';
    return;
  }
  items.forEach(dl => {
    const el = document.createElement('div');
    el.className = 'dl-item';
    const pct = dl.progress || 0;
    const statusStr = dl.done
      ? (dl.state === 'completed' ? 'Complete' : 'Failed')
      : pct + '%';
    el.innerHTML =
      '<div class="dl-name">' + esc(dl.filename) + '</div>' +
      '<div class="dl-bar-wrap"><div class="dl-bar" style="width:' + pct + '%"></div></div>' +
      '<div class="dl-meta">' +
        '<span>' + statusStr + '</span>' +
        (dl.done && dl.state === 'completed'
          ? '<span class="dl-open" data-path="' + esc(dl.savePath) + '">Open file</span>'
          : '') +
      '</div>';
    const openBtn = el.querySelector('.dl-open');
    if (openBtn) {
      openBtn.addEventListener('click', e => {
        window.browserAPI.openFile(e.target.dataset.path);
      });
    }
    list.appendChild(el);
  });
}

// ─── PANELS ──────────────────────────────────────────────────────
function togglePanel(name) {
  if (activePanel === name) { closePanel(); return; }
  activePanel = name;
  sidePanel.classList.remove('closed');

  document.querySelectorAll('.pane').forEach(p => p.style.display = 'none');
  const pane = document.getElementById('pane-' + name);
  if (pane) pane.style.display = 'flex';

  panelTitle.textContent = { history:'History', bookmarks:'Bookmarks', downloads:'Downloads' }[name] || name;

  if (name === 'history')   renderHistory();
  if (name === 'bookmarks') renderBookmarks();
  if (name === 'downloads') renderDownloads();
}

function closePanel() {
  activePanel = null;
  sidePanel.classList.add('closed');
}

// ─── CONTEXT MENU ────────────────────────────────────────────────
function setupContextMenu() {
  const menu = document.getElementById('ctx-menu');

  document.addEventListener('contextmenu', e => {
    if (e.target.closest('#ctx-menu')) return;
    e.preventDefault();
    menu.style.display = 'block';
    // Position so it doesn't go off screen
    requestAnimationFrame(() => {
      const x = Math.min(e.clientX, window.innerWidth  - menu.offsetWidth  - 8);
      const y = Math.min(e.clientY, window.innerHeight - menu.offsetHeight - 8);
      menu.style.left = x + 'px';
      menu.style.top  = y + 'px';
    });
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('#ctx-menu')) menu.style.display = 'none';
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') menu.style.display = 'none';
  });
}

function ctxAction(action) {
  document.getElementById('ctx-menu').style.display = 'none';
  const map = {
    back:      navBack,
    forward:   navForward,
    reload:    navReload,
    bookmark:  toggleBookmarkThis,
    devtools:  openDevTools,
    newtab:    () => newTab(),
    incognito: openIncognito,
    zoomin:    () => setZoom(0.1),
    zoomout:   () => setZoom(-0.1),
    zoomreset: resetZoom,
  };
  if (map[action]) map[action]();
}

// ─── KEYBOARD SHORTCUTS ──────────────────────────────────────────
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', e => {
    const ctrl = e.ctrlKey || e.metaKey;

    if (ctrl && e.key === 't')              { e.preventDefault(); newTab(); }
    if (ctrl && e.key === 'w')              { e.preventDefault(); if (activeTab) closeTab(activeTab.id); }
    if (ctrl && e.key === 'r' || e.key === 'F5') { e.preventDefault(); navReload(); }
    if (ctrl && e.key === 'l')              { e.preventDefault(); urlbar.select(); urlbar.focus(); }
    if (ctrl && e.key === 'd')              { e.preventDefault(); toggleBookmarkThis(); }
    if (ctrl && e.key === 'h')              { e.preventDefault(); togglePanel('history'); }
    if (ctrl && e.key === 'j')              { e.preventDefault(); togglePanel('downloads'); }
    if (ctrl && e.key === 'b')              { e.preventDefault(); togglePanel('bookmarks'); }
    if (ctrl && (e.key === '+' || e.key === '=')) { e.preventDefault(); setZoom(0.1); }
    if (ctrl && e.key === '-')              { e.preventDefault(); setZoom(-0.1); }
    if (ctrl && e.key === '0')              { e.preventDefault(); resetZoom(); }
    if (ctrl && e.shiftKey && e.key === 'N') { e.preventDefault(); openIncognito(); }
    if (e.key === 'F12')                    { openDevTools(); }
    if (e.altKey && e.key === 'ArrowLeft')  { e.preventDefault(); navBack(); }
    if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); navForward(); }
    if (e.key === 'Escape')                 { closePanel(); }

    // Ctrl+1..9 — jump to tab
    if (ctrl && e.key >= '1' && e.key <= '9') {
      e.preventDefault();
      const t = tabs[parseInt(e.key) - 1];
      if (t) switchTab(t.id);
    }

    // Ctrl+Tab / Ctrl+Shift+Tab
    if (ctrl && e.key === 'Tab' && tabs.length > 1) {
      e.preventDefault();
      const idx = tabs.findIndex(t => t.id === activeTab?.id);
      const next = e.shiftKey
        ? (idx - 1 + tabs.length) % tabs.length
        : (idx + 1) % tabs.length;
      switchTab(tabs[next].id);
    }
  });
}

// ─── UTILS ───────────────────────────────────────────────────────
function getHost(url) {
  try { return new URL(url).hostname; } catch { return url || ''; }
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)    return 'just now';
  if (s < 3600)  return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + ' hr ago';
  return Math.floor(s / 86400) + ' days ago';
}

function esc(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── START ───────────────────────────────────────────────────────
init();