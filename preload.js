// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // 기존 기능
  chooseFolder: () => ipcRenderer.invoke('choose-folder'),
  processImages: (payload) => ipcRenderer.invoke('process-images', payload),
  onProgress: (cb) => {
    ipcRenderer.removeAllListeners('progress');
    ipcRenderer.on('progress', (_e, d) => cb(d));
  },

  // 미리보기용 추가 기능
  listImages: (folder) => ipcRenderer.invoke('list-images', folder),
  previewImage: (payload) => ipcRenderer.invoke('preview-image', payload),
});
