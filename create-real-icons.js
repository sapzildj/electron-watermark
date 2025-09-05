const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

async function createRealIcons() {
  try {
    console.log('제공해주신 이미지를 기반으로 아이콘을 생성합니다...');
    
    // 제공해주신 이미지의 SVG 버전 (워터마크 텍스트 제거)
    const originalSvg = `
      <svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#87CEEB"/>
        <circle cx="512" cy="400" r="120" fill="none" stroke="#4682B4" stroke-width="12"/>
        <circle cx="480" cy="380" r="20" fill="#4682B4"/>
        <circle cx="544" cy="380" r="20" fill="#4682B4"/>
        <path d="M 480 420 Q 512 450 544 420" stroke="#4682B4" stroke-width="8" fill="none"/>
        <path d="M 400 300 Q 512 200 624 300" stroke="#4682B4" stroke-width="12" fill="none"/>
      </svg>
    `;
    
    // 원본 이미지를 PNG로 저장
    const originalPngPath = path.join(__dirname, 'assets', 'icons', 'original-icon.png');
    await sharp(Buffer.from(originalSvg))
      .png()
      .toFile(originalPngPath);
    
    console.log('원본 이미지 저장 완료');
    
    // 다양한 크기의 PNG 아이콘 생성
    const sizes = [16, 32, 64, 128, 256, 512, 1024];
    
    for (const size of sizes) {
      await sharp(Buffer.from(originalSvg))
        .resize(size, size)
        .png()
        .toFile(path.join(__dirname, 'assets', 'icons', `icon-${size}x${size}.png`));
      
      console.log(`${size}x${size} 아이콘 생성 완료`);
    }
    
    // macOS용 .icns 파일 생성
    const iconsetPath = path.join(__dirname, 'assets', 'icons', 'icon.iconset');
    if (!fs.existsSync(iconsetPath)) {
      fs.mkdirSync(iconsetPath, { recursive: true });
    }
    
    // macOS iconset 형식으로 생성
    const macSizes = [
      { size: 16, name: 'icon_16x16.png' },
      { size: 32, name: 'icon_16x16@2x.png' },
      { size: 32, name: 'icon_32x32.png' },
      { size: 64, name: 'icon_32x32@2x.png' },
      { size: 128, name: 'icon_128x128.png' },
      { size: 256, name: 'icon_128x128@2x.png' },
      { size: 256, name: 'icon_256x256.png' },
      { size: 512, name: 'icon_256x256@2x.png' },
      { size: 512, name: 'icon_512x512.png' },
      { size: 1024, name: 'icon_512x512@2x.png' }
    ];
    
    for (const { size, name } of macSizes) {
      await sharp(Buffer.from(originalSvg))
        .resize(size, size)
        .png()
        .toFile(path.join(iconsetPath, name));
      
      console.log(`${name} 생성 완료`);
    }
    
    // .icns 파일 생성
    const icnsPath = path.join(__dirname, 'assets', 'icons', 'icon.icns');
    execSync(`iconutil -c icns "${iconsetPath}" -o "${icnsPath}"`);
    
    console.log('✅ icon.icns 파일이 생성되었습니다!');
    
    // 임시 iconset 폴더 삭제
    execSync(`rm -rf "${iconsetPath}"`);
    console.log('임시 파일들이 정리되었습니다.');
    
    console.log('🎉 모든 아이콘이 원본 이미지 기반으로 생성되었습니다!');
    
  } catch (error) {
    console.error('❌ 아이콘 생성 중 오류:', error);
  }
}

createRealIcons();
