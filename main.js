// main.js
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { processFolderImages, generatePreviewBuffer, processFolderVideos, extractVideoFrame, getVideoWatermarkPosition } = require('./src/watermark');
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
    title: 'Watermark'
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

// IPC: process videos
ipcMain.handle('process-videos', async (_evt, payload) => {
  const { folder, options } = payload;
  if (!folder || !fs.existsSync(folder)) {
    throw new Error('Folder not found.');
  }

  const onProgress = (data) => {
    mainWindow?.webContents.send('progress', data);
  };

  const outDir = path.join(folder, 'output');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  const summary = await processFolderVideos(folder, outDir, options, onProgress);
  return summary; // { total, succeeded, failed }
});


ipcMain.handle('list-images', async (_evt, folder) => {
  const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
  const VIDEO_EXT = new Set(['.mp4', '.mov', '.m4v', '.mkv', '.webm', '.avi']);
  
  const files = fs.readdirSync(folder);
  const images = files.filter(f => IMAGE_EXT.has(path.extname(f).toLowerCase())).map(f => path.join(folder, f));
  const videos = files.filter(f => VIDEO_EXT.has(path.extname(f).toLowerCase())).map(f => path.join(folder, f));
  
  return { images, videos };
});

ipcMain.handle('preview-image', async (_evt, payload) => {
  const { filePath, options } = payload;
  const ext = path.extname(filePath).toLowerCase();
  const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
  const VIDEO_EXT = new Set(['.mp4', '.mov', '.m4v', '.mkv', '.webm', '.avi']);
  
  let buf;
  if (IMAGE_EXT.has(ext)) {
    buf = await generatePreviewBuffer(filePath, options, 800);
  } else if (VIDEO_EXT.has(ext)) {
    buf = await extractVideoFrame(filePath, options, 800);
  } else {
    throw new Error('Unsupported file type');
  }
  
  const base64 = buf.toString('base64');
  return `data:image/png;base64,${base64}`;
});

ipcMain.handle('get-watermark-position', async (_evt, payload) => {
  const { filePath, options } = payload;
  const ext = path.extname(filePath).toLowerCase();
  const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
  const VIDEO_EXT = new Set(['.mp4', '.mov', '.m4v', '.mkv', '.webm', '.avi']);
  if (IMAGE_EXT.has(ext)) {
    const { getWatermarkPosition } = require('./src/watermark');
    return await getWatermarkPosition(filePath, options, 800);
  } else if (VIDEO_EXT.has(ext)) {
    return await getVideoWatermarkPosition(filePath, options, 800);
  }
  throw new Error('Unsupported file type');
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
