// Internationalization support
const translations = {
  en: {
    // Main sections
    title: "Batch Watermark (macOS)",
    targetFolder: "Target Folder",
    textWatermark: "Text Watermark",
    imageWatermark: "Image Watermark", 
    commonSettings: "Common Settings",
    hints: "Hints",
    
    // Text watermark fields
    text: "Text",
    textPlaceholder: "Enter watermark text",
    fontSize: "Font Size",
    fontSizeMode: "Font Size Mode",
    fontSizePx: "Font Size (px)",
    textColor: "Text Color",
    fontFamily: "Font Family",
    shadowColor: "Shadow Color",
    shadowOffsetX: "Shadow Offset X",
    shadowOffsetY: "Shadow Offset Y", 
    shadowBlur: "Shadow Blur",
    outlineColor: "Outline Color",
    outlineWidth: "Outline Width",
    
    // Image watermark fields
    logoImage: "Logo Image",
    logoSizeMode: "Logo Size Mode",
    logoSize: "Logo Size",
    logoOpacity: "Logo Opacity (0-1)",
    
    // Common settings
    textOpacity: "Text Opacity (0-1)",
    position: "Position",
    customPosition: "Custom Position",
    margin: "Margin (px)",
    maxWidth: "Max Width (px)",
    
    // Position options
    northwest: "Northwest",
    north: "North",
    northeast: "Northeast", 
    west: "West",
    center: "Center",
    east: "East",
    southwest: "Southwest",
    south: "South",
    southeast: "Southeast",
    auto: "Auto",
    custom: "Custom",
    
    // Size mode options
    percent: "Percent",
    pixels: "Pixels",
    
    // Buttons
    chooseFolder: "Choose",
    applyWatermarks: "Apply Watermarks",
    interactivePreview: "Interactive Preview",
    
    // Tooltips
    tooltips: {
      text: "Enter the text that will appear as a watermark on your images",
      fontSize: "Size of the watermark text. Use percent for responsive sizing or pixels for fixed size",
      fontSizeMode: "Choose between percentage (responsive to image size) or fixed pixel size",
      fontSizePx: "Fixed font size in pixels (only used when Font Size Mode is set to Pixels)",
      textColor: "Color of the watermark text",
      fontFamily: "Font family for the watermark text. System fonts are automatically detected",
      shadowColor: "Color of the text shadow for better visibility",
      shadowOffsetX: "Horizontal offset of the shadow in pixels",
      shadowOffsetY: "Vertical offset of the shadow in pixels",
      shadowBlur: "Blur radius of the shadow effect",
      outlineColor: "Color of the text outline for better contrast",
      outlineWidth: "Width of the text outline in pixels",
      
      logoImage: "Select an image file to use as a watermark. Supports PNG, JPEG, WebP, HEIC, TIFF, BMP, GIF formats",
      logoSizeMode: "Choose between percentage (responsive to image size) or fixed pixel size for the logo",
      logoSize: "Size of the logo watermark. Percentage is relative to the shorter edge of the image",
      logoOpacity: "Transparency of the logo watermark (0 = fully transparent, 1 = fully opaque)",
      
      textOpacity: "Transparency of the text watermark (0 = fully transparent, 1 = fully opaque)",
      position: "Position of the watermark on the image. Auto selects the best position based on image content",
      customPosition: "Specify exact pixel coordinates for watermark placement (only used when Position is set to Custom)",
      margin: "Distance in pixels from the image edges (only applies to edge positions like Southeast, Northwest, etc.)",
      maxWidth: "Maximum width for output images in pixels. Set to 0 to keep original size. Useful for web optimization",
      
      chooseFolder: "Select the target folder where watermarked images will be saved",
      applyWatermarks: "Process all images in the selected folder and apply watermarks",
      interactivePreview: "Preview watermark placement and adjust position by dragging"
    },
    
    // Hints text
    hintsText: {
      opacity: "Tip: Keep opacity between 0.25–0.45 for subtle yet visible marks. Margin only applies to edge positions (Southeast, etc.).",
      heic: "HEIC files: All HEIC files are automatically converted on macOS. On other OS, some HEVC-compressed HEIC files may not be supported."
    }
  },
  
  ko: {
    // Main sections  
    title: "배치 워터마크 (macOS)",
    targetFolder: "대상 폴더",
    textWatermark: "텍스트 워터마크",
    imageWatermark: "이미지 워터마크",
    commonSettings: "공통 설정", 
    hints: "도움말",
    
    // Text watermark fields
    text: "텍스트",
    textPlaceholder: "워터마크 텍스트를 입력하세요",
    fontSize: "폰트 크기",
    fontSizeMode: "폰트 크기 모드",
    fontSizePx: "폰트 크기 (px)",
    textColor: "텍스트 색상",
    fontFamily: "폰트 패밀리",
    shadowColor: "그림자 색상",
    shadowOffsetX: "그림자 X 오프셋",
    shadowOffsetY: "그림자 Y 오프셋",
    shadowBlur: "그림자 블러",
    outlineColor: "외곽선 색상", 
    outlineWidth: "외곽선 두께",
    
    // Image watermark fields
    logoImage: "로고 이미지",
    logoSizeMode: "로고 크기 모드",
    logoSize: "로고 크기",
    logoOpacity: "로고 투명도 (0-1)",
    
    // Common settings
    textOpacity: "텍스트 투명도 (0-1)",
    position: "위치",
    customPosition: "사용자 정의 위치",
    margin: "여백 (px)",
    maxWidth: "최대 너비 (px)",
    
    // Position options
    northwest: "왼쪽 위",
    north: "위",
    northeast: "오른쪽 위",
    west: "왼쪽",
    center: "중앙",
    east: "오른쪽", 
    southwest: "왼쪽 아래",
    south: "아래",
    southeast: "오른쪽 아래",
    auto: "자동",
    custom: "사용자 정의",
    
    // Size mode options
    percent: "퍼센트",
    pixels: "픽셀",
    
    // Buttons
    chooseFolder: "선택",
    applyWatermarks: "워터마크 적용",
    interactivePreview: "인터랙티브 미리보기",
    
    // Tooltips
    tooltips: {
      text: "이미지에 워터마크로 표시될 텍스트를 입력하세요",
      fontSize: "워터마크 텍스트의 크기입니다. 반응형 크기 조정을 위해서는 퍼센트를, 고정 크기를 위해서는 픽셀을 사용하세요",
      fontSizeMode: "퍼센트(이미지 크기에 반응) 또는 고정 픽셀 크기 중에서 선택하세요",
      fontSizePx: "픽셀 단위의 고정 폰트 크기 (폰트 크기 모드가 픽셀로 설정된 경우에만 사용)",
      textColor: "워터마크 텍스트의 색상",
      fontFamily: "워터마크 텍스트의 폰트 패밀리입니다. 시스템 폰트가 자동으로 감지됩니다",
      shadowColor: "가시성 향상을 위한 텍스트 그림자의 색상",
      shadowOffsetX: "그림자의 수평 오프셋 (픽셀)",
      shadowOffsetY: "그림자의 수직 오프셋 (픽셀)",
      shadowBlur: "그림자 효과의 블러 반경",
      outlineColor: "대비 향상을 위한 텍스트 외곽선의 색상",
      outlineWidth: "텍스트 외곽선의 두께 (픽셀)",
      
      logoImage: "워터마크로 사용할 이미지 파일을 선택하세요. PNG, JPEG, WebP, HEIC, TIFF, BMP, GIF 형식을 지원합니다",
      logoSizeMode: "로고에 대해 퍼센트(이미지 크기에 반응) 또는 고정 픽셀 크기 중에서 선택하세요",
      logoSize: "로고 워터마크의 크기입니다. 퍼센트는 이미지의 짧은 변을 기준으로 합니다",
      logoOpacity: "로고 워터마크의 투명도 (0 = 완전 투명, 1 = 완전 불투명)",
      
      textOpacity: "텍스트 워터마크의 투명도 (0 = 완전 투명, 1 = 완전 불투명)",
      position: "이미지에서 워터마크의 위치입니다. 자동은 이미지 내용을 기반으로 최적의 위치를 선택합니다",
      customPosition: "워터마크 배치를 위한 정확한 픽셀 좌표를 지정하세요 (위치가 사용자 정의로 설정된 경우에만 사용)",
      margin: "이미지 가장자리로부터의 거리 (픽셀) (오른쪽 아래, 왼쪽 위 등의 가장자리 위치에만 적용)",
      maxWidth: "출력 이미지의 최대 너비 (픽셀)입니다. 원본 크기를 유지하려면 0으로 설정하세요. 웹 최적화에 유용합니다",
      
      chooseFolder: "워터마크가 적용된 이미지가 저장될 대상 폴더를 선택하세요",
      applyWatermarks: "선택한 폴더의 모든 이미지를 처리하고 워터마크를 적용합니다",
      interactivePreview: "워터마크 배치를 미리보고 드래그하여 위치를 조정하세요"
    },
    
    // Hints text
    hintsText: {
      opacity: "팁: 미묘하면서도 보이는 마크를 위해 투명도를 0.25–0.45 사이로 유지하세요. 여백은 가장자리 위치(오른쪽 아래 등)에만 적용됩니다.",
      heic: "HEIC 파일: macOS에서는 모든 HEIC 파일이 자동으로 변환됩니다. 다른 OS에서는 일부 HEVC 압축 HEIC 파일이 지원되지 않을 수 있습니다."
    }
  }
};

