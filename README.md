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
npm run dev
```

### Build
```bash
npm run build
```

## 📝 License

This project is licensed under the MIT License.

## 🤝 Contributing

Bug reports, feature suggestions, and pull requests are welcome!

## 📞 Support

If you have questions or suggestions about the project, please create an issue.
