// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // 기존 기능
  chooseFolder: () => ipcRenderer.invoke('choose-folder'),
  processImages: (payload) => ipcRenderer.invoke('process-images', payload),
  processVideos: (payload) => ipcRenderer.invoke('process-videos', payload),
  onProgress: (cb) => {
    ipcRenderer.removeAllListeners('progress');
    ipcRenderer.on('progress', (_e, d) => cb(d));
  },

  // 미리보기용 추가 기능
  listImages: (folder) => ipcRenderer.invoke('list-images', folder),
  previewImage: (payload) => ipcRenderer.invoke('preview-image', payload),
  getWatermarkPosition: (payload) => ipcRenderer.invoke('get-watermark-position', payload),
  listSystemFonts: () => ipcRenderer.invoke('list-system-fonts'),
  // 파일 시스템 보조 (로고 경로 영구 저장 지원)
  checkFileExists: (filePath) => ipcRenderer.invoke('check-file-exists', filePath),
  readFileAsBuffer: (filePath) => ipcRenderer.invoke('read-file-as-buffer', filePath),
  getFilePath: (file) => ipcRenderer.invoke('get-file-path', file),
  saveLogoBytes: (payload) => ipcRenderer.invoke('save-logo-bytes', payload),
});
