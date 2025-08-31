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
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Choose Target Folder'
    });
    
    if (result.canceled || !result.filePaths?.[0]) {
      return null;
    }
    return result.filePaths[0];
  } catch (error) {
    console.error('Error choosing folder:', error);
    return null;
  }
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
  const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.tiff', '.tif', '.bmp', '.gif']);
  const VIDEO_EXT = new Set(['.mp4', '.mov', '.m4v', '.mkv', '.webm', '.avi']);
  
  const files = fs.readdirSync(folder);
  // macOS 숨김 파일 및 시스템 파일 필터링
  const images = files.filter(f => {
    if (f.startsWith('._') || f.startsWith('.DS_Store') || f.startsWith('.')) return false;
    return IMAGE_EXT.has(path.extname(f).toLowerCase());
  }).map(f => path.join(folder, f));
  
  const videos = files.filter(f => {
    if (f.startsWith('._') || f.startsWith('.DS_Store') || f.startsWith('.')) return false;
    return VIDEO_EXT.has(path.extname(f).toLowerCase());
  }).map(f => path.join(folder, f));
  
  return { images, videos };
});

ipcMain.handle('preview-image', async (_evt, payload) => {
  const { filePath, options } = payload;
  const ext = path.extname(filePath).toLowerCase();
  const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.tiff', '.tif', '.bmp', '.gif']);
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
  const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.tiff', '.tif', '.bmp', '.gif']);
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

// IPC: 파일 존재 확인
ipcMain.handle('check-file-exists', async (_evt, filePath) => {
  try {
    return fs.existsSync(filePath);
  } catch (error) {
    console.error('Error checking file existence:', error);
    return false;
  }
});

// IPC: 파일을 Buffer로 읽기
ipcMain.handle('read-file-as-buffer', async (_evt, filePath) => {
  try {
    const buffer = fs.readFileSync(filePath);
    return buffer;
  } catch (error) {
    console.error('Error reading file as buffer:', error);
    throw error;
  }
});

// IPC: 파일 경로 얻기 (웹킷 보안 제한 우회)
ipcMain.handle('get-file-path', async (_evt, file) => {
  try {
    // Electron에서는 File 객체의 path 속성을 통해 실제 파일 경로를 얻을 수 있음
    if (file && typeof file.path === 'string') {
      return file.path;
    } else {
      // path 속성이 없는 경우 (일부 브라우저 호환성 문제)
      // 임시로 복사 후 경로 반환 (더 안전한 방법)
      const tempDir = require('os').tmpdir();
      const safeExt = file && typeof file.name === 'string' ? require('path').extname(file.name) : '';
      const tempFileName = `temp_logo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}${safeExt}`;
      const tempPath = require('path').join(tempDir, tempFileName);

      // 파일을 임시 경로로 복사
      if (file && typeof file.arrayBuffer === 'function') {
        const buffer = Buffer.from(await file.arrayBuffer());
        fs.writeFileSync(tempPath, buffer);
      } else {
        throw new Error('Invalid file object: missing arrayBuffer');
      }

      return tempPath;
    }
  } catch (error) {
    console.error('Error getting file path:', error);
    throw error;
  }
});
