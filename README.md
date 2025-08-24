# Electron Watermark

An Electron-based application for adding watermarks to images and videos.

## 🎥 Demo

https://github.com/user-attachments/assets/d05e1908-c7c7-474e-b6a0-ff6ed307575c

## 🚀 Features

- **Image Watermarking**: Support for JPG, PNG, WebP and other image formats
- **Video Watermarking**: Support for MP4, MOV, MKV and other video formats
- **Watermark Customization**: Adjust text, font, size, position, and transparency
- **Batch Processing**: Process all files in a folder at once
- **Real-time Preview**: Preview watermark results before processing
- **Progress Tracking**: Monitor processing progress in real-time

## 📋 Requirements

- Node.js 16.0.0 or higher
- macOS, Windows, Linux support

## 🛠️ Installation

1. Clone the repository
```bash
git clone https://github.com/yourusername/electron-watermark.git
cd electron-watermark
```

2. Install dependencies
```bash
npm install
```

3. Run the application
```bash
npm start
```

## 🎯 Usage

1. **Select Folder**: Choose a folder containing images/videos to process
2. **Configure Watermark**: Adjust text, font, size, position, etc.
3. **Preview**: Preview the watermark settings
4. **Start Processing**: Confirm settings and begin watermark processing
5. **Check Results**: View processed files in the `output` folder

## ⚙️ Configuration Options

### Text Watermark
- **Text**: Text to display as watermark
- **Font**: Font selection
- **Size**: Font size adjustment
- **Color**: Text color settings
- **Transparency**: Text transparency adjustment

### Position Settings
- **Position**: Watermark placement (top, bottom, left, right, center)
- **Margin**: Distance from edges
- **Rotation**: Watermark rotation angle

## 📁 Supported File Formats

### Images
- JPG/JPEG
- PNG
- WebP

### Videos
- MP4
- MOV
- M4V
- MKV
- WebM
- AVI

## 🏗️ Project Structure

```
electron-watermark/
├── main.js              # Electron main process
├── preload.js           # Security preload script
├── src/
│   ├── index.html       # Main UI
│   ├── renderer.js      # Renderer process
│   └── watermark.js     # Watermark processing logic
└── package.json         # Project configuration
```

## 🔧 Development

### Development Mode
```bash
npm start
```

### Build

애플리케이션을 실행 가능한 파일로 패키징할 수 있습니다.

#### 모든 플랫폼용 빌드
```bash
npm run build
```

#### 특정 플랫폼용 빌드
```bash
# macOS용 (.dmg 파일)
npm run build:mac

# Windows용 (.exe 파일)
npm run build:win

# Linux용 (.AppImage 파일)
npm run build:linux
```

## 📦 배포 및 패키징

### macOS
- **출력**: `dist/` 폴더에 `.dmg` 파일 생성
- **설치**: 사용자가 `.dmg` 파일을 열고 Applications 폴더로 드래그
- **지원 아키텍처**: Intel (x64) 및 Apple Silicon (arm64)

### Windows
- **출력**: `dist/` 폴더에 `.exe` 인스톨러 생성
- **설치**: 사용자가 `.exe` 파일을 실행하여 설치
- **지원 아키텍처**: x64

### Linux
- **출력**: `dist/` 폴더에 `.AppImage` 파일 생성
- **설치**: 사용자가 `.AppImage` 파일을 실행하여 사용
- **지원 아키텍처**: x64

### 배포 시 주의사항
1. **코드 서명**: macOS와 Windows에서 보안 경고를 줄이려면 코드 서명 권장
2. **자동 업데이트**: `electron-updater`를 사용하여 자동 업데이트 기능 구현 가능
3. **파일 크기**: 모든 의존성이 포함되어 파일 크기가 클 수 있음

## 📝 License

This project is licensed under the MIT License.

## 🤝 Contributing

Bug reports, feature suggestions, and pull requests are welcome!

## 📞 Support

If you have questions or suggestions about the project, please create an issue.
