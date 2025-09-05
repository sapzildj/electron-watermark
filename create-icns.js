const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

async function createIcns() {
  try {
    console.log('macOS용 .icns 파일을 생성합니다...');
    
    // 임시 iconset 폴더 생성
    const iconsetPath = path.join(__dirname, 'assets', 'icons', 'icon.iconset');
    if (!fs.existsSync(iconsetPath)) {
      fs.mkdirSync(iconsetPath, { recursive: true });
    }
    
    // 필요한 크기들 (macOS iconset 형식)
    const sizes = [
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
    
    // SVG 생성 (청록색 배경에 귀여운 캐릭터)
    const svg = `
      <svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#87CEEB"/>
        <circle cx="512" cy="400" r="120" fill="none" stroke="#4682B4" stroke-width="12"/>
        <circle cx="480" cy="380" r="20" fill="#4682B4"/>
        <circle cx="544" cy="380" r="20" fill="#4682B4"/>
        <path d="M 480 420 Q 512 450 544 420" stroke="#4682B4" stroke-width="8" fill="none"/>
        <path d="M 400 300 Q 512 200 624 300" stroke="#4682B4" stroke-width="12" fill="none"/>
      </svg>
    `;
    
    // 각 크기별로 PNG 생성
    for (const { size, name } of sizes) {
      await sharp(Buffer.from(svg))
        .resize(size, size)
        .png()
        .toFile(path.join(iconsetPath, name));
      
      console.log(`${name} 생성 완료`);
    }
    
    // iconutil을 사용해서 .icns 파일 생성
    const icnsPath = path.join(__dirname, 'assets', 'icons', 'icon.icns');
    execSync(`iconutil -c icns "${iconsetPath}" -o "${icnsPath}"`);
    
    console.log('✅ icon.icns 파일이 생성되었습니다!');
    
    // 임시 iconset 폴더 삭제
    execSync(`rm -rf "${iconsetPath}"`);
    console.log('임시 파일들이 정리되었습니다.');
    
  } catch (error) {
    console.error('❌ .icns 파일 생성 중 오류:', error);
  }
}

createIcns();
