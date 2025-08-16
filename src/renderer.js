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
    textColor: (textColor?.value || '#ffffff'),
    fontFamily: (fontFamily?.value || "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"),
    opacity: Math.max(0, Math.min(1, Number(opacity.value) || 0.35)),
    position: position.value,
    margin: Number(margin.value) || 24,
    maxWidth: Number(maxWidth.value) || 0,
    shadowColor: (shadowColor?.value || '#000000'),
    shadowOffsetX: Number(shadowOffsetX?.value) || 2,
    shadowOffsetY: Number(shadowOffsetY?.value) || 2,
    shadowBlur: Number(shadowBlur?.value) || 0,
    outlineColor: (outlineColor?.value || '#000000'),
    outlineWidth: Number(outlineWidth?.value) || 0,
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
  return { ...snap, logoBytes };
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
async function readOptionsForPreview() {
  // 프리뷰에서도 저장
  saveOptions();

  let logoBytes = null;
  if (logo.files && logo.files[0]) {
    const buf = await logo.files[0].arrayBuffer();
    logoBytes = new Uint8Array(buf);
  }
  const snap = getCurrentOptionsSnapshot();
  return { ...snap, logoBytes, maxWidth: 0 }; // 프리뷰는 내부에서 축소 렌더
}

function renderPreviews(dataUrls, filePaths) {
  if (!previewGrid) return;
  previewGrid.innerHTML = '';
  dataUrls.forEach((url, i) => {
    const card = document.createElement('div');
    card.style.border = '1px solid #e5e7eb';
    card.style.borderRadius = '10px';
    card.style.overflow = 'hidden';
    card.style.background = '#fff';

    const cap = document.createElement('div');
    cap.textContent = filePaths[i].split('/').pop();
    cap.style.fontSize = '12px';
    cap.style.padding = '8px';
    cap.style.borderBottom = '1px solid #eee';
    cap.style.color = '#6b7280';

    const img = document.createElement('img');
    img.src = url;
    img.style.display = 'block';
    img.style.width = '100%';
    img.style.cursor = 'zoom-in';
    img.addEventListener('click', () => {
      const lb = document.getElementById('lightbox');
      const lbImg = document.getElementById('lightboxImg');
      if (!lb || !lbImg) return;
      lbImg.src = url;
      lb.style.display = 'flex';
    });

    card.appendChild(cap);
    card.appendChild(img);
    previewGrid.appendChild(card);
  });
}

if (btnPreview) {
  btnPreview.addEventListener('click', async () => {
    if (!chosenFolder) {
      statusEl.textContent = 'Choose a target folder first.';
      return;
    }
    statusEl.textContent = 'Generating previews…';
    if (previewGrid) previewGrid.innerHTML = '';

    try {
      const files = await window.api.listImages(chosenFolder);
      const sample = files.slice(0, 4);
      const opts = await readOptionsForPreview();

      const previews = [];
      for (const f of sample) {
        const dataUrl = await window.api.previewImage({ filePath: f, options: opts });
        previews.push(dataUrl);
      }

      renderPreviews(previews, sample);
      statusEl.textContent = `Preview ready (${previews.length}/${files.length} shown).`;
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

  // 4) 시스템 폰트 목록 로드하여 datalist 채우기
  const dl = document.getElementById('fontList');
  if (dl && window.api?.listSystemFonts) {
    window.api.listSystemFonts().then(fonts => {
      dl.innerHTML = '';
      (fonts || []).slice(0, 300).forEach(f => {
        const opt = document.createElement('option');
        opt.value = f;
        dl.appendChild(opt);
      });
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
