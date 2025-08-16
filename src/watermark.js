// src/watermark.js
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']); // extend if needed

// 안전 여백/치수 클램프
function clamp(num, min, max) {
  return Math.max(min, Math.min(max, num));
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
  const svgH = clamp(Math.floor(scaledFontSize * 1.6), 30, 2000); // 스케일된 폰트 크기 기준
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
    <text x="0" y="${Math.round(scaledFontSize * 1.1)}" class="t" ${filterAttr} fill-opacity="${opacity}">${esc(text)}</text>
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
  } else if (position === 'custom' && (customX !== undefined || customY !== undefined)) {
    left = Number(customX) || 0;
    top = Number(customY) || 0;
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
      case 'northwest':
        left = m;
        top = m;
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
  const { text, fontSize, opacity, position, margin, maxWidth, logoBytes, textColor, fontFamily, shadowColor, shadowOffsetX, shadowOffsetY, shadowBlur, outlineColor, outlineWidth, customX, customY } = opts;

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

  const composites = [];

  // 3) 텍스트 SVG (이미지 크기에 맞춰 스케일링)
  if (text) {
    const rawSvg = makeTextSVG(
      text,
      Number(fontSize) || 36,
      clamp(Number(opacity) || 0.35, 0, 1),
      boxW,
      textColor,
      fontFamily,
      { color: shadowColor, offsetX: shadowOffsetX, offsetY: shadowOffsetY, blur: shadowBlur },
      { color: outlineColor, width: outlineWidth },
      baseW,  // 현재 이미지 너비
      800     // 기준 너비 (미리보기 크기)
    );
    // SVG도 합성 전 안전 박스 크기(boxW x boxH) 안으로 축소
    const safeSvg = await fitOverlayInside(rawSvg, boxW, boxH);

    const svgMeta = await sharp(safeSvg).metadata();
    let pos = position;
    if (pos === 'auto') {
      pos = await pickAutoPosition(img, baseW, baseH, svgMeta.width || 0, svgMeta.height || 0, m, textColor);
    }
    const { left: svgLeft, top: svgTop } = computeLeftTop(baseW, baseH, svgMeta.width || 0, svgMeta.height || 0, pos, m, customX, customY);
    
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
    const { left: logoLeft, top: logoTop } = computeLeftTop(baseW, baseH, lmeta.width || 0, lmeta.height || 0, position, m, customX, customY);
    composites.push({
      input: safeLogo,
      left: logoLeft,
      top: logoTop,
      blend: 'over',
      opacity: clamp(Number(opacity) || 0.35, 0, 1),
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

  const { text, fontSize, opacity, position, margin, logoBytes, textColor, fontFamily, shadowColor, shadowOffsetX, shadowOffsetY, shadowBlur, outlineColor, outlineWidth, customX, customY } = options;

  const m = clamp(Number(margin) || 0, 0, 1000);
  const baseW = meta.width || 0;
  const baseH = meta.height || 0;
  const boxW = clamp(baseW - m * 2, 1, baseW);
  const boxH = clamp(baseH - m * 2, 1, baseH);

  const composites = [];

  if (text) {
    const rawSvg = makeTextSVG(
      text,
      Number(fontSize) || 36,
      clamp(Number(opacity) || 0.35, 0, 1),
      boxW,
      textColor,
      fontFamily,
      { color: shadowColor, offsetX: shadowOffsetX, offsetY: shadowOffsetY, blur: shadowBlur },
      { color: outlineColor, width: outlineWidth },
      baseW,  // 현재 이미지 너비
      800     // 기준 너비 (미리보기 크기)
    );
    const safeSvg = await fitOverlayInside(rawSvg, boxW, boxH);

    const svgMeta = await sharp(safeSvg).metadata();
    let pos = position;
    if (pos === 'auto') {
      pos = await pickAutoPosition(base, baseW, baseH, svgMeta.width || 0, svgMeta.height || 0, m, textColor);
    }
    const { left: svgLeft, top: svgTop } = computeLeftTop(baseW, baseH, svgMeta.width || 0, svgMeta.height || 0, pos, m, customX, customY);
    composites.push({ input: safeSvg, left: svgLeft, top: svgTop });
  }

  const logoBuf = normalizeBuffer(logoBytes);
  if (logoBuf) {
    const safeLogo = await fitOverlayInside(logoBuf, boxW, boxH);
    const lmeta = await sharp(safeLogo).metadata();
    const { left: logoLeft, top: logoTop } = computeLeftTop(baseW, baseH, lmeta.width || 0, lmeta.height || 0, position, m, customX, customY);
    composites.push({ input: safeLogo, left: logoLeft, top: logoTop, blend: 'over', opacity: clamp(Number(opacity) || 0.35, 0, 1) });
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

  const { text, fontSize, opacity, position, margin, logoBytes, textColor, fontFamily, shadowColor, shadowOffsetX, shadowOffsetY, shadowBlur, outlineColor, outlineWidth, customX, customY } = options;

  const m = clamp(Number(margin) || 0, 0, 1000);
  const baseW = meta.width || 0;
  const baseH = meta.height || 0;
  const boxW = clamp(baseW - m * 2, 1, baseW);
  const boxH = clamp(baseH - m * 2, 1, baseH);

  let watermarkInfo = null;

  if (text) {
    const rawSvg = makeTextSVG(
      text,
      Number(fontSize) || 36,
      clamp(Number(opacity) || 0.35, 0, 1),
      boxW,
      textColor,
      fontFamily,
      { color: shadowColor, offsetX: shadowOffsetX, offsetY: shadowOffsetY, blur: shadowBlur },
      { color: outlineColor, width: outlineWidth },
      baseW,  // 현재 이미지 너비
      800     // 기준 너비 (미리보기 크기)
    );
    const safeSvg = await fitOverlayInside(rawSvg, boxW, boxH);

    const svgMeta = await sharp(safeSvg).metadata();
    let pos = position;
    if (pos === 'auto') {
      pos = await pickAutoPosition(img, baseW, baseH, svgMeta.width || 0, svgMeta.height || 0, m, textColor);
    }
    const { left: svgLeft, top: svgTop } = computeLeftTop(baseW, baseH, svgMeta.width || 0, svgMeta.height || 0, pos, m, customX, customY);
    
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
