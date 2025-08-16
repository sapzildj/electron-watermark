// src/renderer.js

// ===== DOM =====
const btnChoose = document.getElementById('btnChoose');
const folderPathEl = document.getElementById('folderPath');
const btnRun = document.getElementById('btnRun');
const btnPreview = document.getElementById('btnPreview'); // 있을 경우 동작, 없으면 무시
const statusEl = document.getElementById('status');
const bar = document.getElementById('bar');
const logEl = document.getElementById('log');
const previewGrid = document.getElementById('previewGrid'); // 있을 경우 동작, 없으면 무시

const wmText = document.getElementById('wmText');
const fontSize = document.getElementById('fontSize');
const textColor = document.getElementById('textColor');
const fontFamily = document.getElementById('fontFamily');
const fontFamilySelect = document.getElementById('fontFamilySelect');
const fontPreview = document.getElementById('fontPreview');
const opacity = document.getElementById('opacity');
const position = document.getElementById('position');
const margin = document.getElementById('margin');
const maxWidth = document.getElementById('maxWidth');
const shadowColor = document.getElementById('shadowColor');
const shadowOffsetX = document.getElementById('shadowOffsetX');
const shadowOffsetY = document.getElementById('shadowOffsetY');
const shadowBlur = document.getElementById('shadowBlur');
const outlineColor = document.getElementById('outlineColor');
const outlineWidth = document.getElementById('outlineWidth');
const logo = document.getElementById('logo');

// Custom position elements
const customPositionRow = document.getElementById('customPositionRow');
const customX = document.getElementById('customX');
const customY = document.getElementById('customY');

// ===== Persistence Keys =====
const STORAGE_KEY = 'wmOptions.v1';
const FOLDER_KEY = 'wmLastFolder.v1';

let chosenFolder = null;

// ===== Persistence helpers =====
function getCurrentOptionsSnapshot() {
  return {
    text: (wmText.value || '').trim(),
    fontSize: Number(fontSize.value) || 36,
    textColor: (textColor?.value || '#ffffff'),
    fontFamily: (fontFamily?.value || "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"),
    opacity: Math.max(0, Math.min(1, Number(opacity.value) || 0.35)),
    position: position.value,
    margin: Number(margin.value) || 24,
    maxWidth: Number(maxWidth.value) || 0,
    shadowColor: (shadowColor?.value || '#000000'),
    shadowOffsetX: (Number.isFinite(Number(shadowOffsetX?.value)) ? Number(shadowOffsetX?.value) : 2),
    shadowOffsetY: (Number.isFinite(Number(shadowOffsetY?.value)) ? Number(shadowOffsetY?.value) : 2),
    shadowBlur: (Number.isFinite(Number(shadowBlur?.value)) ? Number(shadowBlur?.value) : 0),
    outlineColor: (outlineColor?.value || '#000000'),
    outlineWidth: (Number.isFinite(Number(outlineWidth?.value)) ? Number(outlineWidth?.value) : 0),
    customX: (Number.isFinite(Number(customX?.value)) ? Number(customX?.value) : 0),
    customY: (Number.isFinite(Number(customY?.value)) ? Number(customY?.value) : 0),
    // logo 파일은 보안상 경로/값 저장 X (브라우저가 file input 복원을 금지)
  };
}

function applyOptionsToUI(opts) {
  if (!opts) return;
  if (typeof opts.text === 'string') wmText.value = opts.text;
  if (Number.isFinite(opts.fontSize)) fontSize.value = String(opts.fontSize);
  if (typeof opts.textColor === 'string' && textColor) textColor.value = opts.textColor;
  if (typeof opts.fontFamily === 'string' && fontFamily) fontFamily.value = opts.fontFamily;
  if (Number.isFinite(opts.opacity)) opacity.value = String(opts.opacity);
  if (typeof opts.position === 'string') position.value = opts.position;
  if (Number.isFinite(opts.margin)) margin.value = String(opts.margin);
  if (Number.isFinite(opts.maxWidth)) maxWidth.value = String(opts.maxWidth);
  if (typeof opts.shadowColor === 'string' && shadowColor) shadowColor.value = opts.shadowColor;
  if (Number.isFinite(opts.shadowOffsetX) && shadowOffsetX) shadowOffsetX.value = String(opts.shadowOffsetX);
  if (Number.isFinite(opts.shadowOffsetY) && shadowOffsetY) shadowOffsetY.value = String(opts.shadowOffsetY);
  if (Number.isFinite(opts.shadowBlur) && shadowBlur) shadowBlur.value = String(opts.shadowBlur);
  if (typeof opts.outlineColor === 'string' && outlineColor) outlineColor.value = opts.outlineColor;
  if (Number.isFinite(opts.outlineWidth) && outlineWidth) outlineWidth.value = String(opts.outlineWidth);
  if (Number.isFinite(opts.customX) && customX) customX.value = String(opts.customX);
  if (Number.isFinite(opts.customY) && customY) customY.value = String(opts.customY);
}