// Current language (default: English)
let currentLanguage = 'en';

// Get translation function
function t(key) {
  const keys = key.split('.');
  let value = translations[currentLanguage];
  
  for (const k of keys) {
    if (value && typeof value === 'object') {
      value = value[k];
    } else {
      // Fallback to English if key not found
      value = translations.en;
      for (const fallbackKey of keys) {
        if (value && typeof value === 'object') {
          value = value[fallbackKey];
        } else {
          return key; // Return key if not found
        }
      }
      break;
    }
  }
  
  return value || key;
}

// Set language function
function setLanguage(lang) {
  if (translations[lang]) {
    currentLanguage = lang;
    updateUI();
  }
}

// Update UI with current language
function updateUI() {
  // Update all elements with data-i18n attribute
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.getAttribute('data-i18n');
    if (element.tagName === 'INPUT' && element.type !== 'button') {
      element.placeholder = t(key);
    } else {
      element.textContent = t(key);
    }
  });
  
  // Update tooltips
  document.querySelectorAll('[data-tooltip]').forEach(element => {
    const key = element.getAttribute('data-tooltip');
    const tooltipText = t(`tooltips.${key}`);
    element.title = tooltipText;
    console.log(`Setting tooltip for ${key}: ${tooltipText}`); // Debug log
  });
  
  // Update option elements
  document.querySelectorAll('option[data-i18n]').forEach(element => {
    const key = element.getAttribute('data-i18n');
    element.textContent = t(key);
  });
}

// Auto-detect language based on browser settings
function detectLanguage() {
  const browserLang = navigator.language || navigator.userLanguage;
  if (browserLang.startsWith('ko')) {
    setLanguage('ko');
  } else {
    setLanguage('en');
  }
}

// Export functions for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { t, setLanguage, updateUI, detectLanguage, get currentLanguage() { return currentLanguage; } };
} else {
  window.i18n = { t, setLanguage, updateUI, detectLanguage, get currentLanguage() { return currentLanguage; } };
}
