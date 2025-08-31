// src/watermark.js
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const os = require('os');
const { execSync } = require('child_process');
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

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.tiff', '.tif', '.bmp', '.gif']); // 더 많은 형식 지원
const VIDEO_EXT = new Set(['.mp4', '.mov', '.m4v', '.mkv', '.webm', '.avi']);

// 안전 여백/치수 클램프
function clamp(num, min, max) {
  return Math.max(min, Math.min(max, num));
}

// macOS sips를 이용한 HEIC 변환 함수
async function convertHeicWithSips(inputPath) {
  // macOS 환경 체크
  if (process.platform !== 'darwin') {
    throw new Error('sips is only available on macOS');
  }
  
  try {
    // sips 명령어 존재 확인
    execSync('which sips', { stdio: 'ignore' });
  } catch (error) {
    throw new Error('sips command not found');
  }
  
  // 임시 출력 파일 경로 생성
  const tempDir = os.tmpdir();
  const tempFileName = `heic_converted_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`;
  const tempOutputPath = path.join(tempDir, tempFileName);
  
  try {
    console.log('Converting HEIC with macOS sips:', inputPath);
    
    // sips로 HEIC → JPEG 변환
    const command = `sips -s format jpeg "${inputPath}" --out "${tempOutputPath}"`;
    execSync(command, { stdio: 'pipe' });
    
    // 변환된 파일이 존재하는지 확인
    if (!fs.existsSync(tempOutputPath)) {
      throw new Error('sips conversion failed - output file not created');
    }
    
    console.log('sips conversion successful:', tempOutputPath);
    return tempOutputPath;
  } catch (error) {
    // 실패 시 임시 파일 정리
    try {
      if (fs.existsSync(tempOutputPath)) {
        fs.unlinkSync(tempOutputPath);
      }
    } catch (_) {}
    
    throw new Error(`sips conversion failed: ${error.message}`);
  }
}

// 임시 파일 정리 함수
function cleanupTempFile(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log('Cleaned up temp file:', filePath);
    }
  } catch (error) {
    console.warn('Failed to cleanup temp file:', filePath, error.message);
  }
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