function saveOptions() {
  try {
    const snap = getCurrentOptionsSnapshot();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
  } catch (e) {
    console.error('saveOptions error:', e);
  }
}

function loadOptions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    applyOptionsToUI(parsed);
    return parsed;
  } catch (e) {
    console.error('loadOptions error:', e);
    return null;
  }
}

function saveLastFolder(pathStr) {
  try {
    localStorage.setItem(FOLDER_KEY, pathStr || '');
  } catch (e) {
    console.error('saveLastFolder error:', e);
  }
}

function loadLastFolder() {
  try {
    const v = localStorage.getItem(FOLDER_KEY);
    return v || null;
  } catch (e) {
    console.error('loadLastFolder error:', e);
    return null;
  }
}

// ===== IPC Progress =====
window.api.onProgress((data) => {
  const { current, total, file, ok, message } = data;
  if (total > 0) bar.style.width = `${Math.floor((current / total) * 100)}%`;
  const line = `${ok ? '✅' : '❌'} [${current}/${total}] ${file}${message ? ' — ' + message : ''}`;
  logEl.textContent += line + '\n';
  logEl.scrollTop = logEl.scrollHeight;
});

// ===== Folder choose =====
btnChoose.addEventListener('click', async () => {
  const folder = await window.api.chooseFolder();
  if (folder) {
    chosenFolder = folder;
    folderPathEl.textContent = folder;
    saveLastFolder(folder);
  }
});

// ===== Build options for IPC (includes reading logo bytes) =====
async function buildOptionsForIPC() {
  // 저장도 같이
  saveOptions();

  let logoBytes = null;
  if (logo.files && logo.files[0]) {
    const buf = await logo.files[0].arrayBuffer();
    logoBytes = new Uint8Array(buf); // structured clone OK
  }
  const snap = getCurrentOptionsSnapshot();
  
  // 개별 이미지 위치 정보 포함
  const imagePositionsArray = Array.from(imagePositions.entries()).map(([filePath, posData]) => {
    console.log('Sending position for:', filePath, '→', posData);
    return {
      filePath,
      position: posData
    };
  });
  
  console.log('Total image positions:', imagePositionsArray.length);
  return { ...snap, logoBytes, imagePositions: imagePositionsArray };
}

// ===== Run =====
btnRun.addEventListener('click', async () => {
  if (!chosenFolder) {
    statusEl.textContent = 'Choose a target folder first.';
    return;
  }

  statusEl.textContent = 'Processing…';
  logEl.textContent = '';
  bar.style.width = '0%';

  try {
    const options = await buildOptionsForIPC(); // saveOptions 포함
    const summary = await window.api.processImages({ folder: chosenFolder, options });
    statusEl.textContent = `Done. ${summary.succeeded}/${summary.total} succeeded, ${summary.failed} failed.`;
  } catch (e) {
    statusEl.textContent = 'Error: ' + e.message;
  }
});

// ===== Preview (optional UI present) =====
async function readOptionsForPreview(filePath = null) {
  // 프리뷰에서도 저장
  saveOptions();

  let logoBytes = null;
  if (logo.files && logo.files[0]) {
    const buf = await logo.files[0].arrayBuffer();
    logoBytes = new Uint8Array(buf);
  }
  const snap = getCurrentOptionsSnapshot();
  
  // 특정 파일의 개별 위치 설정이 있으면 적용
  if (filePath && imagePositions.has(filePath)) {
    const imagePosition = imagePositions.get(filePath);
    if (imagePosition.type === 'custom') {
      snap.position = 'custom';
      snap.customX = imagePosition.x;
      snap.customY = imagePosition.y;
    } else {
      snap.position = imagePosition.type;
    }
  }
  
  return { ...snap, logoBytes, maxWidth: 0 }; // 프리뷰는 내부에서 축소 렌더
}

