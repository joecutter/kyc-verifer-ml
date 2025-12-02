import cv2
import numpy as np
from typing import List, Tuple, Dict, Any, Optional
from dataclasses import dataclass
from src.utils.image_utils import (
    load_image, preprocess_image, resize_image,
    enhance_image, detect_blur, calculate_brightness, calculate_contrast
)

@dataclass
class ImageQuality:
    """Image quality metrics"""
    blur_score: float = 0.0
    brightness: float = 0.0
    contrast: float = 0.0
    resolution: Tuple[int, int] = (0, 0)
    overall_score: float = 0.0

class ImageProcessor:
    """Image processing service for KYC"""
    
    def __init__(self, max_size: int = 1920):
        self.max_size = max_size
    
    def process_selfie(self, image: np.ndarray) -> Dict[str, Any]:
        """
        Process selfie image for face verification
        
        Args:
            image: Selfie image
        
        Returns:
            Processed image and metadata
        """
        # Enhance image quality
        enhanced = enhance_image(image)
        
        # Resize if too large
        resized = resize_image(enhanced, self.max_size)
        
        # Calculate quality metrics
        quality = self._calculate_image_quality(resized)
        
        # Detect if image meets selfie requirements
        is_valid = self._validate_selfie(resized, quality)
        
        return {
            'processed_image': resized,
            'quality': quality,
            'is_valid': is_valid,
            'validation_errors': [] if is_valid else ['Image does not meet selfie requirements'],
        }
    
    def process_id_document(self, image: np.ndarray) -> Dict[str, Any]:
        """
        Process ID document image
        
        Args:
            image: ID document image
        
        Returns:
            Processed image and metadata
        """
        # Convert to grayscale for document processing
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image
        
        # Enhance contrast for better OCR
        enhanced = cv2.equalizeHist(gray)
        
        # Apply adaptive thresholding
        binary = cv2.adaptiveThreshold(
            enhanced, 255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY, 11, 2
        )
        
        # Deskew document
        deskewed = self._deskew_document(binary)
        
        # Calculate quality metrics
        quality = self._calculate_image_quality(image)
        
        # Detect if image meets document requirements
        is_valid = self._validate_document(image, quality)
        
        return {
            'processed_image': deskewed,
            'original_image': image,
            'quality': quality,
            'is_valid': is_valid,
            'validation_errors': [] if is_valid else ['Document image quality insufficient'],
        }
    
    def extract_face_regions(self, image: np.ndarray) -> List[Dict[str, Any]]:
        """
        Extract face regions from image
        
        Args:
            image: Input image
        
        Returns:
            List of face regions with metadata
        """
        # This would use a face detector (MTCNN, etc.)
        # For now, return a placeholder
        faces = []
        
        # Simple face detection using OpenCV (for demonstration)
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        face_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
        )
        
        detected_faces = face_cascade.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=5,
            minSize=(100, 100)
        )
        
        for (x, y, w, h) in detected_faces:
            face_region = image[y:y+h, x:x+w]
            
            # Calculate face quality
            face_quality = self._calculate_image_quality(face_region)
            
            faces.append({
                'bbox': (x, y, w, h),
                'region': face_region,
                'quality': face_quality,
                'center': (x + w//2, y + h//2),
            })
        
        return faces
    
    def _calculate_image_quality(self, image: np.ndarray) -> ImageQuality:
        """Calculate comprehensive image quality metrics"""
        blur_score = detect_blur(image)
        brightness = calculate_brightness(image)
        contrast = calculate_contrast(image)
        
        # Calculate overall score
        overall_score = (
            blur_score * 0.4 +
            min(abs(brightness - 0.5) * 2, 1.0) * 0.3 +
            contrast * 0.3
        )
        
        return ImageQuality(
            blur_score=float(blur_score),
            brightness=float(brightness),
            contrast=float(contrast),
            resolution=(image.shape[1], image.shape[0]),
            overall_score=float(overall_score)
        )
    
    def _deskew_document(self, image: np.ndarray) -> np.ndarray:
        """Deskew document image"""
        # Find contours
        contours, _ = cv2.findContours(
            image, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )
        
        if not contours:
            return image
        
        # Find largest contour (assumed to be document)
        largest_contour = max(contours, key=cv2.contourArea)
        
        # Get minimum area rectangle
        rect = cv2.minAreaRect(largest_contour)
        angle = rect[2]
        
        # Adjust angle
        if angle < -45:
            angle = 90 + angle
        
        # Rotate image
        (h, w) = image.shape[:2]
        center = (w // 2, h // 2)
        rotation_matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
        deskewed = cv2.warpAffine(
            image, rotation_matrix, (w, h),
            flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE
        )
        
        return deskewed
    
    def _validate_selfie(self, image: np.ndarray, quality: ImageQuality) -> bool:
        """Validate selfie image requirements"""
        # Check minimum resolution
        if image.shape[0] < 480 or image.shape[1] < 480:
            return False
        
        # Check image quality
        if quality.overall_score < 0.4:
            return False
        
        # Check brightness (should be well-lit)
        if quality.brightness < 0.3 or quality.brightness > 0.8:
            return False
        
        # Check for blur
        if quality.blur_score < 0.3:
            return False
        
        return True
    
    def _validate_document(self, image: np.ndarray, quality: ImageQuality) -> bool:
        """Validate document image requirements"""
        # Check minimum resolution
        if image.shape[0] < 600 or image.shape[1] < 800:
            return False
        
        # Check image quality
        if quality.overall_score < 0.5:
            return False
        
        # Check contrast (documents need good contrast for OCR)
        if quality.contrast < 0.4:
            return False
        
        # Check for blur
        if quality.blur_score < 0.4:
            return False
        
        return True