// 로고 크기 계산 (텍스트와 동일한 로직)
function effectiveLogoSize(baseW, baseH, { logoSize, logoSizeMode }) {
  const shortEdge = Math.max(1, Math.min(baseW || 0, baseH || 0));
  
  if ((logoSizeMode || 'percent') === 'percent') {
    const pct = Number(logoSize);
    const raw = (isFinite(pct) ? pct : 15) / 100 * shortEdge;
    return clamp(Math.round(raw), 10, Math.min(baseW, baseH) * 0.8); // 최대 이미지 크기의 80%
  } else {
    return clamp(Math.round(Number(logoSize) || 150), 10, Math.min(baseW, baseH) * 0.8);
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
  if (!bytes) {
    console.log('normalizeBuffer: No bytes provided');
    return null;
  }
  
  try {
    if (Buffer.isBuffer(bytes)) {
      console.log('normalizeBuffer: Input is already a Buffer, size:', bytes.length);
      return bytes;
    }
    
    if (bytes instanceof Uint8Array) {
      console.log('normalizeBuffer: Converting Uint8Array to Buffer, size:', bytes.length);
      return Buffer.from(bytes);
    }
    
    if (ArrayBuffer.isView(bytes) || bytes instanceof ArrayBuffer) {
      console.log('normalizeBuffer: Converting ArrayBuffer/TypedArray to Buffer');
      return Buffer.from(bytes);
    }
    
    console.log('normalizeBuffer: Unknown buffer type, attempting conversion');
    return Buffer.from(bytes);
  } catch (error) {
    console.error('normalizeBuffer: Error converting bytes to Buffer:', error);
    return null;
  }
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
    // margin을 고려한 유효 영역 계산
    const effectiveW = Math.max(0, baseW - 2 * m);
    const effectiveH = Math.max(0, baseH - 2 * m);
    
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
        left = m + Math.floor((effectiveW - overlayW) / 2);
        top = m;
        break;
      case 'northwest':
        left = m;
        top = m;
        break;
      case 'south':
        left = m + Math.floor((effectiveW - overlayW) / 2);
        top = baseH - overlayH - m;
        break;
      case 'east':
        left = baseW - overlayW - m;
        top = m + Math.floor((effectiveH - overlayH) / 2);
        break;
      case 'west':
        left = m;
        top = m + Math.floor((effectiveH - overlayH) / 2);
        break;
      case 'center':
      default:
        // center의 경우 margin 영역을 제외한 중앙에 배치
        left = m + Math.floor((effectiveW - overlayW) / 2);
        top = m + Math.floor((effectiveH - overlayH) / 2);
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

  // 임시 파일 경로 변수를 함수 최상위에서 선언
  let tempConvertedPath = null;
  let meta = null;
  
  // orientation 6 수정 정보 저장 (HEIC 처리 과정에서 설정됨)
  let wasOrientation6Corrected = false;
  let originalCorrectedWidth = 0;
  let originalCorrectedHeight = 0;

  // 1) 베이스 생성 및 (옵션) 리사이즈
  let probe;
  try {
    // 파일명으로 macOS 메타데이터 파일 확인
    const fileName = require('path').basename(inputPath);
    if (fileName.startsWith('._')) {
      throw new Error(`Skipping macOS metadata file: ${fileName}`);
    }
    
    probe = sharp(inputPath, { failOn: 'none' });
    meta = await probe.metadata();
    const originalMeta = meta; // 원본 메타 보존
    
    // HEIC/HEIF 파일인 경우 특별 처리
    const ext = require('path').extname(inputPath).toLowerCase();
    
    if (ext === '.heic' || ext === '.heif') {
      console.log('Processing HEIC/HEIF file:', inputPath);
      console.log('Original metadata:', meta);
      
      if (meta && meta.width && meta.height) {
        console.log('HEIC file has valid metadata, attempting conversion...');
        
        // macOS 환경에서 sips 우선 시도
        if (process.platform === 'darwin') {
          try {
            console.log('Attempting HEIC conversion with macOS sips...');
            tempConvertedPath = await convertHeicWithSips(inputPath);
            
            // 변환된 파일로 probe 재설정
            probe = sharp(tempConvertedPath, { failOn: 'none' });
            meta = await probe.metadata();

            // HEIC 세로 이미지 처리: 원본이 세로였는데 변환 후 가로라면 픽셀을 270° 회전해 세로로 복원
            const originalIsPortrait = originalMeta.height > originalMeta.width;
            const convertedIsLandscape = meta.width > meta.height;
            if (originalIsPortrait && convertedIsLandscape) {
              probe = sharp(tempConvertedPath, { failOn: 'none' }).rotate(270);
              const rotatedMeta = await probe.metadata();
              meta = rotatedMeta;
              wasOrientation6Corrected = true;
              originalCorrectedWidth = meta.width;
              originalCorrectedHeight = meta.height;
              console.log('Applied 270° rotation to restore portrait:', { width: meta.width, height: meta.height });
            } else if (meta.orientation === 6) {
              // 보수적 처리: EXIF가 남아있다면 auto-rotate 적용
              probe = sharp(tempConvertedPath, { failOn: 'none' }).rotate();
              meta = await probe.metadata();
              wasOrientation6Corrected = true;
              originalCorrectedWidth = meta.width;
              originalCorrectedHeight = meta.height;
              console.log('Applied auto-rotation for orientation 6:', { width: meta.width, height: meta.height });
            }
            
            console.log('sips conversion successful with auto-rotation, new metadata:', meta);
          } catch (sipsError) {
            console.log('sips conversion failed, trying Sharp fallback:', sipsError.message);
            
            // sips 실패 시 Sharp로 시도 (원본 메타데이터 사용)
            const originalMeta = await sharp(inputPath, { failOn: 'none' }).metadata();
            const isHEVC = originalMeta.compression === 'hevc';
            if (isHEVC) {
              throw new Error(`HEVC 압축 HEIC 파일 변환에 실패했습니다. 파일을 수동으로 JPEG로 변환 후 다시 시도해주세요. (파일: ${require('path').basename(inputPath)})`);
            } else {
              // 비HEVC 파일은 Sharp로 시도 (EXIF 회전 정보 적용)
              try {
                const convertedBuffer = await sharp(inputPath, { 
                  failOn: 'none',
                  unlimited: true,
                  sequentialRead: true
                }).rotate().jpeg({ quality: 95 }).toBuffer();
                
                probe = sharp(convertedBuffer, { failOn: 'none' });
                meta = await probe.metadata();
                console.log('Sharp fallback conversion successful with auto-rotation');
              } catch (sharpError) {
                throw new Error(`HEIC 파일 변환에 실패했습니다: ${sharpError.message}`);
              }
            }
          }
        } else {
          // 비macOS 환경에서는 Sharp만 사용 (원본 메타데이터 사용)
          const originalMeta = await sharp(inputPath, { failOn: 'none' }).metadata();
          const isHEVC = originalMeta.compression === 'hevc';
          if (isHEVC) {
            throw new Error(`HEVC 압축 HEIC 파일은 macOS가 아닌 환경에서 지원되지 않습니다. 파일을 JPEG로 변환 후 다시 시도해주세요. (파일: ${require('path').basename(inputPath)})`);
          } else {
            try {
              const convertedBuffer = await sharp(inputPath, { 
                failOn: 'none',
                unlimited: true,
                sequentialRead: true
              }).rotate().jpeg({ quality: 95 }).toBuffer();
              
              probe = sharp(convertedBuffer, { failOn: 'none' });
              meta = await probe.metadata();
              console.log('Sharp conversion successful with auto-rotation (non-macOS)');
            } catch (sharpError) {
              throw new Error(`HEIC 파일 변환에 실패했습니다: ${sharpError.message}`);
            }
          }
        }
      } else {
        throw new Error(`Invalid HEIC file: ${require('path').basename(inputPath)}`);
      }
    }
  } catch (error) {
    // 에러 발생 시 임시 파일 정리
    if (tempConvertedPath) {
      cleanupTempFile(tempConvertedPath);
    }
    console.error('Error processing input file:', inputPath, error.message);
    throw new Error(`Unsupported image format or corrupted file: ${require('path').basename(inputPath)}`);
  }
  
  let img;
  
  if (maxWidth && meta.width && meta.width > maxWidth) {
    const resizedBuf = await probe
      .resize({ width: maxWidth })
      .toBuffer();
    img = sharp(resizedBuf, { failOn: 'none' });
    meta = await img.metadata(); // 리사이즈 후 실제 메타
    
    // orientation 6 수정이 있었다면 비율에 맞게 다시 적용
    if (wasOrientation6Corrected) {
      const scale = meta.width / originalCorrectedWidth;
      meta.width = originalCorrectedWidth * scale;
      meta.height = originalCorrectedHeight * scale;
      console.log('Re-applied orientation 6 correction after resize:', { width: meta.width, height: meta.height });
    }
  } else {
    img = probe;
    // meta는 이미 위에서 가져온 메타 사용
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
  console.log('Processing logo:', logoBuf ? 'Logo buffer exists' : 'No logo buffer');
  if (logoBuf) {
    console.log('Logo buffer size:', logoBuf.length);
    
    // 로고 목표 크기 계산 - 원본 이미지 크기 기준으로 계산
    // orientation 6 수정이 있었다면 원본 크기 사용
    console.log('Logo size calculation debug:', {
      wasOrientation6Corrected,
      originalCorrectedWidth,
      originalCorrectedHeight,
      metaWidth: meta.width,
      metaHeight: meta.height
    });
    const originalW = wasOrientation6Corrected ? originalCorrectedWidth : (meta.width || 0);
    const originalH = wasOrientation6Corrected ? originalCorrectedHeight : (meta.height || 0);
    const targetLogoSize = effectiveLogoSize(originalW, originalH, { logoSize: opts.logoSize, logoSizeMode: opts.logoSizeMode });
    console.log('Target logo size:', targetLogoSize, 'px');
    
    // 로고를 PNG로 변환하고 크기 조정
    const pngLogo = await sharp(logoBuf)
      .png()
      .resize({ width: targetLogoSize, height: targetLogoSize, fit: 'inside', withoutEnlargement: false })
      .toBuffer();
    
    // 안전 박스 크기 체크 (이미 리사이즈했지만 추가 안전 처리)
    const safeLogo = await fitOverlayInside(pngLogo, boxW, boxH);
    const lmeta = await sharp(safeLogo).metadata();
    console.log('Logo metadata:', { width: lmeta.width, height: lmeta.height });
    // 로고 위치 계산 - 텍스트와 겹치지 않도록 조정
    let logoPosition = position;
    if (logoPosition === 'auto') logoPosition = 'southeast';
    
    // 텍스트가 있는 경우 로고 위치를 조정
    if (text && typeof position === 'string' && position !== 'custom') {
      switch(logoPosition) {
        case 'southeast':
          logoPosition = 'southwest'; // 텍스트가 southeast에 있으면 로고는 southwest
          break;
        case 'southwest':
          logoPosition = 'southeast';
          break;
        case 'northeast':
          logoPosition = 'northwest';
          break;
        case 'northwest':
          logoPosition = 'northeast';
          break;
        default:
          logoPosition = 'northwest'; // center나 다른 경우
      }
      console.log('Logo position adjusted to avoid text overlap:', logoPosition);
    }
    
    const { left: logoLeft, top: logoTop } = computeLeftTop(baseW, baseH, lmeta.width || 0, lmeta.height || 0, logoPosition, m);
    console.log('Logo position:', { left: logoLeft, top: logoTop });
    // 로고 불투명도 (텍스트 불투명도와 별도)
    const logoOpacity = clamp(Number(opts.logoOpacity) || 0.8, 0, 1);
    console.log('Logo opacity:', logoOpacity);
    
    composites.push({
      input: safeLogo,
      left: logoLeft,
      top: logoTop,
      blend: 'over',
      opacity: logoOpacity,
    });
    console.log('Logo composite added to list');
  }

  // 5) 저장 (오버레이 없으면 원본 그대로 저장)
  const outputExt = require('path').extname(outputPath).toLowerCase();
  console.log('Saving output file:', outputPath, 'format:', outputExt);
  
  if (composites.length > 0) {
    // 출력 형식에 따라 품질 설정
    let pipeline = img.composite(composites);
    
    if (outputExt === '.jpg' || outputExt === '.jpeg') {
      pipeline = pipeline.jpeg({ quality: 95 });
    } else if (outputExt === '.png') {
      pipeline = pipeline.png({ quality: 95 });
    } else if (outputExt === '.webp') {
      pipeline = pipeline.webp({ quality: 95 });
    } else if (outputExt === '.heic' || outputExt === '.heif') {
      // HEIC 입력이었더라도 JPEG로 출력 (호환성 및 워터마크 지원)
      const jpegPath = outputPath.replace(/\.heic?$/i, '.jpg');
      console.log('Converting HEIC output to JPEG for better compatibility:', jpegPath);
      pipeline = pipeline.jpeg({ quality: 95, mozjpeg: true });
      await pipeline.toFile(jpegPath);
      return;
    } else if (outputExt === '.tiff' || outputExt === '.tif') {
      pipeline = pipeline.tiff({ quality: 95 });
    } else if (outputExt === '.bmp') {
      // BMP는 품질 설정이 없음
      pipeline = pipeline.png(); // BMP 대신 PNG로 저장 (더 효율적)
      const pngPath = outputPath.replace(/\.bmp$/i, '.png');
      console.log('Converting BMP output to PNG:', pngPath);
      await pipeline.toFile(pngPath);
      return;
    } else if (outputExt === '.gif') {
      // GIF는 정적 이미지로 변환
      pipeline = pipeline.png();
      const pngPath = outputPath.replace(/\.gif$/i, '.png');
      console.log('Converting GIF output to PNG:', pngPath);
      await pipeline.toFile(pngPath);
      return;
    }
    
    await pipeline.toFile(outputPath);
  } else {
    // 오버레이가 없는 경우도 형식 변환 적용
    let pipeline = img;
    
    if (outputExt === '.jpg' || outputExt === '.jpeg') {
      pipeline = pipeline.jpeg({ quality: 95 });
    } else if (outputExt === '.png') {
      pipeline = pipeline.png({ quality: 95 });
    } else if (outputExt === '.webp') {
      pipeline = pipeline.webp({ quality: 95 });
    } else if (outputExt === '.heic' || outputExt === '.heif') {
      const jpegPath = outputPath.replace(/\.heic?$/i, '.jpg');
      console.log('Converting HEIC output to JPEG (no overlay):', jpegPath);
      pipeline = pipeline.jpeg({ quality: 95, mozjpeg: true });
      await pipeline.toFile(jpegPath);
      return;
    } else if (outputExt === '.tiff' || outputExt === '.tif') {
      pipeline = pipeline.tiff({ quality: 95 });
    } else if (outputExt === '.bmp') {
      pipeline = pipeline.png();
      const pngPath = outputPath.replace(/\.bmp$/i, '.png');
      console.log('Converting BMP output to PNG (no overlay):', pngPath);
      await pipeline.toFile(pngPath);
      return;
    } else if (outputExt === '.gif') {
      pipeline = pipeline.png();
      const pngPath = outputPath.replace(/\.gif$/i, '.png');
      console.log('Converting GIF output to PNG (no overlay):', pngPath);
      await pipeline.toFile(pngPath);
      return;
    }
    
    await pipeline.toFile(outputPath);
  }
  
  // 처리 완료 후 임시 파일 정리
  if (tempConvertedPath) {
    cleanupTempFile(tempConvertedPath);
  }
}

// 폴더 배치 처리
async function processFolderImages(inDir, outDir, options, onProgress) {
  const files = fs.readdirSync(inDir);
  // macOS 숨김 파일 및 시스템 파일 필터링
  const images = files.filter(f => {
    // ._ 로 시작하는 macOS 메타데이터 파일 제외
    if (f.startsWith('._')) return false;
    // .DS_Store 등 시스템 파일 제외
    if (f.startsWith('.DS_Store') || f.startsWith('.')) return false;
    // 지원하는 이미지 확장자만 포함
    return IMAGE_EXT.has(path.extname(f).toLowerCase());
  });
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
  // 임시 파일 경로 변수를 함수 최상위에서 선언
  let tempConvertedPath = null;
  
  // 입력 메타 먼저 조회 (HEIC 지원 포함)
  let inputProbe;
  try {
    // 파일명으로 macOS 메타데이터 파일 확인
    const fileName = require('path').basename(inputPath);
    if (fileName.startsWith('._')) {
      throw new Error(`Preview - Skipping macOS metadata file: ${fileName}`);
    }
    
    inputProbe = sharp(inputPath, { failOn: 'none' });
    const inputMeta = await inputProbe.metadata();
    
    // HEIC/HEIF 파일인 경우 JPEG로 변환
    const ext = require('path').extname(inputPath).toLowerCase();
    
    if (ext === '.heic' || ext === '.heif') {
      console.log('Preview - Processing HEIC/HEIF file:', inputPath);
      console.log('Preview - Original metadata:', inputMeta);
      
      if (inputMeta && inputMeta.width && inputMeta.height) {
        console.log('Preview - HEIC file has valid metadata, attempting conversion...');
        
        // macOS 환경에서 sips 우선 시도
        if (process.platform === 'darwin') {
          try {
            console.log('Preview - Attempting HEIC conversion with macOS sips...');
            tempConvertedPath = await convertHeicWithSips(inputPath);
            
            // 변환된 파일을 안전하게 정규화: EXIF 기반 회전 적용 후 ORIENTATION=1로 리셋
            inputProbe = sharp(tempConvertedPath, { failOn: 'none' }).rotate().withMetadata({ orientation: 1 });
            const previewMeta = await inputProbe.metadata();
            console.log('Preview - sips conversion and normalize orientation done:', { width: previewMeta.width, height: previewMeta.height });
          } catch (sipsError) {
            console.log('Preview - sips conversion failed, trying Sharp fallback:', sipsError.message);
            
            // sips 실패 시 Sharp로 시도
            const isHEVC = inputMeta.compression === 'hevc';
            if (isHEVC) {
              throw new Error(`HEVC 압축 HEIC 파일 변환에 실패했습니다. 파일을 수동으로 JPEG로 변환 후 다시 시도해주세요. (파일: ${fileName})`);
            } else {
              try {
                const convertedBuffer = await sharp(inputPath, { 
                  failOn: 'none',
                  unlimited: true,
                  sequentialRead: true
                }).rotate().jpeg({ quality: 95 }).toBuffer();
                
                inputProbe = sharp(convertedBuffer, { failOn: 'none' });
                console.log('Preview - Sharp fallback conversion successful with auto-rotation');
              } catch (sharpError) {
                throw new Error(`Preview - HEIC 파일 변환에 실패했습니다: ${sharpError.message}`);
              }
            }
          }
        } else {
          // 비macOS 환경에서는 Sharp만 사용
          const isHEVC = inputMeta.compression === 'hevc';
          if (isHEVC) {
            throw new Error(`HEVC 압축 HEIC 파일은 macOS가 아닌 환경에서 지원되지 않습니다. 파일을 JPEG로 변환 후 다시 시도해주세요. (파일: ${fileName})`);
          } else {
            try {
              const convertedBuffer = await sharp(inputPath, { 
                failOn: 'none',
                unlimited: true,
                sequentialRead: true
              }).rotate().jpeg({ quality: 95 }).toBuffer();
              
              inputProbe = sharp(convertedBuffer, { failOn: 'none' });
              console.log('Preview - Sharp conversion successful with auto-rotation (non-macOS)');
            } catch (sharpError) {
              throw new Error(`Preview - HEIC 파일 변환에 실패했습니다: ${sharpError.message}`);
            }
          }
        }
      } else {
        throw new Error(`Preview - Invalid HEIC file: ${fileName}`);
      }
    }
  } catch (error) {
    // 에러 발생 시 임시 파일 정리
    if (tempConvertedPath) {
      cleanupTempFile(tempConvertedPath);
    }
    console.error('Preview - Error processing input file:', inputPath, error.message);
    throw new Error(`Preview - Unsupported image format: ${require('path').basename(inputPath)}`);
  }
  
  const inputMeta = await inputProbe.metadata();
  const targetW = inputMeta.width && inputMeta.width > previewWidth ? previewWidth : (inputMeta.width || previewWidth);

  // 프리뷰용으로 실제 리사이즈를 수행하여 새 베이스/메타 획득
  const baseBuf = await inputProbe
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
  console.log('Preview - Processing logo:', logoBuf ? 'Logo buffer exists' : 'No logo buffer');
  if (logoBuf) {
    console.log('Preview - Logo buffer size:', logoBuf.length);
    
    // 프리뷰용 로고 목표 크기 계산 - 프리뷰 기준(baseW/baseH)으로 통일
    const targetLogoSize = effectiveLogoSize(baseW, baseH, { logoSize: options.logoSize, logoSizeMode: options.logoSizeMode });
    console.log('Preview - Target logo size:', targetLogoSize, 'px');
    
    // 프리뷰에서도 로고를 PNG로 변환하고 크기 조정
    const pngLogo = await sharp(logoBuf)
      .png()
      .resize({ width: targetLogoSize, height: targetLogoSize, fit: 'inside', withoutEnlargement: false })
      .toBuffer();
    
    const safeLogo = await fitOverlayInside(pngLogo, boxW, boxH);
    const lmeta = await sharp(safeLogo).metadata();
    console.log('Preview - Logo metadata:', { width: lmeta.width, height: lmeta.height });
    // 프리뷰에서도 로고 위치 계산 - 텍스트와 겹치지 않도록 조정
    let logoPosition = position === 'auto' ? 'southeast' : (position || 'southeast');
    console.log('Preview - Initial logo position:', logoPosition, 'from position:', position);
    
    // 텍스트가 있는 경우 로고 위치를 조정 (프리셋 문자열일 때만)
    if (text && typeof position === 'string' && position !== 'custom') {
      switch(logoPosition) {
        case 'southeast':
          logoPosition = 'southwest';
          break;
        case 'southwest':
          logoPosition = 'southeast';
          break;
        case 'northeast':
          logoPosition = 'northwest';
          break;
        case 'northwest':
          logoPosition = 'northeast';
          break;
        default:
          logoPosition = 'northwest';
      }
      console.log('Preview - Logo position adjusted to avoid text overlap:', logoPosition);
    }
    
    const { left: logoLeft, top: logoTop } = computeLeftTop(baseW, baseH, lmeta.width || 0, lmeta.height || 0, logoPosition, m);
    console.log('Preview - Logo position:', { left: logoLeft, top: logoTop });
    
    // 프리뷰용 로고 불투명도
    const logoOpacity = clamp(Number(options.logoOpacity) || 0.8, 0, 1);
    console.log('Preview - Logo opacity:', logoOpacity);
    
    composites.push({ input: safeLogo, left: logoLeft, top: logoTop, blend: 'over', opacity: logoOpacity });
    console.log('Preview - Logo composite added to list');
  }

  const pipeline = composites.length > 0 ? base.composite(composites) : base;
  const result = await pipeline.png().toBuffer();
  
  // 처리 완료 후 임시 파일 정리
  if (tempConvertedPath) {
    cleanupTempFile(tempConvertedPath);
  }
  
  return result;
}

// 워터마크 위치와 크기 정보 반환 (미리보기용)
async function getWatermarkPosition(inputPath, options, previewWidth = 800) {
  const { maxWidth } = options;
  let tempConvertedPath = null;
  
  try {
    // macOS 메타데이터 파일 필터링
    const fileName = require('path').basename(inputPath);
    if (fileName.startsWith('._') || fileName === '.DS_Store' || fileName.startsWith('.')) {
      throw new Error(`Skipping macOS metadata file: ${fileName}`);
    }
    
    // 실제 처리와 동일한 리사이징 로직 사용
    let probe = sharp(inputPath, { failOn: 'none' });
    let inputMeta = await probe.metadata();
    const originalMeta = inputMeta; // 원본 메타 보존
    
    // HEIC/HEIF 파일인 경우 특별 처리
    const ext = require('path').extname(inputPath).toLowerCase();
    
    if (ext === '.heic' || ext === '.heif') {
      console.log('getWatermarkPosition - Processing HEIC/HEIF file:', inputPath);
      
      if (inputMeta && inputMeta.width && inputMeta.height) {
        // macOS 환경에서 sips 우선 시도
        if (process.platform === 'darwin') {
          try {
            console.log('getWatermarkPosition - Attempting HEIC conversion with macOS sips...');
            tempConvertedPath = await convertHeicWithSips(inputPath);
            
            // 변환된 파일을 안전하게 정규화
            probe = sharp(tempConvertedPath, { failOn: 'none' }).rotate().withMetadata({ orientation: 1 });
            inputMeta = await probe.metadata();
            console.log('getWatermarkPosition - sips conversion and normalize orientation done:', { width: inputMeta.width, height: inputMeta.height });
          } catch (sipsError) {
            console.log('getWatermarkPosition - sips conversion failed, trying Sharp fallback:', sipsError.message);
            
            // sips 실패 시 Sharp로 시도
            const isHEVC = inputMeta.compression === 'hevc';
            if (isHEVC) {
              throw new Error(`HEVC 압축 HEIC 파일 변환에 실패했습니다. 파일을 수동으로 JPEG로 변환 후 다시 시도해주세요. (파일: ${fileName})`);
            } else {
              try {
                const convertedBuffer = await sharp(inputPath, { 
                  failOn: 'none',
                  unlimited: true,
                  sequentialRead: true
                }).rotate().jpeg({ quality: 95 }).toBuffer();
                
                probe = sharp(convertedBuffer, { failOn: 'none' });
                inputMeta = await probe.metadata();
                console.log('getWatermarkPosition - Sharp fallback conversion successful with auto-rotation');
              } catch (sharpError) {
                throw new Error(`HEIC 파일 변환에 실패했습니다: ${sharpError.message}`);
              }
            }
          }
        } else {
          // 비macOS 환경에서는 Sharp만 사용
          const isHEVC = inputMeta.compression === 'hevc';
          if (isHEVC) {
            throw new Error(`HEVC 압축 HEIC 파일은 macOS가 아닌 환경에서 지원되지 않습니다. 파일을 JPEG로 변환 후 다시 시도해주세요. (파일: ${fileName})`);
          } else {
            try {
              const convertedBuffer = await sharp(inputPath, { 
                failOn: 'none',
                unlimited: true,
                sequentialRead: true
              }).rotate().jpeg({ quality: 95 }).toBuffer();
              
              probe = sharp(convertedBuffer, { failOn: 'none' });
              inputMeta = await probe.metadata();
              console.log('getWatermarkPosition - Sharp conversion successful with auto-rotation (non-macOS)');
            } catch (sharpError) {
              throw new Error(`HEIC 파일 변환에 실패했습니다: ${sharpError.message}`);
            }
          }
        }
      } else {
        throw new Error(`Invalid HEIC file: ${fileName}`);
      }
    }
    
    let img;
  
  if (maxWidth && inputMeta.width && inputMeta.width > maxWidth) {
    // 실제 처리에서 maxWidth로 리사이즈되는 경우
    const resizedBuf = await probe
      .resize({ width: maxWidth })
      .toBuffer();
    img = sharp(resizedBuf, { failOn: 'none' });
  } else if (inputMeta.width && inputMeta.width > previewWidth) {
    // 미리보기를 위해 previewWidth로 리사이즈
    const resizedBuf = await probe
      .resize({ width: previewWidth })
      .toBuffer();
    img = sharp(resizedBuf, { failOn: 'none' });
  } else {
    // 원본 크기 사용 (이미 변환된 probe 사용)
    img = probe;
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

  // 로고 워터마크가 있는 경우 처리
  if (logoBytes && logoBytes.length > 0) {
    const logoBuf = normalizeBuffer(logoBytes);
    if (logoBuf) {
      // 로고 목표 크기 계산 - 프리뷰/표시 크기와 동일 기준으로 계산(일관성)
      const targetLogoSize = effectiveLogoSize(baseW, baseH, { logoSize: options.logoSize, logoSizeMode: options.logoSizeMode });
      
      // 로고를 PNG로 변환하고 크기 조정
      const pngLogo = await sharp(logoBuf)
        .png()
        .resize({ width: targetLogoSize, height: targetLogoSize, fit: 'inside', withoutEnlargement: false })
        .toBuffer();
      
      const safeLogo = await fitOverlayInside(pngLogo, boxW, boxH);
      const lmeta = await sharp(safeLogo).metadata();
      
      // 로고 위치 계산 - 텍스트와 겹치지 않도록 조정
      let logoPosition = position === 'auto' ? 'southeast' : (position || 'southeast');
      
      // 텍스트가 있는 경우 로고 위치를 조정 (프리셋 문자열일 때만)
      if (text && typeof position === 'string' && position !== 'custom') {
        switch(logoPosition) {
          case 'southeast':
            logoPosition = 'southwest';
            break;
          case 'southwest':
            logoPosition = 'southeast';
            break;
          case 'northeast':
            logoPosition = 'northwest';
            break;
          case 'northwest':
            logoPosition = 'northeast';
            break;
          default:
            logoPosition = 'northwest';
        }
      }
      
      const { left: logoLeft, top: logoTop } = computeLeftTop(baseW, baseH, lmeta.width || 0, lmeta.height || 0, logoPosition, m);
      
      watermarkInfo = {
        left: logoLeft,
        top: logoTop,
        width: lmeta.width || 0,
        height: lmeta.height || 0,
        imageWidth: baseW,
        imageHeight: baseH,
        originalImageWidth: inputMeta.width,
        originalImageHeight: inputMeta.height
      };
      
      console.log('Logo watermark position calculated:', {
        imageSize: `${baseW}x${baseH}`,
        logoSize: `${lmeta.width}x${lmeta.height}`,
        position: `${logoLeft},${logoTop}`,
        originalSize: `${inputMeta.width}x${inputMeta.height}`,
        positionType: logoPosition
      });
    }
  } else if (text) {
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
      imageHeight: baseH,
      originalImageWidth: inputMeta.width,
      originalImageHeight: inputMeta.height
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
  } catch (error) {
    // 에러 발생 시 임시 파일 정리
    if (tempConvertedPath) {
      cleanupTempFile(tempConvertedPath);
    }
    console.error('Error in getWatermarkPosition:', inputPath, error.message);
    throw error;
  } finally {
    // 정상 완료 시에도 임시 파일 정리
    if (tempConvertedPath) {
      cleanupTempFile(tempConvertedPath);
    }
  }
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
    // 비디오용 로고 목표 크기 계산
    const targetLogoSize = effectiveLogoSize(baseW, baseH, { logoSize: options.logoSize, logoSizeMode: options.logoSizeMode });
    console.log('Video - Target logo size:', targetLogoSize, 'px');
    
    // 비디오에서도 로고를 PNG로 변환하고 크기 조정
    const pngLogo = await sharp(logoBuf)
      .png()
      .resize({ width: targetLogoSize, height: targetLogoSize, fit: 'inside', withoutEnlargement: false })
      .toBuffer();
    
    const safeLogo = await fitOverlayInside(pngLogo, boxW, boxH);
    const lmeta = await sharp(safeLogo).metadata();
    // 비디오에서도 로고 위치 계산 - 텍스트와 겹치지 않도록 조정
    let logoPosition = position === 'auto' ? 'southeast' : position;
    
    // 텍스트가 있는 경우 로고 위치를 조정
    if (text && position !== 'custom') {
      switch(logoPosition) {
        case 'southeast':
          logoPosition = 'southwest';
          break;
        case 'southwest':
          logoPosition = 'southeast';
          break;
        case 'northeast':
          logoPosition = 'northwest';
          break;
        case 'northwest':
          logoPosition = 'northeast';
          break;
        default:
          logoPosition = 'northwest';
      }
      console.log('Video - Logo position adjusted to avoid text overlap:', logoPosition);
    }
    
    const { left, top } = computeLeftTop(baseW, baseH, lmeta.width || 0, lmeta.height || 0, logoPosition, m);
    const tmp = makeTempFilePath('wm_logo.png');
    await writeBufferToFile(safeLogo, tmp);
    
    // 비디오용 로고 불투명도
    const logoOpacity = clamp(Number(options.logoOpacity) || 0.8, 0, 1);
    console.log('Video - Logo opacity:', logoOpacity);
    
    overlays.push({ path: tmp, x: left, y: top, applyAlpha: true, alpha: logoOpacity });
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
  // macOS 숨김 파일 및 시스템 파일 필터링
  const videos = files.filter(f => {
    if (f.startsWith('._') || f.startsWith('.DS_Store') || f.startsWith('.')) return false;
    return VIDEO_EXT.has(path.extname(f).toLowerCase());
  });
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
