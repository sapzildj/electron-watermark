const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const pngToIco = require('png-to-ico');

async function createIconsFromOriginal() {
  try {
    console.log('원본 이미지를 기반으로 아이콘을 생성합니다...');
    
    const originalImagePath = path.join(__dirname, 'assets', 'icons', 'original-image.png');
    
    // 원본 이미지가 존재하는지 확인
    if (!fs.existsSync(originalImagePath)) {
      console.error('❌ 원본 이미지를 찾을 수 없습니다:', originalImagePath);
      console.log('assets/icons/original-image.png 파일을 확인해주세요.');
      return;
    }
    
    console.log('✅ 원본 이미지를 찾았습니다:', originalImagePath);
    
    // 다양한 크기의 PNG 아이콘 생성
    const sizes = [16, 32, 64, 128, 256];
    const pngFiles = [];

    for (const size of sizes) {
      const pngFile = path.join(__dirname, 'assets', 'icons', `icon-${size}x${size}.png`);
      await sharp(originalImagePath)
        .resize(size, size)
        .png()
        .toFile(pngFile);
      
      console.log(`${size}x${size} 아이콘 생성 완료`);
      pngFiles.push(pngFile);
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
      await sharp(originalImagePath)
        .resize(size, size)
        .png()
        .toFile(path.join(iconsetPath, name));
      
      console.log(`${name} 생성 완료`);
    }
    
    // .icns 파일 생성
    const icnsPath = path.join(__dirname, 'assets', 'icons', 'icon.icns');
    execSync(`iconutil -c icns "${iconsetPath}" -o "${icnsPath}"`);
    
    console.log('✅ icon.icns 파일이 생성되었습니다!');

    // .ico 파일 생성
    const icoPath = path.join(__dirname, 'assets', 'icons', 'icon.ico');
    const icoBuffer = await pngToIco(pngFiles);
    fs.writeFileSync(icoPath, icoBuffer);

    console.log('✅ icon.ico 파일이 생성되었습니다!');
    
    // 임시 iconset 폴더 삭제
    execSync(`rm -rf "${iconsetPath}"`);
    console.log('임시 파일들이 정리되었습니다.');
    
    console.log('🎉 모든 아이콘이 원본 이미지 그대로 생성되었습니다!');
    
  } catch (error) {
    console.error('❌ 아이콘 생성 중 오류:', error);
  }
}

createIconsFromOriginal();