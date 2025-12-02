import cv2
import numpy as np
from typing import Dict, Any, List, Optional
import warnings

warnings.filterwarnings("ignore")

class AntiSpoofDetector:
    """Anti-spoofing detection for face verification"""
    
    def __init__(self, device: str = "cpu"):
        self.device = device
        self._initialize_model()
    
    def _initialize_model(self):
        """Initialize anti-spoofing model"""
        # This would load a pre-trained anti-spoofing model
        # For demonstration, we'll create placeholder methods
        
        print("Anti-spoof model initialized")
    
    def detect_spoof(
        self,
        image: np.ndarray,
        face_bbox: Optional[List[int]] = None,
        temporal_frames: Optional[List[np.ndarray]] = None
    ) -> Dict[str, Any]:
        """
        Detect spoofing attempts in image
        
        Args:
            image: Input image
            face_bbox: Face bounding box [x1, y1, x2, y2]
            temporal_frames: List of previous frames for temporal analysis
        
        Returns:
            Spoof detection results
        """
        try:
            results = {
                'is_spoof': False,
                'spoof_type': None,
                'confidence': 0.0,
                'scores': {},
                'indicators': [],
            }
            
            # Extract face region if bbox provided
            if face_bbox:
                x1, y1, x2, y2 = face_bbox
                face_region = image[y1:y2, x1:x2]
            else:
                face_region = image
            
            # Multiple spoof detection methods
            detection_methods = [
                self._detect_print_attack,
                self._detect_screen_replay,
                self._detect_mask_attack,
                self._detect_3d_mask,
                self._detect_photo_quality,
            ]
            
            scores = {}
            indicators = []
            
            for method in detection_methods:
                method_result = method(face_region, temporal_frames)
                scores[method.__name__] = method_result['score']
                
                if method_result['is_spoof']:
                    indicators.append(method_result['type'])
            
            # Determine overall spoof detection
            spoof_score = np.mean(list(scores.values()))
            is_spoof = spoof_score > 0.7  # Threshold
            
            # Determine spoof type based on highest score
            if indicators:
                spoof_type = max(set(indicators), key=indicators.count)
            else:
                spoof_type = None
            
            results.update({
                'is_spoof': is_spoof,
                'spoof_type': spoof_type,
                'confidence': float(spoof_score),
                'scores': {k: float(v) for k, v in scores.items()},
                'indicators': indicators,
            })
            
            return results
            
        except Exception as e:
            print(f"Error in spoof detection: {e}")
            return {
                'is_spoof': False,
                'error': str(e),
            }
    
    def _detect_print_attack(self, face_region: np.ndarray, temporal_frames: List[np.ndarray] = None) -> Dict[str, Any]:
        """Detect printed photo attack"""
        try:
            # Analyze texture patterns
            gray = cv2.cvtColor(face_region, cv2.COLOR_BGR2GRAY)
            
            # Calculate Local Binary Patterns variance
            # Printed photos have different texture patterns
            lbp = self._calculate_lbp(gray)
            lbp_variance = np.var(lbp)
            
            # Check color consistency
            hsv = cv2.cvtColor(face_region, cv2.COLOR_BGR2HSV)
            saturation = np.mean(hsv[:, :, 1])
            
            # Printed photos often have lower saturation
            print_score = (
                (1.0 - min(lbp_variance / 1000.0, 1.0)) * 0.6 +
                (1.0 - min(saturation / 255.0, 1.0)) * 0.4
            )
            
            return {
                'score': float(print_score),
                'is_spoof': print_score > 0.6,
                'type': 'printed_photo',
            }
            
        except:
            return {'score': 0.0, 'is_spoof': False, 'type': 'printed_photo'}
    
    def _detect_screen_replay(self, face_region: np.ndarray, temporal_frames: List[np.ndarray] = None) -> Dict[str, Any]:
        """Detect screen replay attack"""
        try:
            # Screen replay often shows moire patterns and reflections
            gray = cv2.cvtColor(face_region, cv2.COLOR_BGR2GRAY)
            
            # Detect moire patterns using FFT
            fft = np.fft.fft2(gray)
            fft_shift = np.fft.fftshift(fft)
            magnitude = np.log(np.abs(fft_shift) + 1)
            
            # Check for grid-like patterns (screen pixels)
            center = magnitude.shape[0] // 2
            roi = magnitude[center-20:center+20, center-20:center+20]
            grid_score = np.std(roi) / np.std(magnitude)
            
            # Detect reflections (screen glare)
            sobel_x = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=5)
            sobel_y = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=5)
            gradient_magnitude = np.sqrt(sobel_x**2 + sobel_y**2)
            reflection_score = np.mean(gradient_magnitude > np.percentile(gradient_magnitude, 90))
            
            # Temporal analysis for screen refresh
            refresh_score = 0.0
            if temporal_frames and len(temporal_frames) > 5:
                refresh_score = self._detect_screen_refresh(temporal_frames)
            
            screen_score = (
                min(grid_score * 2, 1.0) * 0.4 +
                reflection_score * 0.4 +
                refresh_score * 0.2
            )
            
            return {
                'score': float(screen_score),
                'is_spoof': screen_score > 0.5,
                'type': 'screen_replay',
            }
            
        except:
            return {'score': 0.0, 'is_spoof': False, 'type': 'screen_replay'}
    
    def _detect_mask_attack(self, face_region: np.ndarray, temporal_frames: List[np.ndarray] = None) -> Dict[str, Any]:
        """Detect mask or mannequin attack"""
        try:
            # Masks often have different texture and lack natural skin details
            gray = cv2.cvtColor(face_region, cv2.COLOR_BGR2GRAY)
            
            # Analyze texture uniformity
            texture_uniformity = self._calculate_texture_uniformity(gray)
            
            # Check for lack of pores and skin details
            detail_score = self._calculate_skin_detail(gray)
            
            # Analyze color for unnatural skin tones
            lab = cv2.cvtColor(face_region, cv2.COLOR_BGR2LAB)
            color_variance = np.var(lab[:, :, 1]) + np.var(lab[:, :, 2])
            color_score = 1.0 - min(color_variance / 1000.0, 1.0)
            
            mask_score = (
                texture_uniformity * 0.4 +
                (1.0 - detail_score) * 0.4 +
                color_score * 0.2
            )
            
            return {
                'score': float(mask_score),
                'is_spoof': mask_score > 0.6,
                'type': 'mask',
            }
            
        except:
            return {'score': 0.0, 'is_spoof': False, 'type': 'mask'}
    
    def _detect_3d_mask(self, face_region: np.ndarray, temporal_frames: List[np.ndarray] = None) -> Dict[str, Any]:
        """Detect 3D mask or sculpture attack"""
        try:
            # 3D masks lack natural facial movements and depth
            depth_score = self._estimate_face_depth(face_region)
            
            # Check for lack of micro-expressions
            expression_score = 0.0
            if temporal_frames and len(temporal_frames) > 10:
                expression_score = self._detect_micro_expressions(temporal_frames)
            
            # Analyze surface reflections (3D masks have different reflections)
            reflection_pattern = self._analyze_reflection_pattern(face_region)
            
            mask_3d_score = (
                (1.0 - depth_score) * 0.5 +
                (1.0 - expression_score) * 0.3 +
                reflection_pattern * 0.2
            )
            
            return {
                'score': float(mask_3d_score),
                'is_spoof': mask_3d_score > 0.7,
                'type': '3d_mask',
            }
            
        except:
            return {'score': 0.0, 'is_spoof': False, 'type': '3d_mask'}
    
    def _detect_photo_quality(self, face_region: np.ndarray, temporal_frames: List[np.ndarray] = None) -> Dict[str, Any]:
        """Detect based on photo quality anomalies"""
        try:
            # Real faces have certain quality characteristics
            
            # Check edge sharpness
            edges = cv2.Canny(face_region, 100, 200)
            edge_sharpness = np.mean(edges) / 255.0
            
            # Check noise pattern (real faces have natural skin noise)
            gray = cv2.cvtColor(face_region, cv2.COLOR_BGR2GRAY)
            noise_pattern = self._analyze_noise_pattern(gray)
            
            # Check lighting consistency
            lighting_score = self._check_lighting_consistency(face_region)
            
            photo_score = (
                (1.0 - edge_sharpness) * 0.4 +
                (1.0 - noise_pattern) * 0.4 +
                (1.0 - lighting_score) * 0.2
            )
            
            return {
                'score': float(photo_score),
                'is_spoof': photo_score > 0.6,
                'type': 'photo_manipulation',
            }
            
        except:
            return {'score': 0.0, 'is_spoof': False, 'type': 'photo_manipulation'}
    
    def _calculate_lbp(self, image: np.ndarray) -> np.ndarray:
        """Calculate Local Binary Patterns"""
        radius = 1
        n_points = 8 * radius
        lbp = np.zeros_like(image)
        
        for i in range(radius, image.shape[0] - radius):
            for j in range(radius, image.shape[1] - radius):
                center = image[i, j]
                code = 0
                for k in range(n_points):
                    angle = 2 * np.pi * k / n_points
                    x = j + int(radius * np.cos(angle))
                    y = i - int(radius * np.sin(angle))
                    if image[y, x] >= center:
                        code |= 1 << k
                lbp[i, j] = code
        
        return lbp
    
    def _calculate_texture_uniformity(self, image: np.ndarray) -> float:
        """Calculate texture uniformity"""
        # Real skin has natural texture variations
        blocks = []
        block_size = 16
        
        for i in range(0, image.shape[0] - block_size, block_size):
            for j in range(0, image.shape[1] - block_size, block_size):
                block = image[i:i+block_size, j:j+block_size]
                blocks.append(np.std(block))
        
        if not blocks:
            return 0.0
        
        # Low variance between blocks = uniform texture (potential mask)
        uniformity = 1.0 - min(np.std(blocks) / 50.0, 1.0)
        return uniformity
    
    def _calculate_skin_detail(self, image: np.ndarray) -> float:
        """Calculate skin detail level"""
        # Real skin has pores and fine details
        high_freq = cv2.Laplacian(image, cv2.CV_64F).var()
        detail_score = min(high_freq / 500.0, 1.0)
        return detail_score
    
    def _estimate_face_depth(self, image: np.ndarray) -> float:
        """Estimate face depth using shading analysis"""
        # 3D faces have natural shading gradients
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        # Calculate gradients
        sobel_x = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
        sobel_y = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
        
        # Analyze gradient directions (natural faces have consistent shading)
        gradient_directions = np.arctan2(sobel_y, sobel_x)
        direction_consistency = np.std(gradient_directions)
        
        depth_score = 1.0 - min(direction_consistency / np.pi, 1.0)
        return depth_score
    
    def _detect_screen_refresh(self, frames: List[np.ndarray]) -> float:
        """Detect screen refresh patterns"""
        # Screens have refresh rate patterns
        if len(frames) < 5:
            return 0.0
        
        differences = []
        for i in range(1, len(frames)):
            diff = cv2.absdiff(frames[i-1], frames[i])
            differences.append(np.mean(diff))
        
        # Look for periodic patterns (screen refresh)
        fft = np.fft.fft(differences)
        frequencies = np.abs(fft)
        
        # Check for peaks at common refresh rates (60Hz, 120Hz, etc.)
        refresh_score = np.max(frequencies[1:]) / np.max(frequencies)
        
        return min(refresh_score, 1.0)
    
    def _detect_micro_expressions(self, frames: List[np.ndarray]) -> float:
        """Detect micro-expressions in temporal sequence"""
        if len(frames) < 10:
            return 0.0
        
        # Calculate optical flow between frames
        expression_changes = []
        prev_gray = cv2.cvtColor(frames[0], cv2.COLOR_BGR2GRAY)
        
        for i in range(1, min(10, len(frames))):
            curr_gray = cv2.cvtColor(frames[i], cv2.COLOR_BGR2GRAY)
            flow = cv2.calcOpticalFlowFarneback(
                prev_gray, curr_gray,
                None, 0.5, 3, 15, 3, 5, 1.2, 0
            )
            
            # Calculate motion magnitude
            magnitude = np.sqrt(flow[..., 0]**2 + flow[..., 1]**2)
            expression_changes.append(np.mean(magnitude))
            prev_gray = curr_gray
        
        # Real faces have small, random micro-expressions
        expression_score = np.std(expression_changes) / np.mean(expression_changes) if np.mean(expression_changes) > 0 else 0.0
        return min(expression_score * 10, 1.0)
    
    def _analyze_reflection_pattern(self, image: np.ndarray) -> float:
        """Analyze reflection patterns"""
        # Real skin and 3D masks reflect light differently
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
        saturation = hsv[:, :, 1]
        value = hsv[:, :, 2]
        
        # Calculate reflection patterns
        reflection_mask = (value > 200) & (saturation < 50)
        reflection_ratio = np.sum(reflection_mask) / reflection_mask.size
        
        # Natural faces have subtle reflections
        return min(reflection_ratio * 5, 1.0)
    
    def _analyze_noise_pattern(self, image: np.ndarray) -> float:
        """Analyze noise patterns"""
        # Real skin has natural noise, photos have different noise patterns
        # Calculate noise using wavelet decomposition
        import pywt
        
        coeffs = pywt.dwt2(image, 'haar')
        cA, (cH, cV, cD) = coeffs
        
        # High-frequency coefficients represent noise
        noise_level = np.std(cD)
        
        return min(noise_level / 50.0, 1.0)
    
    def _check_lighting_consistency(self, image: np.ndarray) -> float:
        """Check lighting consistency across face"""
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        # Divide face into regions
        h, w = gray.shape
        regions = [
            gray[:h//2, :w//2],  # Top-left
            gray[:h//2, w//2:],  # Top-right
            gray[h//2:, :w//2],  # Bottom-left
            gray[h//2:, w//2:],  # Bottom-right
        ]
        
        # Calculate brightness for each region
        brightness_values = [np.mean(region) for region in regions]
        
        # Real faces have gradual lighting changes
        brightness_diff = max(brightness_values) - min(brightness_values)
        consistency_score = 1.0 - min(brightness_diff / 100.0, 1.0)
        
        return consistency_score