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
const fontSizeMode = document.getElementById('fontSizeMode');
const rowFontSizePx = document.getElementById('rowFontSizePx');
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



// ===== Persistence Keys =====
const STORAGE_KEY = 'wmOptions.v1';
const FOLDER_KEY = 'wmLastFolder.v1';

let chosenFolder = null;

// ===== Persistence helpers =====
function getCurrentOptionsSnapshot() {
  return {
    text: (wmText.value || '').trim(),
    fontSize: Number(fontSize.value) || 36,
    fontSizeMode: (fontSizeMode?.value || 'percent'),
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
    // logo 파일은 보안상 경로/값 저장 X (브라우저가 file input 복원을 금지)
  };
}

function applyOptionsToUI(opts) {
  if (!opts) return;
  if (typeof opts.text === 'string') wmText.value = opts.text;
  if (Number.isFinite(opts.fontSize)) fontSize.value = String(opts.fontSize);
  if (typeof opts.fontSizeMode === 'string' && fontSizeMode) fontSizeMode.value = opts.fontSizeMode;
  if (typeof opts.textColor === 'string' && textColor) textColor.value = opts.textColor;
  if (typeof opts.fontFamily === 'string' && fontFamily) fontFamily.value = opts.fontFamily;
  if (Number.isFinite(opts.opacity)) opacity.value = String(opts.opacity);
// Helper to toggle font size mode visibility
function updateFontSizeModeVisibility() {
}
  if (typeof opts.position === 'string') position.value = opts.position;
  if (Number.isFinite(opts.margin)) margin.value = String(opts.margin);
  if (Number.isFinite(opts.maxWidth)) maxWidth.value = String(opts.maxWidth);
  if (typeof opts.shadowColor === 'string' && shadowColor) shadowColor.value = opts.shadowColor;
  if (Number.isFinite(opts.shadowOffsetX) && shadowOffsetX) shadowOffsetX.value = String(opts.shadowOffsetX);
  if (Number.isFinite(opts.shadowOffsetY) && shadowOffsetY) shadowOffsetY.value = String(opts.shadowOffsetY);
  if (Number.isFinite(opts.shadowBlur) && shadowBlur) shadowBlur.value = String(opts.shadowBlur);
  if (typeof opts.outlineColor === 'string' && outlineColor) outlineColor.value = opts.outlineColor;
  if (Number.isFinite(opts.outlineWidth) && outlineWidth) outlineWidth.value = String(opts.outlineWidth);
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
    updateFontSizeModeVisibility(); // Manually update UI after loading options
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

// ===== Run All =====
btnRun.addEventListener('click', async () => {
  if (!chosenFolder) {
    statusEl.textContent = 'Choose a target folder first.';
    return;
  }

  statusEl.textContent = 'Processing all files…';
  logEl.textContent = '';
  bar.style.width = '0%';

  try {
    const options = await buildOptionsForIPC(); // saveOptions 포함
    
    // 이미지와 동영상을 순차적으로 처리
    const imageSummary = await window.api.processImages({ folder: chosenFolder, options });
    const videoSummary = await window.api.processVideos({ folder: chosenFolder, options });
    
    const totalFiles = imageSummary.total + videoSummary.total;
    const totalSucceeded = imageSummary.succeeded + videoSummary.succeeded;
    const totalFailed = imageSummary.failed + videoSummary.failed;
    
    statusEl.textContent = `완료! 총 ${totalFiles}개 파일 중 ${totalSucceeded}개 성공, ${totalFailed}개 실패 (이미지: ${imageSummary.succeeded}/${imageSummary.total}, 동영상: ${videoSummary.succeeded}/${videoSummary.total})`;
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
      snap.position = imagePosition;
    } else {
      snap.position = imagePosition.type;
    }
  }
  
  // 동영상 프리뷰를 위해 전체 imagePositions 배열도 포함
  const imagePositionsArray = Array.from(imagePositions.entries()).map(([filePath, posData]) => ({
    filePath,
    position: posData
  }));
  
  return { ...snap, logoBytes, maxWidth: 0, imagePositions: imagePositionsArray }; // 프리뷰는 내부에서 축소 렌더
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
      const initialPosition = { type: position.value || 'southeast' };
      imagePositions.set(filePath, initialPosition);
    }

    const card = document.createElement('div');
    card.className = 'preview-card';
    card.dataset.filePath = filePath;

    const cap = document.createElement('div');
    cap.className = 'filename';
    const ext = filePath.split('.').pop()?.toLowerCase();
    const isVideo = ['mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi'].includes(ext);
    cap.innerHTML = `${isVideo ? '🎬 ' : '🖼️ '}${fileName}`;

    const imageContainer = document.createElement('div');
    imageContainer.style.position = 'relative';

    const img = document.createElement('img');
    img.src = url;
    img.addEventListener('click', () => {
      const lb = document.getElementById('lightbox');
      const lbImg = document.getElementById('lightboxImg');
      if (!lb || !lbImg) return;
      // 항상 최신 미리보기 이미지를 사용
      lbImg.src = img.src;
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
      const { overlayWidth, overlayHeight } = await setupWatermarkOverlay(overlay, img, filePath, i);
      updateOverlayPosition(overlay, img, filePath, overlayWidth, overlayHeight);
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

        const shortEdge = Math.min(originalImg.width, originalImg.height);
        const mode = (opts.fontSizeMode || 'percent');
        let effFont = 36;
        if (mode === 'percent') {
          const pct = Number(opts.fontSize) || 5;
          effFont = Math.max(12, Math.min(256, Math.round(shortEdge * (pct / 100))));
        } else {
          effFont = Math.max(12, Math.min(256, Math.round(Number(opts.fontSize) || 36)));
        }

        // 스케일링된 폰트로 텍스트 크기 측정
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const text = opts.text || '';
        ctx.font = `${effFont}px ${opts.fontFamily || 'Arial'}`;
        const textMetrics = ctx.measureText(text);
        const actualWidth = textMetrics.width * previewScale;
        const actualHeight = effFont * previewScale * 1.2;
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
  let currentImgRect; // Variable to store imgRect on mousedown

  overlay.addEventListener('mousedown', (e) => {
    isDragging = true;
    overlay.classList.add('dragging');
    const overlayRect = overlay.getBoundingClientRect();
    startX = e.clientX - overlayRect.left;
    startY = e.clientY - overlayRect.top;
    currentImgRect = img.getBoundingClientRect(); // Calculate imgRect on mousedown
    e.preventDefault();
    e.stopPropagation();
  });

  const onMouseMove = (e) => {
    if (!isDragging) return;
    
    const x = e.clientX - currentImgRect.left - startX;
    const y = e.clientY - currentImgRect.top - startY;
    
    // 현재 오버레이의 실제 크기 사용 (동적으로 변할 수 있음)
    const currentWidth = overlay.offsetWidth;
    const currentHeight = overlay.offsetHeight;
    
    const clampedX = Math.max(0, Math.min(x, currentImgRect.width - currentWidth));
    const clampedY = Math.max(0, Math.min(y, currentImgRect.height - currentHeight));
    
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
        const scaleX = originalImg.width / currentImgRect.width;
        const scaleY = originalImg.height / currentImgRect.height;
        const realX = Math.round(clampedX * scaleX);
        const realY = Math.round(clampedY * scaleY);
        
        // 좌표를 비율로도 저장 (더 안정적인 매칭을 위해)
        const ratioX = clampedX / currentImgRect.width;
        const ratioY = clampedY / currentImgRect.height;
        
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
  };

  const onMouseUp = () => {
    if (isDragging) {
      isDragging = false;
      overlay.classList.remove('dragging');
      
      // 드래그 완료 후 워터마크 적용된 새 미리보기 생성
      const card = overlay.closest('.preview-card');
      refreshPreviewImage(filePath, card);
    }
  };

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);

  // Clean up event listeners when the element is removed
  overlay.addEventListener('removed', () => {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  });

  return { overlayWidth, overlayHeight };
}

async function updateOverlayPosition(overlay, img, filePath, overlayWidth, overlayHeight) {
  const posData = imagePositions.get(filePath);
  const imgRect = img.getBoundingClientRect();
  
  if (!posData) {
    console.warn('No position data for', filePath);
    return;
  }
  
  // For custom positions set by dragging, use the ratio-based positioning.
  if (posData.type === 'custom' && posData.ratioX !== undefined && posData.ratioY !== undefined) {
    const x = posData.ratioX * imgRect.width;
    const y = posData.ratioY * imgRect.height;
    
    const maxX = Math.max(0, imgRect.width - (overlayWidth || overlay.offsetWidth));
    const maxY = Math.max(0, imgRect.height - (overlayHeight || overlay.offsetHeight));
    
    overlay.style.left = Math.min(x, maxX) + 'px';
    overlay.style.top = Math.min(y, maxY) + 'px';
    return;
  }

  // For preset positions, calculate the position using the switch statement.
  const margin = Number(document.getElementById('margin')?.value || 24);
  const w = overlayWidth || overlay.offsetWidth || 200;
  const h = overlayHeight || overlay.offsetHeight || 30;
  
  let x = 0, y = 0;
  switch (posData.type) {
    case 'northwest':
      x = margin;
      y = margin;
      break;
    case 'northeast':
      x = imgRect.width - w - margin;
      y = margin;
      break;
    case 'north':
      x = Math.floor((imgRect.width - w) / 2);
      y = margin;
      break;
    case 'southwest':
      x = margin;
      y = imgRect.height - h - margin;
      break;
    case 'south':
      x = Math.floor((imgRect.width - w) / 2);
      y = imgRect.height - h - margin;
      break;
    case 'center':
      x = Math.floor((imgRect.width - w) / 2);
      y = Math.floor((imgRect.height - h) / 2);
      break;
    default: // southeast
      x = imgRect.width - w - margin;
      y = imgRect.height - h - margin;
  }
  
  overlay.style.left = Math.max(0, x) + 'px';
  overlay.style.top = Math.max(0, y) + 'px';
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
      const fileList = await window.api.listImages(chosenFolder);
      const allFiles = [...(fileList.images || []), ...(fileList.videos || [])];

      const previews = [];
      for (const f of allFiles) {
        const opts = await readOptionsForPreview(f); // 각 파일별 개별 옵션 적용
        const dataUrl = await window.api.previewImage({ filePath: f, options: opts });
        previews.push(dataUrl);
      }

      renderInteractivePreviews(previews, allFiles, allFiles);
      const imageCount = (fileList.images || []).length;
      const videoCount = (fileList.videos || []).length;
      statusEl.textContent = `🎯 Interactive preview ready (${imageCount} images, ${videoCount} videos). Drag watermarks to adjust positions.`;
      
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
  [wmText, fontSize, textColor, fontFamily, opacity, position, margin, maxWidth, shadowColor, shadowOffsetX, shadowOffsetY, shadowBlur, outlineColor, outlineWidth].forEach(el => {
    if (!el) return;
    const ev = el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(ev, saveOptions);
  });

  

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

  if (fontSizeMode) {
    fontSizeMode.addEventListener('change', () => {
      updateFontSizeModeVisibility();
      saveOptions();
    });
    // 초기 가시성
    updateFontSizeModeVisibility();
  }