// 각 이미지의 개별 위치 설정을 저장
let imagePositions = new Map();

function renderInteractivePreviews(dataUrls, filePaths, originalImages) {
  if (!previewGrid) return;
  previewGrid.innerHTML = '';
  
  dataUrls.forEach((url, i) => {
    const filePath = filePaths[i];
    const fileName = filePath.split('/').pop();
    
    // Initialize position for this image if not exists
    if (!imagePositions.has(filePath)) {
      const initialPosition = {
        type: position.value || 'southeast',
        x: Number(customX?.value) || 0,
        y: Number(customY?.value) || 0
      };
      
      // Auto나 기본 위치인 경우 비율로 설정
      if (initialPosition.type !== 'custom') {
        switch (initialPosition.type) {
          case 'southeast':
            initialPosition.ratioX = 0.8;
            initialPosition.ratioY = 0.9;
            break;
          case 'southwest':
            initialPosition.ratioX = 0.05;
            initialPosition.ratioY = 0.9;
            break;
          case 'northeast':
            initialPosition.ratioX = 0.8;
            initialPosition.ratioY = 0.05;
            break;
          case 'northwest':
            initialPosition.ratioX = 0.05;
            initialPosition.ratioY = 0.05;
            break;
          case 'center':
            initialPosition.ratioX = 0.5;
            initialPosition.ratioY = 0.5;
            break;
          default:
            initialPosition.ratioX = 0.8;
            initialPosition.ratioY = 0.9;
        }
      }
      
      imagePositions.set(filePath, initialPosition);
    }

    const card = document.createElement('div');
    card.className = 'preview-card';
    card.dataset.filePath = filePath;

    const cap = document.createElement('div');
    cap.className = 'filename';
    cap.textContent = fileName;

    const imageContainer = document.createElement('div');
    imageContainer.style.position = 'relative';

    const img = document.createElement('img');
    img.src = url;
    img.addEventListener('click', () => {
      const lb = document.getElementById('lightbox');
      const lbImg = document.getElementById('lightboxImg');
      if (!lb || !lbImg) return;
      lbImg.src = url;
      lb.style.display = 'flex';
    });

    // 워터마크 오버레이 생성
    const overlay = document.createElement('div');
    overlay.className = 'watermark-overlay';
    overlay.dataset.imageIndex = i;
    
    // 컨트롤 패널
    const controls = document.createElement('div');
    controls.className = 'preview-controls';
    const posIndicator = document.createElement('span');
    posIndicator.className = 'position-indicator';
    posIndicator.textContent = `Position: ${imagePositions.get(filePath).type}`;
    controls.appendChild(posIndicator);

    imageContainer.appendChild(img);
    imageContainer.appendChild(overlay);
    
    card.appendChild(cap);
    card.appendChild(imageContainer);
    card.appendChild(controls);
    previewGrid.appendChild(card);

    // 이미지 로드 후 워터마크 위치 설정
    img.onload = async () => {
      await setupWatermarkOverlay(overlay, img, filePath, i);
      await updateOverlayPosition(overlay, img, filePath);
    };
  });
}

