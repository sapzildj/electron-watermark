const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// 아이콘 크기들
const sizes = [16, 32, 64, 128, 256, 512, 1024];

async function generateIcons() {
  try {
    // 원본 이미지가 있다고 가정하고 생성
    // 실제로는 사용자가 제공한 이미지를 사용해야 함
    console.log('아이콘 생성을 시작합니다...');
    
    // 임시로 단색 이미지 생성 (실제로는 사용자 이미지 사용)
    const width = 1024;
    const height = 1024;
    
    // 청록색 배경에 간단한 캐릭터 모양 생성
    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#87CEEB"/>
        <circle cx="512" cy="400" r="120" fill="none" stroke="#4682B4" stroke-width="8"/>
        <circle cx="480" cy="380" r="15" fill="#4682B4"/>
        <circle cx="544" cy="380" r="15" fill="#4682B4"/>
        <path d="M 480 420 Q 512 450 544 420" stroke="#4682B4" stroke-width="6" fill="none"/>
        <path d="M 400 300 Q 512 200 624 300" stroke="#4682B4" stroke-width="8" fill="none"/>
      </svg>
    `;
    
    for (const size of sizes) {
      await sharp(Buffer.from(svg))
        .resize(size, size)
        .png()
        .toFile(path.join(__dirname, 'assets', 'icons', `icon-${size}x${size}.png`));
      
      console.log(`${size}x${size} 아이콘 생성 완료`);
    }
    
    console.log('모든 아이콘 생성이 완료되었습니다!');
  } catch (error) {
    console.error('아이콘 생성 중 오류:', error);
  }
}

generateIcons();
