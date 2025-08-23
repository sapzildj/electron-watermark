// src/watermark.js
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const os = require('os');
const ffmpeg = require('fluent-ffmpeg');
let ffmpegPath = null;
let ffprobePath = null;
try {
  ffmpegPath = require('ffmpeg-static');
  console.log('FFmpeg path found:', ffmpegPath);
} catch (e) {
  console.log('FFmpeg static not found:', e.message);
}
try {
  const ffprobeStatic = require('ffprobe-static');
  ffprobePath = ffprobeStatic.path;
  console.log('FFprobe path found:', ffprobePath);
} catch (e) {
  console.log('FFprobe static not found:', e.message);
}

if (ffmpegPath) {
  try { 
    ffmpeg.setFfmpegPath(ffmpegPath); 
    console.log('FFmpeg path set successfully');
  } catch (e) {
    console.log('Failed to set FFmpeg path:', e.message);
  }
}
if (ffprobePath) {
  try { 
    ffmpeg.setFfprobePath(ffprobePath); 
    console.log('FFprobe path set successfully');
  } catch (e) {
    console.log('Failed to set FFprobe path:', e.message);
  }
}

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']); // extend if needed
const VIDEO_EXT = new Set(['.mp4', '.mov', '.m4v', '.mkv', '.webm', '.avi']);

// 안전 여백/치수 클램프
function clamp(num, min, max) {
  return Math.max(min, Math.min(max, num));
}

// 이미지 크기에 따라 일관된 텍스트 크기 계산
// mode === 'percent'  -> shortEdge * (fontSizePct / 100)
// mode === 'absolute' -> fontSize (px)
function effectiveFontSize(baseW, baseH, { fontSize, fontSizeMode }) {
  const shortEdge = Math.max(1, Math.min(baseW || 0, baseH || 0));
  if ((fontSizeMode || 'percent') === 'percent') {
    const pct = Number(fontSize);
    const raw = (isFinite(pct) ? pct : 5) / 100 * shortEdge;
    return clamp(Math.round(raw), 12, 256);
  } else {
    return clamp(Math.round(Number(fontSize) || 36), 12, 256);
  }
}

// HEX 컬러 파싱 -> { r,g,b }
function parseHexColor(hex) {
  if (typeof hex !== 'string') return { r: 255, g: 255, b: 255 };
  let h = hex.trim();
  if (h.startsWith('#')) h = h.slice(1);
  if (h.length === 3) {
    const r = parseInt(h[0] + h[0], 16);
    const g = parseInt(h[1] + h[1], 16);
    const b = parseInt(h[2] + h[2], 16);
    return { r, g, b };
  }
  if (h.length >= 6) {
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return { r, g, b };
  }
  return { r: 255, g: 255, b: 255 };
}

