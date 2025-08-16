// src/watermark.js
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']); // extend if needed

// 안전 여백/치수 클램프
function clamp(num, min, max) {
  return Math.max(min, Math.min(max, num));
}

// 텍스트용 SVG를 "최대 폭" 안으로 생성
function makeTextSVG(text, fontSize, opacity, maxWidthPx, textColor, fontFamily, shadow, outline) {
  const esc = (s) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const svgW = clamp(Math.floor(maxWidthPx || 400), 50, 10000);    // 최소 50px
  const svgH = clamp(Math.floor((fontSize || 36) * 1.6), 30, 2000); // 대략 줄 높이
  const color = (textColor || '#ffffff');
  const ff = (fontFamily || "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif");
  const s = shadow || { color: '#000000', offsetX: 2, offsetY: 2, blur: 0 };
  const o = outline || { color: '', width: 0 };
  const filterId = 'f1';
  const shadowFilter = s && (s.blur > 0 || s.offsetX || s.offsetY) ? `
      <filter id="${filterId}" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="${Number(s.offsetX)||0}" dy="${Number(s.offsetY)||0}" stdDeviation="${Number(s.blur)||0}" flood-color="${s.color||'#000'}" flood-opacity="${opacity}" />
      </filter>` : '';
  const filterAttr = shadowFilter ? `filter="url(#${filterId})"` : '';
  const strokeStyle = (o && Number(o.width) > 0) ? `stroke:${o.color||'#000000'};stroke-width:${Number(o.width)}px;paint-order:stroke;stroke-linejoin:round;` : '';
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">
    <defs>${shadowFilter}</defs>
    <style>
      .t { font: ${fontSize}px ${ff}; fill: ${color}; fill-opacity: ${opacity}; ${strokeStyle} }
    </style>
    <text x="0" y="${Math.round((fontSize || 36) * 1.1)}" class="t" ${filterAttr}>${esc(text)}</text>
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
function computeLeftTop(baseW, baseH, overlayW, overlayH, position, margin) {
  const m = clamp(Number(margin) || 0, 0, 1000);
  let left = 0, top = 0;
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

  const composites = [];

  // 3) 텍스트 SVG
  if (text) {
    const rawSvg = makeTextSVG(
      text,
      Number(fontSize) || 36,
      clamp(Number(opacity) || 0.35, 0, 1),
      boxW,
      textColor,
      fontFamily,
      { color: shadowColor, offsetX: shadowOffsetX, offsetY: shadowOffsetY, blur: shadowBlur },
      { color: outlineColor, width: outlineWidth }
    );
    // SVG도 합성 전 안전 박스 크기(boxW x boxH) 안으로 축소
    const safeSvg = await fitOverlayInside(rawSvg, boxW, boxH);

    const svgMeta = await sharp(safeSvg).metadata();
    const { left: svgLeft, top: svgTop } = computeLeftTop(baseW, baseH, svgMeta.width || 0, svgMeta.height || 0, position, m);
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
    const { left: logoLeft, top: logoTop } = computeLeftTop(baseW, baseH, lmeta.width || 0, lmeta.height || 0, position, m);
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

  for (const file of images) {
    current += 1;
    const inputPath = path.join(inDir, file);
    const outputPath = path.join(outDir, file);

    try {
      await watermarkOne(inputPath, outputPath, options);
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
      { color: outlineColor, width: outlineWidth }
    );
    const safeSvg = await fitOverlayInside(rawSvg, boxW, boxH);

    const svgMeta = await sharp(safeSvg).metadata();
    const { left: svgLeft, top: svgTop } = computeLeftTop(baseW, baseH, svgMeta.width || 0, svgMeta.height || 0, position, m);
    composites.push({ input: safeSvg, left: svgLeft, top: svgTop });
  }

  const logoBuf = normalizeBuffer(logoBytes);
  if (logoBuf) {
    const safeLogo = await fitOverlayInside(logoBuf, boxW, boxH);
    const lmeta = await sharp(safeLogo).metadata();
    const { left: logoLeft, top: logoTop } = computeLeftTop(baseW, baseH, lmeta.width || 0, lmeta.height || 0, position, m);
    composites.push({ input: safeLogo, left: logoLeft, top: logoTop, blend: 'over', opacity: clamp(Number(opacity) || 0.35, 0, 1) });
  }

  const pipeline = composites.length > 0 ? base.composite(composites) : base;
  return await pipeline.png().toBuffer();
}

module.exports = { processFolderImages, generatePreviewBuffer };