// 실제 워터마크 크기를 정확히 계산하는 함수
async function calculateActualWatermarkSize(img, filePath) {
  try {
    const opts = await readOptionsForPreview(filePath);
    
    // 실제 이미지 크기 기준으로 계산
    const originalImg = new Image();
    return new Promise((resolve) => {
      originalImg.onload = () => {
        const imgRect = img.getBoundingClientRect();
        const previewScale = imgRect.width / originalImg.width;
        
        // 백엔드와 동일한 폰트 스케일링 로직 적용
        const baseW = originalImg.width;
        const basePreviewW = 800; // 백엔드에서 사용하는 기본 미리보기 폭
        const fontScale = baseW / basePreviewW;
        
        const baseFontSize = opts.fontSize || 36;
        const scaledFontSize = baseFontSize * fontScale;
        
        // 스케일링된 폰트로 텍스트 크기 측정
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const text = opts.text || '';
        
        ctx.font = `${scaledFontSize}px ${opts.fontFamily || 'Arial'}`;
        const textMetrics = ctx.measureText(text);
        
        // 미리보기 크기로 변환
        const actualWidth = textMetrics.width * previewScale;
        const actualHeight = scaledFontSize * previewScale * 1.2;
        
        console.log(`Font scaling: ${baseFontSize} → ${Math.round(scaledFontSize)} (scale: ${fontScale.toFixed(3)})`);
        console.log(`Text width: ${Math.round(textMetrics.width)} → ${Math.round(actualWidth)} (preview scale: ${previewScale.toFixed(3)})`);
        
        resolve({ width: actualWidth, height: actualHeight, scale: previewScale });
      };
      originalImg.src = img.src;
    });
  } catch (e) {
    // 폴백: 기본 로직으로 크기 계산
    const fontSize = Number(document.getElementById('fontSize')?.value || 36);
    const text = document.getElementById('wmText')?.value || '';
    const fontFamily = document.getElementById('fontFamily')?.value || 'Arial';
    const imgRect = img.getBoundingClientRect();
    
    // 기본 이미지 크기를 추정 (예: 800px 기준)
    const estimatedOriginalWidth = 800;
    const fontScale = estimatedOriginalWidth / 800; // 1.0
    const scaledFontSize = fontSize * fontScale;
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = `${scaledFontSize}px ${fontFamily}`;
    const textMetrics = ctx.measureText(text);
    
    return {
      width: textMetrics.width,
      height: scaledFontSize * 1.2,
      scale: 1
    };
  }
}

async function setupWatermarkOverlay(overlay, img, filePath, imageIndex) {
  const imgRect = img.getBoundingClientRect();
  
  // 실제 워터마크 크기 계산
  const watermarkSize = await calculateActualWatermarkSize(img, filePath);
  let overlayWidth = watermarkSize.width;
  let overlayHeight = watermarkSize.height;
  
  overlay.style.width = overlayWidth + 'px';
  overlay.style.height = overlayHeight + 'px';
  
  // 초기 크기를 오버레이에 저장해서 나중에 참조할 수 있도록 함
  overlay.dataset.initialWidth = overlayWidth;
  overlay.dataset.initialHeight = overlayHeight;

  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let lastUpdateTime = 0;

  overlay.addEventListener('mousedown', (e) => {
    isDragging = true;
    overlay.classList.add('dragging');
    const overlayRect = overlay.getBoundingClientRect();
    startX = e.clientX - overlayRect.left;
    startY = e.clientY - overlayRect.top;
    e.preventDefault();
    e.stopPropagation();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    
    const imgRect = img.getBoundingClientRect();
    const x = e.clientX - imgRect.left - startX;
    const y = e.clientY - imgRect.top - startY;
    
    // 현재 오버레이의 실제 크기 사용 (동적으로 변할 수 있음)
    const currentWidth = overlay.offsetWidth;
    const currentHeight = overlay.offsetHeight;
    
    const clampedX = Math.max(0, Math.min(x, imgRect.width - currentWidth));
    const clampedY = Math.max(0, Math.min(y, imgRect.height - currentHeight));
    
    // 즉시 오버레이 위치 업데이트 (부드러운 드래그)
    overlay.style.left = clampedX + 'px';
    overlay.style.top = clampedY + 'px';
    
    // 좌표 계산은 throttle 적용 (60fps = 16ms)
    const now = Date.now();
    if (now - lastUpdateTime > 16) {
      lastUpdateTime = now;
      
      // 실제 이미지 좌표로 변환하여 저장
      const originalImg = new Image();
      originalImg.onload = () => {
        const scaleX = originalImg.width / imgRect.width;
        const scaleY = originalImg.height / imgRect.height;
        const realX = Math.round(clampedX * scaleX);
        const realY = Math.round(clampedY * scaleY);
        
        // 좌표를 비율로도 저장 (더 안정적인 매칭을 위해)
        const ratioX = clampedX / imgRect.width;
        const ratioY = clampedY / imgRect.height;
        
        const newPosition = {
          type: 'custom',
          x: realX,
          y: realY,
          ratioX: ratioX,
          ratioY: ratioY
        };
        console.log('Saving position for:', filePath, '→', newPosition);
        imagePositions.set(filePath, newPosition);
        
        // 컨트롤 패널 업데이트
        const card = overlay.closest('.preview-card');
        const indicator = card.querySelector('.position-indicator');
        if (indicator) {
          indicator.textContent = `Position: custom (${realX}, ${realY})`;
        }
      };
      originalImg.src = img.src;
    }
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      overlay.classList.remove('dragging');
      
      // 드래그 완료 후 워터마크 적용된 새 미리보기 생성
      const card = overlay.closest('.preview-card');
      refreshPreviewImage(filePath, card);
    }
  });
}

