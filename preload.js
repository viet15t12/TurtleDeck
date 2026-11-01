const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('studyApp', {
  platform: process.platform,
});
