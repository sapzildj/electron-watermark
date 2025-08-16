// main.js
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { processFolderImages, generatePreviewBuffer } = require('./src/watermark');
const fontList = require('font-list');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'Watermark (Ollama-enabled)'
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC: choose folder
ipcMain.handle('choose-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (result.canceled || !result.filePaths?.[0]) return null;
  return result.filePaths[0];
});

// IPC: process images
ipcMain.handle('process-images', async (_evt, payload) => {
  const { folder, options } = payload;
  if (!folder || !fs.existsSync(folder)) {
    throw new Error('Folder not found.');
  }

  const onProgress = (data) => {
    mainWindow?.webContents.send('progress', data);
  };

  const outDir = path.join(folder, 'output');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  const summary = await processFolderImages(folder, outDir, options, onProgress);
  return summary; // { total, succeeded, failed }
});


ipcMain.handle('list-images', async (_evt, folder) => {
  const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
  const files = fs.readdirSync(folder)
    .filter(f => IMAGE_EXT.has(path.extname(f).toLowerCase()))
    .map(f => path.join(folder, f));
  return files;
});

ipcMain.handle('preview-image', async (_evt, payload) => {
  const { filePath, options } = payload;
  const buf = await generatePreviewBuffer(filePath, options, 800); // 프리뷰 가로 800px
  const base64 = buf.toString('base64');
  return `data:image/png;base64,${base64}`;
});

// IPC: system font list
ipcMain.handle('list-system-fonts', async () => {
  try {
    const fonts = await fontList.getFonts();
    return fonts; // array of font family names
  } catch (e) {
    return [];
  }
});
