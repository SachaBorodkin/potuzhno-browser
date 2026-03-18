const { app, BrowserWindow, session, ipcMain, shell } = require('electron');
const path = require('path');
const fs   = require('fs');

const DOWNLOADS_PATH = path.join(app.getPath('downloads'), 'Potuzhno');
if (!fs.existsSync(DOWNLOADS_PATH)) fs.mkdirSync(DOWNLOADS_PATH, { recursive: true });

function createWindow(incognito = false) {
  const ses = incognito
    ? session.fromPartition('incognito-' + Date.now(), { cache: false })
    : session.defaultSession;

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    frame: true,                   // ← use native frame so window works properly
    titleBarStyle: 'hidden',       // ← hides native title but keeps drag + controls on Mac
    backgroundColor: '#0a2864',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
      contextIsolation: true,
      webSecurity: false,
      session: ses
    }
  });

  win.loadFile('index.html', {
    query: { incognito: incognito ? '1' : '0' }
  });

  // Downloads
  ses.on('will-download', (event, item) => {
    const savePath = path.join(DOWNLOADS_PATH, item.getFilename());
    item.setSavePath(savePath);
    const id = Date.now();
    win.webContents.send('download-started', {
      id, filename: item.getFilename(), savePath,
      totalBytes: item.getTotalBytes()
    });
    item.on('updated', (e, state) => {
      win.webContents.send('download-updated', {
        id, state,
        receivedBytes: item.getReceivedBytes(),
        totalBytes: item.getTotalBytes()
      });
    });
    item.once('done', (e, state) => {
      win.webContents.send('download-done', { id, state, savePath });
    });
  });

  return win;
}

app.whenReady().then(() => createWindow());
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// IPC
ipcMain.on('new-incognito-window', () => createWindow(true));
ipcMain.on('open-devtools', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win) win.webContents.openDevTools({ mode: 'detach' });
});
ipcMain.on('open-file',              (e, p) => shell.openPath(p));
ipcMain.on('show-downloads-folder',  ()     => shell.openPath(DOWNLOADS_PATH));
ipcMain.handle('get-downloads-path', ()     => DOWNLOADS_PATH);

// Bookmarks
const bookmarksFile = path.join(app.getPath('userData'), 'bookmarks.json');
ipcMain.handle('load-bookmarks', () => {
  try { return JSON.parse(fs.readFileSync(bookmarksFile, 'utf8')); } catch { return []; }
});
ipcMain.handle('save-bookmarks', (e, data) => {
  fs.writeFileSync(bookmarksFile, JSON.stringify(data)); return true;
});

// History
const historyFile = path.join(app.getPath('userData'), 'history.json');
ipcMain.handle('load-history', () => {
  try { return JSON.parse(fs.readFileSync(historyFile, 'utf8')); } catch { return []; }
});
ipcMain.handle('save-history', (e, data) => {
  fs.writeFileSync(historyFile, JSON.stringify(data)); return true;
});