// 상대 휘도(간단 버전, 0~255 스케일)
function luminanceFromRGB(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// 특정 위치 후보에 대한 영역 평균 밝기 계산
async function computeRegionLuminance(baseSharp, left, top, width, height, baseW, baseH) {
  if (width <= 0 || height <= 0) return 0;
  
  // 경계 안전 처리
  const safeLeft = Math.max(0, Math.min(left, baseW - 1));
  const safeTop = Math.max(0, Math.min(top, baseH - 1));
  const safeWidth = Math.max(1, Math.min(width, baseW - safeLeft));
  const safeHeight = Math.max(1, Math.min(height, baseH - safeTop));
  
  try {
    const region = await baseSharp.clone().extract({ 
      left: safeLeft, 
      top: safeTop, 
      width: safeWidth, 
      height: safeHeight 
    }).stats();
    
    // stats.channels[0]=red, [1]=green, [2]=blue
    const r = region.channels?.[0]?.mean ?? 255;
    const g = region.channels?.[1]?.mean ?? 255;
    const b = region.channels?.[2]?.mean ?? 255;
    return luminanceFromRGB(r, g, b);
  } catch (e) {
    console.warn('computeRegionLuminance error:', e);
    return 128; // 중간 밝기 반환
  }
}

// position === 'auto' 일 때 최적 위치 선택
async function pickAutoPosition(baseSharp, baseW, baseH, overlayW, overlayH, margin, textColor) {
  const m = clamp(Number(margin) || 0, 0, 1000);
  const candidates = ['southeast', 'southwest', 'northeast', 'northwest', 'center'];
  const textRGB = parseHexColor(textColor || '#ffffff');
  const textL = luminanceFromRGB(textRGB.r, textRGB.g, textRGB.b);

  let best = 'southeast';
  let bestScore = -Infinity;

  for (const pos of candidates) {
    let { left, top } = computeLeftTop(baseW, baseH, overlayW, overlayH, pos, m, undefined, undefined);
    // 영역 내 평균 밝기
    const regionL = await computeRegionLuminance(baseSharp, left, top, overlayW, overlayH, baseW, baseH);
    const score = Math.abs(textL - regionL); // 대비가 클수록 가독성↑
    if (score > bestScore) {
      bestScore = score;
      best = pos;
    }
  }
  return best;
}

// 텍스트용 SVG를 "최대 폭" 안으로 생성
function makeTextSVG(text, fontSize, opacity, maxWidthPx, textColor, fontFamily, shadow, outline, imageWidth = null, baseImageWidth = 800) {
  const esc = (s) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  
  // 이미지 크기에 따른 폰트 크기 스케일링
  let scaledFontSize = fontSize || 36;
  if (imageWidth && baseImageWidth && imageWidth !== baseImageWidth) {
    const scale = imageWidth / baseImageWidth;
    scaledFontSize = Math.round((fontSize || 36) * scale);
    console.log(`Font size scaled: ${fontSize} → ${scaledFontSize} (scale: ${scale.toFixed(3)})`);
  }
  
  const svgW = clamp(Math.floor(maxWidthPx || 400), 50, 10000);    // 최소 50px
  const svgH = clamp(Math.floor(scaledFontSize * 1.4), 30, 2000); // 스케일된 폰트 크기 기준
  const color = (textColor || '#ffffff');
  const ff = (fontFamily || "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif");
  const s = shadow || { color: '#000000', offsetX: 2, offsetY: 2, blur: 0 };
  const o = outline || { color: '', width: 0 };
  const filterId = 'f1';
  const hasShadow = (Number(s.blur) > 0) || (Number(s.offsetX) !== 0) || (Number(s.offsetY) !== 0);
  
  // 그림자 오프셋도 스케일링
  const shadowOffsetX = imageWidth && baseImageWidth ? (Number(s.offsetX)||0) * (imageWidth / baseImageWidth) : (Number(s.offsetX)||0);
  const shadowOffsetY = imageWidth && baseImageWidth ? (Number(s.offsetY)||0) * (imageWidth / baseImageWidth) : (Number(s.offsetY)||0);
  const shadowBlur = imageWidth && baseImageWidth ? (Number(s.blur)||0) * (imageWidth / baseImageWidth) : (Number(s.blur)||0);
  
  const shadowFilter = s && hasShadow ? `
      <filter id="${filterId}" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="${shadowOffsetX}" dy="${shadowOffsetY}" stdDeviation="${shadowBlur}" flood-color="${s.color||'#000'}" flood-opacity="${opacity}" />
      </filter>` : '';
  const filterAttr = shadowFilter ? `filter="url(#${filterId})"` : '';
  
  // 아웃라인 두께도 스케일링
  const outlineWidth = imageWidth && baseImageWidth ? (Number(o.width)||0) * (imageWidth / baseImageWidth) : (Number(o.width)||0);
  const strokeStyle = (o && outlineWidth > 0) ? `stroke:${o.color||'#000000'};stroke-width:${outlineWidth}px;paint-order:stroke;stroke-linejoin:round;` : '';
  
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">
    <defs>${shadowFilter}</defs>
    <style>
      .t { font: ${scaledFontSize}px ${ff}; fill: ${color}; ${strokeStyle} }
    </style>
    <text x="0" y="${Math.round(scaledFontSize * 1.0)}" class="t" ${filterAttr} fill-opacity="${opacity}">${esc(text)}</text>
  </svg>`);
}

// Uint8Array/Buffer 정규화
function normalizeBuffer(bytes) {
  if (!bytes) return null;
  return Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
}

// 오버레이 버퍼를 "박스(width,height)" 안으로 안전 축소
async function fitOverlayInside(overlayBuf, boxW, boxH) {
  const ow = clamp(Math.floor(boxW), 1, 100000);
  const oh = clamp(Math.floor(boxH), 1, 100000);
  // PNG로 래스터라이즈 후 투명 여백 트리밍 → 실제 텍스트/로고 경계만 남기기
  const trimmed = await sharp(overlayBuf)
    .png()
    .trim()
    .toBuffer();
  // 안전 박스 안으로 리사이즈
  const out = await sharp(trimmed)
    .resize({ width: ow, height: oh, fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();
  // 최종 안전성 체크 (이론상 필요 없지만 방어적으로 한 번 더 메타 확인)
  const meta = await sharp(out).metadata();
  if ((meta.width || 0) > ow || (meta.height || 0) > oh) {
    // 혹시라도 남는 경우 한 번 더 줄이기
    return await sharp(out)
      .resize({ width: ow, height: oh, fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
  }
  return out;
}

// 오버레이 위치 계산(절대 좌표): gravity 대신 left/top만 사용
function computeLeftTop(baseW, baseH, overlayW, overlayH, position, margin, customX, customY) {
  const m = clamp(Number(margin) || 0, 0, 1000);
  let left = 0, top = 0;
  
  // 문자열로 된 position이 아니라 객체로 커스텀 좌표가 전달된 경우
  if (typeof position === 'object' && position.type === 'custom') {
    // 비율 기반 좌표가 있으면 우선 사용 (더 정확함)
    if (position.ratioX !== undefined && position.ratioY !== undefined) {
      left = Math.round(position.ratioX * baseW);
      top = Math.round(position.ratioY * baseH);
    } else {
      left = Number(position.x) || 0;
      top = Number(position.y) || 0;
    }
  } else {
    switch (position) {
      case 'southeast':
        left = baseW - overlayW - m;
        top = baseH - overlayH - m;
        break;
      case 'southwest':
        left = m;
        top = baseH - overlayH - m;
        break;
      case 'northeast':
        left = baseW - overlayW - m;
        top = m;
        break;
      case 'north':
        left = Math.floor((baseW - overlayW) / 2);
        top = m;
        break;
      case 'northwest':
        left = m;
        top = m;
        break;
      case 'south':
        left = Math.floor((baseW - overlayW) / 2);
        top = baseH - overlayH - m;
        break;
      case 'center':
      default:
        left = Math.floor((baseW - overlayW) / 2);
        top = Math.floor((baseH - overlayH) / 2);
        break;
    }
  }
  
  // 안전 클램프
  left = clamp(left, 0, Math.max(0, baseW - overlayW));
  top = clamp(top, 0, Math.max(0, baseH - overlayH));
  return { left, top };
}

// 공통: 실제 합성 (파일 저장용)
async function watermarkOne(inputPath, outputPath, opts) {
  const { text, fontSize, opacity, position, margin, maxWidth, logoBytes, textColor, fontFamily, shadowColor, shadowOffsetX, shadowOffsetY, shadowBlur, outlineColor, outlineWidth } = opts;

  // 1) 베이스 생성 및 (옵션) 리사이즈
  let probe = sharp(inputPath, { failOn: 'none' });
  let meta = await probe.metadata();
  let img;
  if (maxWidth && meta.width && meta.width > maxWidth) {
    const resizedBuf = await sharp(inputPath, { failOn: 'none' })
      .resize({ width: maxWidth })
      .toBuffer();
    img = sharp(resizedBuf, { failOn: 'none' });
    meta = await img.metadata(); // 리사이즈 후 실제 메타
  } else {
    img = sharp(inputPath, { failOn: 'none' });
    // meta는 원본 메타 그대로 사용
  }

  // 2) 합성할 수 있는 최대 박스 계산 (여백 고려)
  const m = clamp(Number(margin) || 0, 0, 1000);
  const baseW = meta.width || 0;
  const baseH = meta.height || 0;
  const boxW = clamp(baseW - m * 2, 1, baseW);   // 최소 1 보장
  const boxH = clamp(baseH - m * 2, 1, baseH);

  const effFont = effectiveFontSize(baseW, baseH, { fontSize, fontSizeMode: opts.fontSizeMode });
  const effOpacity = clamp(Number(opacity) || 0.35, 0, 1);

  const composites = [];

  // 3) 텍스트 SVG (이미지 크기에 맞춰 스케일링)
  if (text) {
    const rawSvg = makeTextSVG(
      text,
      effFont,
      effOpacity,
      boxW,
      textColor,
      fontFamily,
      { color: shadowColor, offsetX: shadowOffsetX, offsetY: shadowOffsetY, blur: shadowBlur },
      { color: outlineColor, width: outlineWidth },
      baseW,  // 현재 이미지 너비
      baseW   // 기준 너비를 동일하게 주어 내부 스케일링 무효화
    );
    // SVG도 합성 전 안전 박스 크기(boxW x boxH) 안으로 축소
    const safeSvg = await fitOverlayInside(rawSvg, boxW, boxH);

    const svgMeta = await sharp(safeSvg).metadata();
    let pos = position || 'southeast';
    if (pos === 'auto') pos = 'southeast';
    const { left: svgLeft, top: svgTop } = computeLeftTop(baseW, baseH, svgMeta.width || 0, svgMeta.height || 0, pos, m);
    
    console.log('Actual watermark applied:', {
      imageSize: `${baseW}x${baseH}`,
      watermarkSize: `${svgMeta.width}x${svgMeta.height}`,
      position: `${svgLeft},${svgTop}`,
      positionType: pos
    });
    
    composites.push({
      input: safeSvg,
      left: svgLeft,
      top: svgTop,
    });
  }

  // 4) 로고 PNG
  const logoBuf = normalizeBuffer(logoBytes);
  if (logoBuf) {
    const safeLogo = await fitOverlayInside(logoBuf, boxW, boxH);
    const lmeta = await sharp(safeLogo).metadata();
    const { left: logoLeft, top: logoTop } = computeLeftTop(baseW, baseH, lmeta.width || 0, lmeta.height || 0, (position === 'auto' ? 'southeast' : (position || 'southeast')), m);
    composites.push({
      input: safeLogo,
      left: logoLeft,
      top: logoTop,
      blend: 'over',
      opacity: effOpacity,
    });
  }

  // 5) 저장 (오버레이 없으면 원본 그대로 저장)
  if (composites.length > 0) {
    await img.composite(composites).toFile(outputPath);
  } else {
    await img.toFile(outputPath);
  }
}

// 폴더 배치 처리
async function processFolderImages(inDir, outDir, options, onProgress) {
  const files = fs.readdirSync(inDir);
  const images = files.filter(f => IMAGE_EXT.has(path.extname(f).toLowerCase()));
  let current = 0, succeeded = 0, failed = 0;

  // 이미지별 위치 정보 맵 생성
  const imagePositionsMap = new Map();
  if (options.imagePositions && Array.isArray(options.imagePositions)) {
    options.imagePositions.forEach(({ filePath, position }) => {
      // 파일명으로도 매칭할 수 있도록 다양한 키 추가
      const fileName = path.basename(filePath);
      imagePositionsMap.set(filePath, position);
      imagePositionsMap.set(fileName, position);
      console.log('Stored position for:', filePath, '→', position);
    });
  }

  for (const file of images) {
    current += 1;
    const inputPath = path.join(inDir, file);
    const outputPath = path.join(outDir, file);

    try {
      // 해당 이미지의 개별 위치 설정 확인 (여러 키로 시도)
      let imagePosition = imagePositionsMap.get(inputPath) || 
                         imagePositionsMap.get(file) || 
                         imagePositionsMap.get(path.basename(inputPath));
      
      console.log('Processing:', inputPath, 'Found position:', imagePosition);
      let imageOptions = { ...options };
      
      if (imagePosition) {
        // 개별 위치 설정이 있으면 적용
        if (imagePosition.type === 'custom') {
          // 전체 position 객체를 전달하여 비율 기반 계산 가능하도록
          imageOptions.position = imagePosition;
          console.log('Applying custom position:', imagePosition, 'to', inputPath);
        } else {
          imageOptions.position = imagePosition.type;
          console.log('Applying preset position:', imagePosition.type, 'to', inputPath);
        }
      } else {
        console.log('No custom position found for:', inputPath, 'using default position');
      }

      await watermarkOne(inputPath, outputPath, imageOptions);
      succeeded += 1;
      onProgress?.({ current, total: images.length, file, ok: true });
    } catch (e) {
      failed += 1;
      onProgress?.({ current, total: images.length, file, ok: false, message: e.message });
    }
  }

  return { total: images.length, succeeded, failed };
}

// ===== 프리뷰: 파일 저장 대신 PNG 버퍼 반환 =====
async function generatePreviewBuffer(inputPath, options, previewWidth = 800) {
  // 입력 메타 먼저 조회
  const inputMeta = await sharp(inputPath, { failOn: 'none' }).metadata();
  const targetW = inputMeta.width && inputMeta.width > previewWidth ? previewWidth : (inputMeta.width || previewWidth);

  // 프리뷰용으로 실제 리사이즈를 수행하여 새 베이스/메타 획득
  const baseBuf = await sharp(inputPath, { failOn: 'none' })
    .resize({ width: targetW })
    .toBuffer();
  let base = sharp(baseBuf, { failOn: 'none' });
  let meta = await base.metadata();

  const { text, fontSize, opacity, position, margin, logoBytes, textColor, fontFamily, shadowColor, shadowOffsetX, shadowOffsetY, shadowBlur, outlineColor, outlineWidth } = options;

  const m = clamp(Number(margin) || 0, 0, 1000);
  const baseW = meta.width || 0;
  const baseH = meta.height || 0;
  const boxW = clamp(baseW - m * 2, 1, baseW);
  const boxH = clamp(baseH - m * 2, 1, baseH);

  const effFont = effectiveFontSize(baseW, baseH, { fontSize, fontSizeMode: options.fontSizeMode });
  const effOpacity = clamp(Number(opacity) || 0.35, 0, 1);

  const composites = [];

  if (text) {
    const rawSvg = makeTextSVG(
      text,
      effFont,
      effOpacity,
      boxW,
      textColor,
      fontFamily,
      { color: shadowColor, offsetX: shadowOffsetX, offsetY: shadowOffsetY, blur: shadowBlur },
      { color: outlineColor, width: outlineWidth },
      baseW,  // 현재 이미지 너비
      baseW   // 기준 너비를 동일하게 주어 내부 스케일링 무효화
    );
    const safeSvg = await fitOverlayInside(rawSvg, boxW, boxH);

    const svgMeta = await sharp(safeSvg).metadata();
    let pos = position || 'southeast';
    if (pos === 'auto') pos = 'southeast';
    const { left: svgLeft, top: svgTop } = computeLeftTop(baseW, baseH, svgMeta.width || 0, svgMeta.height || 0, pos, m);
    composites.push({ input: safeSvg, left: svgLeft, top: svgTop });
  }

  const logoBuf = normalizeBuffer(logoBytes);
  if (logoBuf) {
    const safeLogo = await fitOverlayInside(logoBuf, boxW, boxH);
    const lmeta = await sharp(safeLogo).metadata();
    const pos2 = (position === 'auto' ? 'southeast' : (position || 'southeast'));
    const { left: logoLeft, top: logoTop } = computeLeftTop(baseW, baseH, lmeta.width || 0, lmeta.height || 0, pos2, m);
    composites.push({ input: safeLogo, left: logoLeft, top: logoTop, blend: 'over', opacity: effOpacity });
  }

  const pipeline = composites.length > 0 ? base.composite(composites) : base;
  return await pipeline.png().toBuffer();
}

// 워터마크 위치와 크기 정보 반환 (미리보기용)
async function getWatermarkPosition(inputPath, options, previewWidth = 800) {
  const { maxWidth } = options;
  
  // 실제 처리와 동일한 리사이징 로직 사용
  let probe = sharp(inputPath, { failOn: 'none' });
  let inputMeta = await probe.metadata();
  let img;
  
  if (maxWidth && inputMeta.width && inputMeta.width > maxWidth) {
    // 실제 처리에서 maxWidth로 리사이즈되는 경우
    const resizedBuf = await sharp(inputPath, { failOn: 'none' })
      .resize({ width: maxWidth })
      .toBuffer();
    img = sharp(resizedBuf, { failOn: 'none' });
  } else if (inputMeta.width && inputMeta.width > previewWidth) {
    // 미리보기를 위해 previewWidth로 리사이즈
    const resizedBuf = await sharp(inputPath, { failOn: 'none' })
      .resize({ width: previewWidth })
      .toBuffer();
    img = sharp(resizedBuf, { failOn: 'none' });
  } else {
    // 원본 크기 사용
    img = sharp(inputPath, { failOn: 'none' });
  }
  
  let meta = await img.metadata();

  const { text, fontSize, opacity, position, margin, logoBytes, textColor, fontFamily, shadowColor, shadowOffsetX, shadowOffsetY, shadowBlur, outlineColor, outlineWidth } = options;

  const m = clamp(Number(margin) || 0, 0, 1000);
  const baseW = meta.width || 0;
  const baseH = meta.height || 0;
  const boxW = clamp(baseW - m * 2, 1, baseW);
  const boxH = clamp(baseH - m * 2, 1, baseH);

  const effFont = effectiveFontSize(baseW, baseH, { fontSize, fontSizeMode: options.fontSizeMode });
  const effOpacity = clamp(Number(opacity) || 0.35, 0, 1);

  let watermarkInfo = null;

  if (text) {
    const rawSvg = makeTextSVG(
      text,
      effFont,
      effOpacity,
      boxW,
      textColor,
      fontFamily,
      { color: shadowColor, offsetX: shadowOffsetX, offsetY: shadowOffsetY, blur: shadowBlur },
      { color: outlineColor, width: outlineWidth },
      baseW,  // 현재 이미지 너비
      baseW   // 기준 너비를 동일하게 주어 내부 스케일링 무효화
    );
    const safeSvg = await fitOverlayInside(rawSvg, boxW, boxH);

    const svgMeta = await sharp(safeSvg).metadata();
    let pos = position || 'southeast';
    if (pos === 'auto') pos = 'southeast';
    const { left: svgLeft, top: svgTop } = computeLeftTop(baseW, baseH, svgMeta.width || 0, svgMeta.height || 0, pos, m);
    
    watermarkInfo = {
      left: svgLeft,
      top: svgTop,
      width: svgMeta.width || 0,
      height: svgMeta.height || 0,
      imageWidth: baseW,
      imageHeight: baseH
    };
    
    console.log('Watermark position calculated:', {
      imageSize: `${baseW}x${baseH}`,
      watermarkSize: `${svgMeta.width}x${svgMeta.height}`,
      position: `${svgLeft},${svgTop}`,
      originalSize: `${inputMeta.width}x${inputMeta.height}`,
      positionType: pos
    });
  }

  return watermarkInfo;
}

module.exports = { processFolderImages, generatePreviewBuffer, getWatermarkPosition };

// ====== Video helpers & processing ======

async function getVideoDimensions(inputPath) {
  return new Promise((resolve, reject) => {
    try {
      ffmpeg.ffprobe(inputPath, (err, data) => {
        if (err) return reject(err);
        const stream = (data.streams || []).find(s => s.codec_type === 'video');
        if (!stream) return reject(new Error('No video stream'));
        
        let width = Number(stream.width) || 0;
        let height = Number(stream.height) || 0;
        
        // 회전 정보 확인 (iPhone 세로 영상 등)
        const rotation = stream.side_data_list?.find(sd => sd.side_data_type === 'Display Matrix');
        const displayMatrix = stream.tags?.rotate || (rotation?.rotation);
        
        // 90도 또는 -90도 회전이면 width와 height 바꿈
        if (displayMatrix === '90' || displayMatrix === '-90' || displayMatrix === 90 || displayMatrix === -90) {
          [width, height] = [height, width];
          console.log(`Video rotation detected: ${displayMatrix}°, dimensions swapped to ${width}x${height}`);
        }
        
        resolve({ width, height });
      });
    } catch (e) {
      reject(e);
    }
  });
}

function makeTempFilePath(baseName) {
  const safe = baseName.replace(/[^a-zA-Z0-9_.-]/g, '_');
  return path.join(os.tmpdir(), `${Date.now()}_${Math.random().toString(36).slice(2)}_${safe}`);
}

async function writeBufferToFile(buf, targetPath) {
  await fs.promises.writeFile(targetPath, buf);
  return targetPath;
}

async function processOneVideo(inputPath, outputPath, options) {
  const { text, fontSize, position, margin, logoBytes, textColor, fontFamily, shadowColor, shadowOffsetX, shadowOffsetY, shadowBlur, outlineColor, outlineWidth } = options;

  if (!ffmpegPath) {
    throw new Error('ffmpeg binary not found. Please install ffmpeg or add ffmpeg-static dependency.');
  }

  const meta = await getVideoDimensions(inputPath);
  const baseW = meta.width || 0;
  const baseH = meta.height || 0;
  if (!baseW || !baseH) throw new Error('Failed to read video resolution');

  const m = clamp(Number(margin) || 0, 0, 1000);
  const boxW = clamp(baseW - m * 2, 1, baseW);
  const boxH = clamp(baseH - m * 2, 1, baseH);
  const effFont = effectiveFontSize(baseW, baseH, { fontSize, fontSizeMode: options.fontSizeMode });

  const overlays = [];

  // Text overlay
  if (text) {
    const rawSvg = makeTextSVG(
      text,
      effFont,
      1.0, // SVG 자체는 불투명도 1.0으로 생성
      boxW,
      textColor,
      fontFamily,
      { color: shadowColor, offsetX: shadowOffsetX, offsetY: shadowOffsetY, blur: shadowBlur },
      { color: outlineColor, width: outlineWidth },
      baseW,
      baseW
    );
    const safeSvg = await fitOverlayInside(rawSvg, boxW, boxH);
    const svgMeta = await sharp(safeSvg).metadata();
    let pos = position === 'auto' ? 'southeast' : (position || 'southeast');
    const { left, top } = computeLeftTop(baseW, baseH, svgMeta.width || 0, svgMeta.height || 0, pos, m);
    const tmp = makeTempFilePath('wm_text.png');
    await writeBufferToFile(safeSvg, tmp);
    const opacity = clamp(Number(options.opacity) || 0.35, 0, 1);
    overlays.push({ path: tmp, x: left, y: top, applyAlpha: true, alpha: opacity });
  }

  // Logo overlay
  const logoBuf = normalizeBuffer(logoBytes);
  if (logoBuf) {
    const safeLogo = await fitOverlayInside(logoBuf, boxW, boxH);
    const lmeta = await sharp(safeLogo).metadata();
    let pos = position === 'auto' ? 'southeast' : position;
    const { left, top } = computeLeftTop(baseW, baseH, lmeta.width || 0, lmeta.height || 0, pos, m);
    const tmp = makeTempFilePath('wm_logo.png');
    await writeBufferToFile(safeLogo, tmp);
    overlays.push({ path: tmp, x: left, y: top, applyAlpha: true, alpha: clamp(Number(options.opacity) || 0.35, 0, 1) });
  }

  // Build ffmpeg command - 회전 메타데이터는 유지하되 실제 회전은 하지 않음
  await new Promise((resolve, reject) => {
    const cmd = ffmpeg();
    cmd.input(inputPath);
    overlays.forEach(ov => cmd.input(ov.path));

    const filterParts = [];
    
    // 입력 비디오는 원본 그대로 사용 (회전하지 않음)
    let prev = '[0:v]';
    
    // Build overlay chain
    overlays.forEach((ov, idx) => {
      const inLabel = `[${idx + 1}:v]`;
      const outLabel = (idx === overlays.length - 1) ? '[vout]' : `[v${idx + 1}]`;
      
      // Apply alpha if needed
      if (ov.applyAlpha && ov.alpha < 1) {
        filterParts.push(`${inLabel}format=rgba,colorchannelmixer=aa=${ov.alpha.toFixed(3)}[alpha${idx}]`);
        filterParts.push(`${prev}[alpha${idx}]overlay=${Math.round(ov.x)}:${Math.round(ov.y)}${outLabel}`);
      } else {
        filterParts.push(`${prev}${inLabel}overlay=${Math.round(ov.x)}:${Math.round(ov.y)}${outLabel}`);
      }
      prev = outLabel;
    });

    if (overlays.length > 0) {
      const filterComplex = filterParts.join(';');
      cmd.complexFilter(filterComplex);
      cmd.outputOptions([
        '-map', '[vout]',
        '-map', '0:a?',
        '-c:v', 'libx264',
        '-crf', '20',
        '-preset', 'veryfast',
        '-c:a', 'copy',
        '-movflags', '+faststart'
      ]);
    } else {
      // No overlays, just copy
      cmd.outputOptions([
        '-map', '0:v',
        '-map', '0:a?',
        '-c:v', 'copy',
        '-c:a', 'copy'
      ]);
    }

    // Add detailed error logging
    cmd.on('start', (commandLine) => {
      console.log('FFmpeg command:', commandLine);
    });
    cmd.on('stderr', (stderrLine) => {
      console.log('FFmpeg stderr:', stderrLine);
    });
    cmd.on('end', () => resolve()).on('error', (e) => reject(e)).save(outputPath);
  }).finally(async () => {
    // cleanup temp files
    for (const ov of overlays) {
      try { await fs.promises.unlink(ov.path); } catch (_) {}
    }
  });
}

async function processFolderVideos(inDir, outDir, options, onProgress) {
  const files = fs.readdirSync(inDir);
  const videos = files.filter(f => VIDEO_EXT.has(path.extname(f).toLowerCase()));
  let current = 0, succeeded = 0, failed = 0;

  // 동영상별 위치 정보 맵 (이미지와 동일한 규칙)
  const videoPositionsMap = new Map();
  if (options.imagePositions && Array.isArray(options.imagePositions)) {
    options.imagePositions.forEach(({ filePath, position }) => {
      const fileName = path.basename(filePath);
      videoPositionsMap.set(filePath, position);
      videoPositionsMap.set(fileName, position);
    });
  }

  for (const file of videos) {
    current += 1;
    const inputPath = path.join(inDir, file);
    const outputPath = path.join(outDir, file);
    try {
      // 개별 위치 설정 적용
      let vidOptions = { ...options };
      const videoPosition = videoPositionsMap.get(inputPath) || videoPositionsMap.get(file) || videoPositionsMap.get(path.basename(inputPath));
      if (videoPosition) {
        if (videoPosition.type === 'custom') {
          vidOptions.position = videoPosition; // ratioX/ratioY 지원
        } else {
          vidOptions.position = videoPosition.type;
        }
      }
      await processOneVideo(inputPath, outputPath, vidOptions);
      succeeded += 1;
      onProgress?.({ current, total: videos.length, file, ok: true });
    } catch (e) {
      failed += 1;
      onProgress?.({ current, total: videos.length, file, ok: false, message: e.message });
    }
  }

  return { total: videos.length, succeeded, failed };
}

// 동영상 프리뷰용 첫 프레임 추출
async function extractVideoFrame(inputPath, options, previewWidth = 800) {
  if (!ffmpegPath) {
    throw new Error('ffmpeg binary not found');
  }

  const meta = await getVideoDimensions(inputPath);
  const baseW = meta.width || 0;
  const baseH = meta.height || 0;
  if (!baseW || !baseH) throw new Error('Failed to read video resolution');

  const targetW = baseW > previewWidth ? previewWidth : baseW;
  const targetH = Math.round((targetW / baseW) * baseH);

  const framePath = makeTempFilePath('frame.jpg');
  
  // 프리뷰에서는 회전하지 않고 원본 그대로 사용
  await new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .seekInput('00:00:01') // 1초 지점에서 프레임 추출
      .outputOptions([
        '-vframes', '1',
        '-vf', `scale=${targetW}:${targetH}`,
        '-f', 'image2'
      ])
      .on('end', () => resolve())
      .on('error', (e) => reject(e))
      .save(framePath);
  });

  // 동영상별 개별 위치 설정 적용
  let frameOptions = { ...options };
  if (options.imagePositions && Array.isArray(options.imagePositions)) {
    const videoPositionsMap = new Map();
    options.imagePositions.forEach(({ filePath, position }) => {
      // 브라우저 호환 파일명 추출
      const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || filePath;
      videoPositionsMap.set(filePath, position);
      videoPositionsMap.set(fileName, position);
    });
    
    // 브라우저 호환 파일명 추출
    const inputFileName = inputPath.split('/').pop() || inputPath.split('\\').pop() || inputPath;
    const videoPosition = videoPositionsMap.get(inputPath) || 
                         videoPositionsMap.get(inputFileName);
    
    // 디버깅: 동영상 위치 정보 확인
    if (videoPosition) {
      console.log(`Found video position for ${inputFileName}:`, videoPosition);
    }
    
    if (videoPosition) {
      if (videoPosition.type === 'custom') {
        frameOptions.position = videoPosition;
      } else {
        frameOptions.position = videoPosition.type;
      }
    }
  }

  // 프레임에 워터마크 적용 (개별 위치 설정 반영)
  const frameWithWatermark = await generatePreviewBuffer(framePath, frameOptions, targetW);
  
  // 임시 파일 정리
  try { await fs.promises.unlink(framePath); } catch (_) {}
  
  return frameWithWatermark;
}

module.exports.processFolderVideos = processFolderVideos;
module.exports.extractVideoFrame = extractVideoFrame;
module.exports.ffmpegPath = ffmpegPath;
module.exports.ffprobePath = ffprobePath;

// 동영상 프리뷰용 워터마크 위치/크기 정보 반환
async function getVideoWatermarkPosition(inputPath, options, previewWidth = 800) {
  const meta = await getVideoDimensions(inputPath);
  const baseW = meta.width || 0;
  const baseH = meta.height || 0;
  if (!baseW || !baseH) throw new Error('Failed to read video resolution');

  // 프리뷰로 쓰일 프레임 해상도 (extractVideoFrame과 동일 로직)
  const targetW = baseW > previewWidth ? previewWidth : baseW;
  const targetH = Math.round((targetW / baseW) * baseH);

  // 동영상별 개별 위치 설정 적용 (extractVideoFrame과 동일 매핑)
  let frameOptions = { ...options };
  if (options.imagePositions && Array.isArray(options.imagePositions)) {
    const videoPositionsMap = new Map();
    options.imagePositions.forEach(({ filePath, position }) => {
      const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || filePath;
      videoPositionsMap.set(filePath, position);
      videoPositionsMap.set(fileName, position);
    });

    const inputFileName = inputPath.split('/').pop() || inputPath.split('\\').pop() || inputPath;
    const videoPosition = videoPositionsMap.get(inputPath) || videoPositionsMap.get(inputFileName);
    if (videoPosition) {
      frameOptions.position = (videoPosition.type === 'custom') ? videoPosition : videoPosition.type;
    }
  }

  const m = clamp(Number(frameOptions.margin) || 0, 0, 1000);
  const boxW = clamp(targetW - m * 2, 1, targetW);
  const boxH = clamp(targetH - m * 2, 1, targetH);

  const effFont = effectiveFontSize(targetW, targetH, { fontSize: frameOptions.fontSize, fontSizeMode: frameOptions.fontSizeMode });

  if (!frameOptions.text) {
    return { left: 0, top: 0, width: 0, height: 0, imageWidth: targetW, imageHeight: targetH };
  }

  const rawSvg = makeTextSVG(
    frameOptions.text,
    effFont,
    1.0,
    boxW,
    frameOptions.textColor,
    frameOptions.fontFamily,
    { color: frameOptions.shadowColor, offsetX: frameOptions.shadowOffsetX, offsetY: frameOptions.shadowOffsetY, blur: frameOptions.shadowBlur },
    { color: frameOptions.outlineColor, width: frameOptions.outlineWidth },
    targetW,
    targetW
  );
  const safeSvg = await fitOverlayInside(rawSvg, boxW, boxH);
  const svgMeta = await sharp(safeSvg).metadata();

  let pos = frameOptions.position || 'southeast';
  if (pos === 'auto') pos = 'southeast';
  const { left, top } = computeLeftTop(targetW, targetH, svgMeta.width || 0, svgMeta.height || 0, pos, m);

  return {
    left,
    top,
    width: svgMeta.width || 0,
    height: svgMeta.height || 0,
    imageWidth: targetW,
    imageHeight: targetH,
  };
}

module.exports.getVideoWatermarkPosition = getVideoWatermarkPosition;
