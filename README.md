# Electron Watermark

An Electron-based application for adding watermarks to images and videos.

## 🎥 Demo

https://github.com/user-attachments/assets/d05e1908-c7c7-474e-b6a0-ff6ed307575c

## 🚀 Features

- **Image Watermarking**: Support for JPG, PNG, WebP, HEIC and other image formats
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

You can package the application into executable files.

#### Build for all platforms
```bash
npm run build
```

#### Build for specific platforms
```bash
# macOS (.dmg file)
npm run build:mac

# Windows (.exe file)
npm run build:win

# Linux (.AppImage file)
npm run build:linux
```

## 📦 Distribution & Packaging

### macOS
- **Output**: `.dmg` files are generated in the `dist/` folder
- **Installation**: Users open the `.dmg` file and drag to Applications folder
- **Supported Architectures**: Intel (x64) and Apple Silicon (arm64)

#### 🔒 macOS Security Warning Resolution
You may see the following security warning when running the app for the first time:

```
'Aqua Watermark.app' cannot be opened
Apple cannot check it for malicious software that could harm your Mac or compromise your privacy.
```

**To resolve:**
1. Go to **System Preferences** → **Security & Privacy** → **Security** tab
2. Look for the message: *"Mac blocked 'Aqua Watermark.app' to protect your Mac"*
3. Click **"Open Anyway"** button
4. The app will run normally

This is macOS's normal security feature for unsigned developer applications.

### Windows
- **Output**: `.exe` installer is generated in the `dist/` folder
- **Installation**: Users run the `.exe` file to install
- **Supported Architectures**: x64

### Linux
- **Output**: `.AppImage` files are generated in the `dist/` folder
- **Installation**: Users run the `.AppImage` file to use
- **Supported Architectures**: x64

### Deployment Considerations
1. **Code Signing**: Recommended to reduce security warnings on macOS and Windows
2. **Auto-updates**: Can implement auto-update functionality using `electron-updater`
3. **File Size**: May be large as all dependencies are included

## 📝 License

This project is licensed under the MIT License.

## 🤝 Contributing

Bug reports, feature suggestions, and pull requests are welcome!

## 📞 Support

If you have questions or suggestions about the project, please create an issue.

e.

