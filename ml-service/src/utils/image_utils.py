import cv2
import numpy as np
from typing import Tuple, Optional
import requests
from io import BytesIO
from PIL import Image

def load_image(image_source: str) -> np.ndarray:
    """
    Load image from URL or file path
    
    Args:
        image_source: URL or file path
    
    Returns:
        Image as numpy array (BGR format)
    """
    try:
        # Check if it's a URL
        if image_source.startswith(('http://', 'https://')):
            response = requests.get(image_source, timeout=10)
            response.raise_for_status()
            image = Image.open(BytesIO(response.content))
        else:
            # Assume it's a file path
            image = Image.open(image_source)
        
        # Convert to numpy array and BGR format (OpenCV default)
        image_np = np.array(image)
        
        # Convert RGBA to RGB if necessary
        if image_np.shape[2] == 4:
            image_np = cv2.cvtColor(image_np, cv2.COLOR_RGBA2RGB)
        elif image_np.shape[2] == 3 and image.mode == 'RGB':
            # PIL uses RGB, OpenCV uses BGR
            image_np = cv2.cvtColor(image_np, cv2.COLOR_RGB2BGR)
        
        return image_np
        
    except Exception as e:
        raise ValueError(f"Failed to load image: {e}")

def preprocess_image(
    image: np.ndarray,
    target_size: Optional[Tuple[int, int]] = None,
    normalize: bool = True
) -> np.ndarray:
    """
    Preprocess image for ML models
    
    Args:
        image: Input image (BGR format)
        target_size: Target size (width, height)
        normalize: Whether to normalize to [0, 1]
    
    Returns:
        Preprocessed image
    """
    # Convert to RGB if needed (most ML models expect RGB)
    if len(image.shape) == 3 and image.shape[2] == 3:
        image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    else:
        image_rgb = image
    
    # Resize if target size provided
    if target_size:
        image_rgb = cv2.resize(image_rgb, target_size, interpolation=cv2.INTER_AREA)
    
    # Normalize
    if normalize:
        image_rgb = image_rgb.astype(np.float32) / 255.0
    
    return image_rgb

def resize_image(
    image: np.ndarray,
    max_size: int = 1920,
    maintain_aspect: bool = True
) -> np.ndarray:
    """
    Resize image while maintaining aspect ratio
    
    Args:
        image: Input image
        max_size: Maximum dimension size
        maintain_aspect: Whether to maintain aspect ratio
    
    Returns:
        Resized image
    """
    h, w = image.shape[:2]
    
    if max(h, w) <= max_size:
        return image
    
    if maintain_aspect:
        # Maintain aspect ratio
        scale = max_size / max(h, w)
        new_w = int(w * scale)
        new_h = int(h * scale)
    else:
        new_w = new_h = max_size
    
    return cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_AREA)

def normalize_image(image: np.ndarray, mean: list, std: list) -> np.ndarray:
    """
    Normalize image with mean and std
    
    Args:
        image: Input image
        mean: Mean values for each channel
        std: Std values for each channel
    
    Returns:
        Normalized image
    """
    if len(image.shape) == 3:
        for i in range(3):
            image[..., i] = (image[..., i] - mean[i]) / std[i]
    return image

def enhance_image(image: np.ndarray) -> np.ndarray:
    """
    Enhance image quality for better processing
    
    Args:
        image: Input image
    
    Returns:
        Enhanced image
    """
    # Convert to LAB color space
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    
    # Split channels
    l, a, b = cv2.split(lab)
    
    # Apply CLAHE to L-channel
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    l = clahe.apply(l)
    
    # Merge channels
    enhanced_lab = cv2.merge([l, a, b])
    
    # Convert back to BGR
    enhanced = cv2.cvtColor(enhanced_lab, cv2.COLOR_LAB2BGR)
    
    return enhanced

def detect_blur(image: np.ndarray, threshold: float = 100.0) -> float:
    """
    Detect blur in image using Laplacian variance
    
    Args:
        image: Input image
        threshold: Blur threshold
    
    Returns:
        Blur score (higher = less blurry)
    """
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
    return min(laplacian_var / threshold, 1.0)

def calculate_brightness(image: np.ndarray) -> float:
    """
    Calculate image brightness
    
    Args:
        image: Input image
    
    Returns:
        Brightness score (0-1)
    """
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    brightness = np.mean(gray) / 255.0
    return brightness

def calculate_contrast(image: np.ndarray) -> float:
    """
    Calculate image contrast
    
    Args:
        image: Input image
    
    Returns:
        Contrast score (0-1)
    """
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    contrast = np.std(gray) / 128.0  # Normalize
    return min(contrast, 1.0)