async function updateOverlayPosition(overlay, img, filePath) {
  const posData = imagePositions.get(filePath);
  const imgRect = img.getBoundingClientRect();
  
  if (!posData) {
    console.warn('No position data for', filePath);
    return;
  }
  
  try {
    // 비율 기반 위치가 있으면 바로 사용 (더 빠르고 정확)
    if (posData.ratioX !== undefined && posData.ratioY !== undefined) {
      const x = posData.ratioX * imgRect.width;
      const y = posData.ratioY * imgRect.height;
      
      // 경계 체크
      const maxX = Math.max(0, imgRect.width - overlay.offsetWidth);
      const maxY = Math.max(0, imgRect.height - overlay.offsetHeight);
      
      overlay.style.left = Math.min(x, maxX) + 'px';
      overlay.style.top = Math.min(y, maxY) + 'px';
      return;
    }
    
    // 비율 정보가 없으면 API로 정확한 위치 계산
    const opts = await readOptionsForPreview(filePath);
    const watermarkInfo = await window.api.getWatermarkPosition({ filePath, options: opts });
    
    if (watermarkInfo) {
      const scaleX = imgRect.width / watermarkInfo.imageWidth;
      const scaleY = imgRect.height / watermarkInfo.imageHeight;
      
      const x = watermarkInfo.left * scaleX;
      const y = watermarkInfo.top * scaleY;
      
      // 위치만 업데이트, 크기는 초기 설정 유지
      overlay.style.left = x + 'px';
      overlay.style.top = y + 'px';
    }
    
  } catch (e) {
    console.error('Failed to get watermark position:', e);
    // 최종 폴백: 간단한 위치 계산
    const margin = Number(document.getElementById('margin')?.value || 24);
    const overlayWidth = overlay.offsetWidth || 200;
    const overlayHeight = overlay.offsetHeight || 30;
    
    let x = 0, y = 0;
    switch (posData.type) {
      case 'northwest':
        x = margin;
        y = margin;
        break;
      case 'northeast':
        x = imgRect.width - overlayWidth - margin;
        y = margin;
        break;
      case 'southwest':
        x = margin;
        y = imgRect.height - overlayHeight - margin;
        break;
      case 'center':
        x = (imgRect.width - overlayWidth) / 2;
        y = (imgRect.height - overlayHeight) / 2;
        break;
      default: // southeast
        x = imgRect.width - overlayWidth - margin;
        y = imgRect.height - overlayHeight - margin;
    }
    
    overlay.style.left = Math.max(0, x) + 'px';
    overlay.style.top = Math.max(0, y) + 'px';
  }
}

// Debounce 맵 (파일별로 독립적인 debounce)
const refreshDebounceMap = new Map();

// 워터마크가 적용된 새로운 미리보기 이미지 생성 (Debounced)
function refreshPreviewImage(filePath, card) {
  // 기존 debounce 타이머 취소
  if (refreshDebounceMap.has(filePath)) {
    clearTimeout(refreshDebounceMap.get(filePath));
  }
  
  // 새 debounce 타이머 설정 (300ms 후 실행)
  const timeoutId = setTimeout(async () => {
    try {
      const opts = await readOptionsForPreview(filePath);
      const dataUrl = await window.api.previewImage({ filePath, options: opts });
      
      const img = card.querySelector('img');
      if (img) {
        img.src = dataUrl;
      }
    } catch (e) {
      console.error('Failed to refresh preview:', e);
    } finally {
      refreshDebounceMap.delete(filePath);
    }
  }, 300);
  
  refreshDebounceMap.set(filePath, timeoutId);
}

