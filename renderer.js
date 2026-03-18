const webviewsEl   = document.getElementById('webviews');
const tabsEl       = document.getElementById('tabs-container');
const urlbar       = document.getElementById('urlbar');
const statusText   = document.getElementById('status-text');
const historyPanel = document.getElementById('history-panel');
const historyList  = document.getElementById('history-list');

let tabs      = [];
let activeTab = null;
let history   = [];

try { history = JSON.parse(localStorage.getItem('pb-history') || '[]'); } catch(e) { history = []; }

// ─── TABS ─────────────────────────────────────────────────────────

function newTab(url) {
  const defaultUrl = `file://${window.location.pathname.replace('index.html','').replace(/\\/g,'/')}newtab.html`;
  const src = url || defaultUrl;
  const id  = Date.now();

  const webview = document.createElement('webview');
  webview.src = src;
  webview.setAttribute('allowpopups', '');
  webviewsEl.appendChild(webview);

  const tab = { id, url: src, title: 'New Tab', webview };
  tabs.push(tab);

  webview.addEventListener('did-navigate', e => {
    tab.url = e.url;
    if (activeTab && activeTab.id === id) urlbar.value = e.url;
    addToHistory(tab.title, e.url);
    renderTabs();
  });

  webview.addEventListener('did-navigate-in-page', e => {
    tab.url = e.url;
    if (activeTab && activeTab.id === id) urlbar.value = e.url;
  });

  webview.addEventListener('page-title-updated', e => {
    tab.title = e.title || 'New Tab';
    renderTabs();
  });

  webview.addEventListener('did-start-loading', () => {
    if (activeTab && activeTab.id === id) statusText.textContent = 'Loading...';
  });

  webview.addEventListener('did-stop-loading', () => {
    if (activeTab && activeTab.id === id) statusText.textContent = 'Ready';
  });

  webview.addEventListener('did-fail-load', (e) => {
    if (e.errorCode === -3) return; // aborted, ignore
    if (activeTab && activeTab.id === id) statusText.textContent = 'Failed to load';
  });

  switchTab(id);
  renderTabs();
}

function switchTab(id) {
  // hide all webviews
  tabs.forEach(t => {
    t.webview.classList.remove('active');
  });

  activeTab = tabs.find(t => t.id === id) || null;
  if (!activeTab) return;

  activeTab.webview.classList.add('active');
  urlbar.value = activeTab.url || '';
  renderTabs();
}

function closeTab(id) {
  const idx = tabs.findIndex(t => t.id === id);
  if (idx === -1) return;
  tabs[idx].webview.remove();
  tabs.splice(idx, 1);

  if (tabs.length === 0) {
    newTab();
    return;
  }

  if (activeTab && activeTab.id === id) {
    switchTab(tabs[Math.max(0, idx - 1)].id);
  }

  renderTabs();
}

function renderTabs() {
  tabsEl.innerHTML = '';
  tabs.forEach(tab => {
    const el = document.createElement('div');
    el.className = 'tab' + (activeTab && tab.id === activeTab.id ? ' active' : '');

    el.innerHTML =
      '<div class="tab-favicon"></div>' +
      '<span class="tab-title">' + escHtml(tab.title) + '</span>' +
      '<span class="tab-close" data-id="' + tab.id + '">&#10005;</span>';

    el.addEventListener('click', function(e) {
      const closeBtn = e.target.closest('.tab-close');
      if (closeBtn) {
        closeTab(parseInt(closeBtn.dataset.id));
      } else {
        switchTab(tab.id);
      }
    });

    tabsEl.appendChild(el);
  });
}

// ─── NAVIGATION ──────────────────────────────────────────────────

function navigate() {
  let val = urlbar.value.trim();
  if (!val) return;

  let url;
  if (val.startsWith('http://') || val.startsWith('https://') || val.startsWith('file://')) {
    url = val;
  } else if (val.includes('.') && !val.includes(' ')) {
    url = 'https://' + val;
  } else {
    url = 'https://www.google.com/search?q=' + encodeURIComponent(val);
  }

  if (activeTab) {
    activeTab.url = url;
    activeTab.webview.src = url;
  }
}

urlbar.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') navigate();
});

document.getElementById('back').addEventListener('click', function() {
  if (activeTab) try { activeTab.webview.goBack(); } catch(e){}
});

document.getElementById('forward').addEventListener('click', function() {
  if (activeTab) try { activeTab.webview.goForward(); } catch(e){}
});

document.getElementById('reload').addEventListener('click', function() {
  if (activeTab) try { activeTab.webview.reload(); } catch(e){}
});

// ─── HISTORY ─────────────────────────────────────────────────────

function addToHistory(title, url) {
  if (!url || url.startsWith('file://')) return;
  history.unshift({ title: title || url, url, time: Date.now() });
  if (history.length > 200) history = history.slice(0, 200);
  try { localStorage.setItem('pb-history', JSON.stringify(history)); } catch(e){}
  renderHistory();
}

function renderHistory() {
  historyList.innerHTML = '';
  if (history.length === 0) {
    historyList.innerHTML = '<div style="padding:16px;font-size:12px;color:rgba(255,255,255,0.3);text-align:center;">No history yet</div>';
    return;
  }
  history.slice(0, 80).forEach(function(item) {
    const el = document.createElement('div');
    el.className = 'history-item';

    let host = '';
    try { host = new URL(item.url).hostname; } catch(e) { host = item.url; }

    el.innerHTML =
      '<div class="history-title">' + escHtml(item.title || item.url) + '</div>' +
      '<div class="history-meta">' + escHtml(host) + ' &mdash; ' + timeAgo(item.time) + '</div>';

    el.addEventListener('click', function() {
      if (activeTab) {
        activeTab.url = item.url;
        activeTab.webview.src = item.url;
        urlbar.value = item.url;
      }
    });

    historyList.appendChild(el);
  });
}

function clearHistory() {
  history = [];
  try { localStorage.setItem('pb-history', '[]'); } catch(e){}
  renderHistory();
}

function toggleHistory() {
  historyPanel.classList.toggle('closed');
  if (!historyPanel.classList.contains('closed')) renderHistory();
}

// ─── UTILS ───────────────────────────────────────────────────────

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)    return 'just now';
  if (s < 3600)  return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + ' hr ago';
  return Math.floor(s / 86400) + ' days ago';
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

// ─── INIT ─────────────────────────────────────────────────────────
newTab();