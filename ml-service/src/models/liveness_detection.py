import cv2
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import List, Dict, Any, Tuple
from collections import deque
import warnings

warnings.filterwarnings("ignore")

class LivenessDetectionModel:
    """Liveness detection to prevent spoofing attacks"""
    
    def __init__(self, device: str = "cpu"):
        self.device = device
        self.model = None
        self.face_detector = None
        self._initialize_model()
        
        # For temporal analysis
        self.face_history = {}
        self.max_history = 30
        
    def _initialize_model(self):
        """Initialize liveness detection model"""
        try:
            # This would load a pre-trained liveness detection model
            # For this example, we'll create a simple CNN model
            
            class LivenessNet(nn.Module):
                def __init__(self):
                    super(LivenessNet, self).__init__()
                    self.conv1 = nn.Conv2d(3, 32, kernel_size=3, padding=1)
                    self.conv2 = nn.Conv2d(32, 64, kernel_size=3, padding=1)
                    self.conv3 = nn.Conv2d(64, 128, kernel_size=3, padding=1)
                    self.pool = nn.MaxPool2d(2, 2)
                    self.dropout = nn.Dropout(0.5)
                    self.fc1 = nn.Linear(128 * 12 * 12, 256)
                    self.fc2 = nn.Linear(256, 2)
                    
                def forward(self, x):
                    x = self.pool(F.relu(self.conv1(x)))
                    x = self.pool(F.relu(self.conv2(x)))
                    x = self.pool(F.relu(self.conv3(x)))
                    x = x.view(-1, 128 * 12 * 12)
                    x = F.relu(self.fc1(x))
                    x = self.dropout(x)
                    x = self.fc2(x)
                    return x
            
            self.model = LivenessNet().to(self.device)
            
            # Load pre-trained weights (in production, you would load actual trained model)
            print("Liveness detection model initialized")
            
        except Exception as e:
            print(f"Error initializing liveness model: {e}")
            raise
    
    def detect_liveness(
        self, 
        image: np.ndarray,
        challenge_type: str = None,
        temporal_data: List[np.ndarray] = None
    ) -> Dict[str, Any]:
        """
        Detect liveness in an image
        
        Args:
            image: Input image
            challenge_type: Type of liveness challenge (blink, head_turn, smile)
            temporal_data: List of previous frames for temporal analysis
        
        Returns:
            Liveness detection results
        """
        try:
            # Convert BGR to RGB
            image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            
            # Basic liveness detection using multiple methods
            results = {
                'liveness_score': 0.0,
                'is_live': False,
                'confidence': 0.0,
                'spoof_type': None,
                'metadata': {},
            }
            
            # Method 1: Texture analysis
            texture_score = self._analyze_texture(image_rgb)
            
            # Method 2: Color analysis
            color_score = self._analyze_color_space(image_rgb)
            
            # Method 3: Edge analysis
            edge_score = self._analyze_edges(image_rgb)
            
            # Method 4: Reflection detection
            reflection_score = self._detect_reflections(image_rgb)
            
            # Method 5: Challenge-specific analysis
            challenge_score = 0.5
            if challenge_type and temporal_data:
                challenge_score = self._analyze_challenge(
                    temporal_data, 
                    challenge_type
                )
            
            # Combine scores
            scores = [
                texture_score,
                color_score,
                edge_score,
                (1.0 - reflection_score),  # Lower reflection is better
                challenge_score,
            ]
            weights = [0.25, 0.20, 0.20, 0.15, 0.20]
            
            liveness_score = sum(s * w for s, w in zip(scores, weights))
            
            # Apply model-based detection if available
            if self.model is not None:
                model_score = self._model_based_detection(image_rgb)
                liveness_score = (liveness_score + model_score) / 2
            
            # Determine spoof type
            spoof_type = self._detect_spoof_type(
                texture_score, 
                color_score, 
                edge_score, 
                reflection_score
            )
            
            # Calculate confidence
            confidence = self._calculate_confidence(scores)
            
            results.update({
                'liveness_score': float(liveness_score),
                'is_live': liveness_score >= 0.7,  # Threshold
                'confidence': float(confidence),
                'spoof_type': spoof_type,
                'metadata': {
                    'texture_score': float(texture_score),
                    'color_score': float(color_score),
                    'edge_score': float(edge_score),
                    'reflection_score': float(reflection_score),
                    'challenge_score': float(challenge_score),
                    'model_score': float(model_score if 'model_score' in locals() else 0.5),
                },
            })
            
            return results
            
        except Exception as e:
            print(f"Error in liveness detection: {e}")
            return {
                'liveness_score': 0.0,
                'is_live': False,
                'confidence': 0.0,
                'error': str(e),
            }
    
    def _analyze_texture(self, image: np.ndarray) -> float:
        """Analyze texture patterns for liveness detection"""
        try:
            # Convert to grayscale
            gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
            
            # Calculate Local Binary Patterns (LBP)
            radius = 3
            n_points = 8 * radius
            
            # Compute LBP
            lbp = np.zeros_like(gray, dtype=np.uint8)
            for i in range(radius, gray.shape[0] - radius):
                for j in range(radius, gray.shape[1] - radius):
                    center = gray[i, j]
                    code = 0
                    for k in range(n_points):
                        angle = 2 * np.pi * k / n_points
                        x = j + int(radius * np.cos(angle))
                        y = i - int(radius * np.sin(angle))
                        if gray[y, x] >= center:
                            code |= 1 << k
                    lbp[i, j] = code
            
            # Calculate histogram
            hist, _ = np.histogram(lbp.ravel(), bins=256, range=(0, 256))
            hist = hist.astype("float")
            hist /= (hist.sum() + 1e-7)
            
            # Real faces have more uniform texture
            entropy = -np.sum(hist * np.log2(hist + 1e-7))
            texture_score = min(entropy / 8.0, 1.0)  # Normalize
            
            return texture_score
            
        except:
            return 0.5
    
    def _analyze_color_space(self, image: np.ndarray) -> float:
        """Analyze color space for liveness detection"""
        try:
            # Convert to different color spaces
            hsv = cv2.cvtColor(image, cv2.COLOR_RGB2HSV)
            ycrcb = cv2.cvtColor(image, cv2.COLOR_RGB2YCrCb)
            
            # Analyze skin tone detection
            # Real faces have specific color distributions
            
            # Check HSV skin mask
            lower_skin = np.array([0, 20, 70], dtype=np.uint8)
            upper_skin = np.array([20, 255, 255], dtype=np.uint8)
            skin_mask_hsv = cv2.inRange(hsv, lower_skin, upper_skin)
            
            # Check YCrCb skin mask
            lower_skin = np.array([0, 133, 77], dtype=np.uint8)
            upper_skin = np.array([255, 173, 127], dtype=np.uint8)
            skin_mask_ycrcb = cv2.inRange(ycrcb, lower_skin, upper_skin)
            
            # Combine masks
            skin_mask = cv2.bitwise_and(skin_mask_hsv, skin_mask_ycrcb)
            
            # Calculate skin percentage
            skin_ratio = np.sum(skin_mask > 0) / skin_mask.size
            
            # Real faces typically have 15-40% skin in frame
            if 0.15 <= skin_ratio <= 0.40:
                color_score = 0.8
            elif 0.10 <= skin_ratio <= 0.50:
                color_score = 0.5
            else:
                color_score = 0.2
            
            return color_score
            
        except:
            return 0.5
    
    def _analyze_edges(self, image: np.ndarray) -> float:
        """Analyze edge patterns for liveness detection"""
        try:
            # Convert to grayscale
            gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
            
            # Apply Canny edge detection
            edges = cv2.Canny(gray, 100, 200)
            
            # Calculate edge density
            edge_density = np.sum(edges > 0) / edges.size
            
            # Real faces have moderate edge density
            # Too many edges = printed photo, too few = blurry/spoof
            if 0.05 <= edge_density <= 0.20:
                edge_score = 0.8
            elif 0.02 <= edge_density <= 0.30:
                edge_score = 0.5
            else:
                edge_score = 0.2
            
            return edge_score
            
        except:
            return 0.5
    
    def _detect_reflections(self, image: np.ndarray) -> float:
        """Detect screen reflections (common in replay attacks)"""
        try:
            # Convert to grayscale
            gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
            
            # Apply Sobel filter for gradient detection
            sobel_x = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=5)
            sobel_y = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=5)
            
            # Calculate gradient magnitude
            magnitude = np.sqrt(sobel_x**2 + sobel_y**2)
            
            # Look for high gradient areas (potential reflections)
            reflection_threshold = 0.3 * np.max(magnitude)
            reflection_mask = magnitude > reflection_threshold
            
            # Calculate reflection ratio
            reflection_ratio = np.sum(reflection_mask) / reflection_mask.size
            
            return float(reflection_ratio)
            
        except:
            return 0.0
    
    def _analyze_challenge(
        self, 
        frames: List[np.ndarray], 
        challenge_type: str
    ) -> float:
        """Analyze liveness challenge response"""
        try:
            if len(frames) < 2:
                return 0.5
            
            if challenge_type == "blink":
                return self._detect_blink(frames)
            elif challenge_type == "head_turn":
                return self._detect_head_turn(frames)
            elif challenge_type == "smile":
                return self._detect_smile(frames)
            else:
                return 0.5
                
        except:
            return 0.5
    
    def _detect_blink(self, frames: List[np.ndarray]) -> float:
        """Detect blink pattern in sequence of frames"""
        try:
            # For demo purposes - in production, you would use eye landmark detection
            # and calculate eye aspect ratio (EAR) over time
            
            # Simulate blink detection
            if len(frames) >= 10:
                # Random pattern that looks like blinking
                blink_pattern = [0.3, 0.2, 0.1, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6]
                blink_score = np.mean(blink_pattern[:len(frames)])
                return min(blink_score, 1.0)
            
            return 0.5
            
        except:
            return 0.5
    
    def _detect_head_turn(self, frames: List[np.ndarray]) -> float:
        """Detect head turning pattern"""
        try:
            # In production, use head pose estimation over time
            if len(frames) >= 5:
                # Simulate head turn detection
                turn_scores = []
                for i in range(len(frames) - 1):
                    # Compare consecutive frames
                    diff = cv2.absdiff(frames[i], frames[i + 1])
                    turn_scores.append(np.mean(diff) / 255.0)
                
                if turn_scores:
                    avg_score = np.mean(turn_scores)
                    return min(avg_score * 2, 1.0)
            
            return 0.5
            
        except:
            return 0.5
    
    def _detect_smile(self, frames: List[np.ndarray]) -> float:
        """Detect smile pattern"""
        try:
            # In production, use facial landmark detection
            # and measure mouth aspect ratio (MAR) over time
            
            if len(frames) >= 5:
                # Simulate smile detection
                smile_pattern = [0.2, 0.3, 0.4, 0.6, 0.8]
                smile_score = np.mean(smile_pattern[:len(frames)])
                return min(smile_score, 1.0)
            
            return 0.5
            
        except:
            return 0.5
    
    def _model_based_detection(self, image: np.ndarray) -> float:
        """Use trained model for liveness detection"""
        try:
            # Preprocess image
            image_resized = cv2.resize(image, (96, 96))
            image_tensor = torch.from_numpy(image_resized).permute(2, 0, 1).float()
            image_tensor = image_tensor.unsqueeze(0).to(self.device)
            
            # Normalize
            image_tensor = (image_tensor - 127.5) / 128.0
            
            # Get prediction
            with torch.no_grad():
                outputs = self.model(image_tensor)
                probabilities = F.softmax(outputs, dim=1)
                live_prob = probabilities[0][1].item()
            
            return live_prob
            
        except:
            return 0.5
    
    def _detect_spoof_type(
        self, 
        texture_score: float,
        color_score: float,
        edge_score: float,
        reflection_score: float
    ) -> str:
        """Detect type of spoof attack"""
        try:
            # Printed photo detection
            if edge_score < 0.3 and texture_score < 0.3:
                return "printed_photo"
            
            # Screen replay detection
            if reflection_score > 0.1:
                return "screen_replay"
            
            # Mask detection
            if color_score < 0.3:
                return "mask"
            
            # 3D mask or mannequin
            if texture_score > 0.8 and color_score > 0.8:
                return "3d_mask"
            
            return None
            
        except:
            return None
    
    def _calculate_confidence(self, scores: List[float]) -> float:
        """Calculate confidence based on consistency of scores"""
        try:
            # Variance of scores (lower variance = higher confidence)
            variance = np.var(scores)
            confidence = 1.0 - min(variance * 5, 1.0)
            
            return max(confidence, 0.0)
            
        except:
            return 0.5