if (btnPreview) {
  btnPreview.addEventListener('click', async () => {
    if (!chosenFolder) {
      statusEl.textContent = 'Choose a target folder first.';
      return;
    }
    
    // 상태창과 이전 미리보기 리셋
    statusEl.textContent = 'Loading interactive previews…';
    if (previewGrid) previewGrid.innerHTML = '';
    
    const logEl = document.getElementById('log');
    const barEl = document.getElementById('bar');
    if (logEl) logEl.textContent = '';
    if (barEl) barEl.style.width = '0%';
    
    // Run 버튼 숨기기 (미리보기 완료 후 다시 표시)
    const btnRun = document.getElementById('btnRun');
    if (btnRun) btnRun.style.display = 'none';

    try {
      const files = await window.api.listImages(chosenFolder);

      const previews = [];
      for (const f of files) {
        const opts = await readOptionsForPreview(f); // 각 파일별 개별 옵션 적용
        const dataUrl = await window.api.previewImage({ filePath: f, options: opts });
        previews.push(dataUrl);
      }

      renderInteractivePreviews(previews, files, files);
      statusEl.textContent = `🎯 Interactive preview ready (${files.length} images loaded). Drag watermarks to adjust positions.`;
      
      // 미리보기 완료 후 Run 버튼 표시
      if (btnRun) {
        btnRun.style.display = 'block';
        // 버튼 나타나는 애니메이션 효과
        btnRun.style.opacity = '0';
        btnRun.style.transform = 'translateY(10px)';
        setTimeout(() => {
          btnRun.style.transition = 'all 0.3s ease';
          btnRun.style.opacity = '1';
          btnRun.style.transform = 'translateY(0)';
        }, 100);
      }
    } catch (e) {
      statusEl.textContent = 'Preview error: ' + e.message;
    }
  });
}



// ===== Auto-restore on load =====
(function init() {
  // 1) 옵션 복원
  loadOptions();

  // 2) 마지막 폴더 경로 복원 (보안상 자동으로 파일 다이얼로그를 열 수는 없음)
  const last = loadLastFolder();
  if (last) {
    chosenFolder = last;
    folderPathEl.textContent = last;
  }

  // 3) 입력 변경 시 자동 저장 (디바운스 없이 단순 처리)
  [wmText, fontSize, textColor, fontFamily, opacity, position, margin, maxWidth, shadowColor, shadowOffsetX, shadowOffsetY, shadowBlur, outlineColor, outlineWidth, customX, customY].forEach(el => {
    if (!el) return;
    const ev = el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(ev, saveOptions);
  });

  // Position select 변경 시 custom position row 표시/숨김
  if (position) {
    position.addEventListener('change', () => {
      if (customPositionRow) {
        customPositionRow.style.display = position.value === 'custom' ? 'flex' : 'none';
      }
    });
    // 초기 상태 설정
    if (customPositionRow) {
      customPositionRow.style.display = position.value === 'custom' ? 'flex' : 'none';
    }
  }

  // 4) 시스템 폰트 목록 로드하여 datalist/셀렉트 채우기 + 미리보기
  const dl = document.getElementById('fontList');
  if ((dl || fontFamilySelect) && window.api?.listSystemFonts) {
    window.api.listSystemFonts().then(fonts => {
      const list = (fonts || []).slice(0, 500);
      if (dl) {
        dl.innerHTML = '';
        list.forEach(f => {
          const opt = document.createElement('option');
          opt.value = f;
          dl.appendChild(opt);
        });
      }
      if (fontFamilySelect) {
        fontFamilySelect.innerHTML = '<option value="">— System Fonts —</option>';
        list.forEach(f => {
          const o = document.createElement('option');
          o.value = f;
          o.textContent = f;
          fontFamilySelect.appendChild(o);
        });
        const applyPreview = (family) => {
          if (!fontPreview) return;
          const familyCss = family && family.indexOf(' ') >= 0 && !family.includes(',') ? `'${family}'` : family;
          fontPreview.style.fontFamily = familyCss || "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
        };
        // select 변경 시
        fontFamilySelect.addEventListener('change', () => {
          if (!fontFamily) return;
          if (fontFamilySelect.value) fontFamily.value = fontFamilySelect.value;
          applyPreview(fontFamilySelect.value);
          saveOptions();
        });
        // input 타이핑 시도 미리보기
        if (fontFamily) {
          fontFamily.addEventListener('input', () => applyPreview(fontFamily.value));
        }
        // 초기 미리보기
        applyPreview(fontFamily?.value);
      }
    }).catch(() => {});
  }



  // 라이트박스 닫기 (배경 클릭)
  const lb = document.getElementById('lightbox');
  if (lb) {
    lb.addEventListener('click', (e) => {
      if (e.target === lb) lb.style.display = 'none';
    });
  }
})();
