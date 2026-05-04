const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("browserAPI", {
  newIncognitoWindow: () => ipcRenderer.send("new-incognito-window"),
  openDevTools: () => ipcRenderer.send("open-devtools"),
  openFile: (p) => ipcRenderer.send("open-file", p),
  showDownloadsFolder: () => ipcRenderer.send("show-downloads-folder"),
  getDownloadsPath: () => ipcRenderer.invoke("get-downloads-path"),
  loadBookmarks: () => ipcRenderer.invoke("load-bookmarks"),
  saveBookmarks: (data) => ipcRenderer.invoke("save-bookmarks", data),
  loadHistory: () => ipcRenderer.invoke("load-history"),
  saveHistory: (data) => ipcRenderer.invoke("save-history", data),
  onDownloadStarted: (cb) =>
    ipcRenderer.on("download-started", (_, d) => cb(d)),
  onDownloadUpdated: (cb) =>
    ipcRenderer.on("download-updated", (_, d) => cb(d)),
  onDownloadDone: (cb) => ipcRenderer.on("download-done", (_, d) => cb(d)),
  windowMinimize: () => ipcRenderer.send("window-minimize"),
  windowMaximize: () => ipcRenderer.send("window-maximize"),
  windowClose: () => ipcRenderer.send("window-close"),
});
