# Changelog

All notable changes to this project will be documented in this file.

## [1.0.2] - 2025-09-06

### Fixed
- Fixed video watermarking not working on packaged macOS application due to incorrect ffmpeg path.
- Fixed Windows packaging failure by generating and including an `.ico` icon file.
- Fixed the application icon being generated incorrectly, now using the provided `original-image.png`.

### Changed
- Consolidated all icon generation logic into a single script to prevent conflicts.

## [1.0.1] - 2025-09-05

### Added
- HEIC format support

### Fixed
- Fixed a bug that occurred when selecting a watermark image

### Changed
- Improved UI for separate selection of watermark image and text

---

## [1.0.0] - 2024-12-19

### Added
- Initial release of Electron-based watermark application
- Image watermarking functionality (JPG, PNG, WebP support)
- Video watermarking functionality (MP4, MOV, MKV, WebM, AVI support)
- Text watermark customization (font, size, color, transparency)
- Watermark position and rotation settings
- Real-time preview functionality
- Batch processing capability
- Progress tracking
- Automatic font detection

### Technical Features
- Built on Electron 31.0.0
- High-quality image processing using Sharp library
- Video processing using FFmpeg
- Security features with contextIsolation and preload scripts

---

## Contributing Guidelines

When adding new features or bug fixes, please document the changes in this file.
- `Added`: New features
- `Changed`: Changes to existing functionality
- `Removed`: Removed features
- `Fixed`: Bug fixes
