const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('browserAPI', {});