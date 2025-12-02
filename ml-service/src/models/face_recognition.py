import cv2
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Tuple, List, Dict, Any, Optional
from facenet_pytorch import MTCNN, InceptionResnetV1
from insightface.app import FaceAnalysis
import warnings

warnings.filterwarnings("ignore")

class FaceRecognitionModel:
    """Face recognition and embedding generation model"""
    
    def __init__(self, device: str = "cpu"):
        self.device = device
        self.face_detector = None
        self.face_recognizer = None
        self.insight_app = None
        self._initialize_models()
    
    def _initialize_models(self):
        """Initialize face detection and recognition models"""
        try:
            # Initialize MTCNN for face detection
            self.face_detector = MTCNN(
                keep_all=True,
                device=self.device,
                thresholds=[0.6, 0.7, 0.7],
                min_face_size=20,
            )
            
            # Initialize FaceNet for embeddings
            self.face_recognizer = InceptionResnetV1(
                pretrained='vggface2'
            ).eval().to(self.device)
            
            # Initialize InsightFace for more accurate detection
            self.insight_app = FaceAnalysis(
                name='buffalo_l',
                providers=['CUDAExecutionProvider' if self.device == 'cuda' else 'CPUExecutionProvider']
            )
            self.insight_app.prepare(ctx_id=0 if self.device == 'cuda' else -1)
            
            print("Face recognition models initialized successfully")
            
        except Exception as e:
            print(f"Error initializing face recognition models: {e}")
            raise
    
    def detect_faces(self, image: np.ndarray) -> List[Dict[str, Any]]:
        """
        Detect faces in an image
        
        Args:
            image: Input image (BGR format)
        
        Returns:
            List of face detections with bounding boxes and landmarks
        """
        try:
            # Convert BGR to RGB
            image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            
            # Detect faces using InsightFace (more accurate)
            faces = self.insight_app.get(image_rgb)
            
            results = []
            for face in faces:
                bbox = face.bbox.astype(int)
                landmarks = face.kps
                
                # Calculate face quality score
                quality_score = self._calculate_face_quality(image, bbox, landmarks)
                
                results.append({
                    'bbox': bbox.tolist(),  # [x1, y1, x2, y2]
                    'landmarks': landmarks.tolist(),
                    'detection_score': float(face.det_score),
                    'quality_score': float(quality_score),
                    'pose': self._estimate_head_pose(landmarks),
                })
            
            return results
            
        except Exception as e:
            print(f"Error detecting faces: {e}")
            return []
    
    def extract_embeddings(self, image: np.ndarray, faces: List[Dict[str, Any]]) -> List[np.ndarray]:
        """
        Extract face embeddings for each detected face
        
        Args:
            image: Input image
            faces: List of face detections
        
        Returns:
            List of face embeddings (512-dimensional vectors)
        """
        embeddings = []
        
        try:
            image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            
            for face in faces:
                bbox = face['bbox']
                
                # Extract face region
                x1, y1, x2, y2 = bbox
                face_img = image_rgb[y1:y2, x1:x2]
                
                if face_img.size == 0:
                    continue
                
                # Resize to 160x160 for FaceNet
                face_img_resized = cv2.resize(face_img, (160, 160))
                
                # Normalize and convert to tensor
                face_tensor = torch.from_numpy(face_img_resized).permute(2, 0, 1).float()
                face_tensor = (face_tensor - 127.5) / 128.0  # Normalize to [-1, 1]
                face_tensor = face_tensor.unsqueeze(0).to(self.device)
                
                # Extract embedding
                with torch.no_grad():
                    embedding = self.face_recognizer(face_tensor)
                    embedding = F.normalize(embedding, p=2, dim=1)
                
                embeddings.append(embedding.cpu().numpy()[0])
            
        except Exception as e:
            print(f"Error extracting embeddings: {e}")
        
        return embeddings
    
    def compare_faces(self, embedding1: np.ndarray, embedding2: np.ndarray) -> float:
        """
        Compare two face embeddings and return similarity score
        
        Args:
            embedding1: First face embedding
            embedding2: Second face embedding
        
        Returns:
            Similarity score (0-1), higher means more similar
        """
        try:
            # Convert to tensors
            emb1 = torch.from_numpy(embedding1).float()
            emb2 = torch.from_numpy(embedding2).float()
            
            # Calculate cosine similarity
            similarity = F.cosine_similarity(emb1.unsqueeze(0), emb2.unsqueeze(0))
            
            # Convert to probability-like score (0-1)
            score = (similarity.item() + 1) / 2
            
            return float(score)
            
        except Exception as e:
            print(f"Error comparing faces: {e}")
            return 0.0
    
    def verify_face_match(
        self, 
        selfie_image: np.ndarray, 
        id_image: np.ndarray,
        threshold: float = 0.6
    ) -> Dict[str, Any]:
        """
        Verify if face in selfie matches face in ID document
        
        Args:
            selfie_image: Selfie image
            id_image: ID document image
            threshold: Similarity threshold for match
        
        Returns:
            Verification results
        """
        try:
            # Detect faces in both images
            selfie_faces = self.detect_faces(selfie_image)
            id_faces = self.detect_faces(id_image)
            
            if not selfie_faces or not id_faces:
                return {
                    'match_score': 0.0,
                    'is_match': False,
                    'confidence': 0.0,
                    'error': 'No faces detected in one or both images',
                }
            
            # Use the best quality face from each image
            selfie_face = max(selfie_faces, key=lambda x: x['quality_score'])
            id_face = max(id_faces, key=lambda x: x['quality_score'])
            
            # Extract embeddings
            selfie_embeddings = self.extract_embeddings(selfie_image, [selfie_face])
            id_embeddings = self.extract_embeddings(id_image, [id_face])
            
            if not selfie_embeddings or not id_embeddings:
                return {
                    'match_score': 0.0,
                    'is_match': False,
                    'confidence': 0.0,
                    'error': 'Failed to extract face embeddings',
                }
            
            # Compare embeddings
            similarity = self.compare_faces(selfie_embeddings[0], id_embeddings[0])
            
            # Calculate confidence based on face quality
            confidence = min(selfie_face['quality_score'], id_face['quality_score'])
            
            result = {
                'match_score': float(similarity),
                'is_match': similarity >= threshold,
                'confidence': float(confidence),
                'distance': float(1 - similarity),
                'selfie_face': {
                    'bbox': selfie_face['bbox'],
                    'quality_score': selfie_face['quality_score'],
                    'pose': selfie_face['pose'],
                },
                'id_face': {
                    'bbox': id_face['bbox'],
                    'quality_score': id_face['quality_score'],
                    'pose': id_face['pose'],
                },
                'embeddings': {
                    'selfie': selfie_embeddings[0].tolist(),
                    'id_photo': id_embeddings[0].tolist(),
                },
            }
            
            return result
            
        except Exception as e:
            print(f"Error in face verification: {e}")
            return {
                'match_score': 0.0,
                'is_match': False,
                'confidence': 0.0,
                'error': str(e),
            }
    
    def _calculate_face_quality(
        self, 
        image: np.ndarray, 
        bbox: List[int], 
        landmarks: np.ndarray
    ) -> float:
        """
        Calculate face quality score based on various factors
        
        Args:
            image: Input image
            bbox: Face bounding box [x1, y1, x2, y2]
            landmarks: Face landmarks
        
        Returns:
            Quality score (0-1)
        """
        try:
            x1, y1, x2, y2 = bbox
            
            # Check face size
            face_width = x2 - x1
            face_height = y2 - y1
            if face_width < 50 or face_height < 50:
                return 0.0
            
            # Extract face region
            face_region = image[y1:y2, x1:x2]
            if face_region.size == 0:
                return 0.0
            
            # Calculate brightness
            gray = cv2.cvtColor(face_region, cv2.COLOR_BGR2GRAY)
            brightness = np.mean(gray) / 255.0
            
            # Calculate contrast
            contrast = np.std(gray) / 255.0
            
            # Calculate sharpness (Laplacian variance)
            sharpness = cv2.Laplacian(gray, cv2.CV_64F).var() / 1000.0
            
            # Check if face is centered
            img_height, img_width = image.shape[:2]
            center_x = img_width // 2
            center_y = img_height // 2
            face_center_x = (x1 + x2) // 2
            face_center_y = (y1 + y2) // 2
            
            # Calculate distance from center (normalized)
            dist_x = abs(face_center_x - center_x) / img_width
            dist_y = abs(face_center_y - center_y) / img_height
            center_score = 1.0 - (dist_x + dist_y) / 2.0
            
            # Check frontal pose (using landmarks)
            frontal_score = self._calculate_frontal_score(landmarks)
            
            # Combined quality score
            quality_score = (
                0.2 * brightness +
                0.2 * contrast +
                0.2 * sharpness +
                0.2 * center_score +
                0.2 * frontal_score
            )
            
            return min(max(quality_score, 0.0), 1.0)
            
        except Exception as e:
            print(f"Error calculating face quality: {e}")
            return 0.0
    
    def _calculate_frontal_score(self, landmarks: np.ndarray) -> float:
        """
        Calculate how frontal the face is based on landmarks
        
        Args:
            landmarks: Face landmarks (5 points: left eye, right eye, nose, left mouth, right mouth)
        
        Returns:
            Frontal score (0-1)
        """
        try:
            # Calculate symmetry
            left_eye = landmarks[0]
            right_eye = landmarks[1]
            left_mouth = landmarks[3]
            right_mouth = landmarks[4]
            
            # Horizontal symmetry
            eye_center_y = (left_eye[1] + right_eye[1]) / 2
            mouth_center_y = (left_mouth[1] + right_mouth[1]) / 2
            eye_mouth_ratio = abs(eye_center_y - mouth_center_y)
            
            # Vertical alignment
            left_eye_nose_distance = np.linalg.norm(left_eye - landmarks[2])
            right_eye_nose_distance = np.linalg.norm(right_eye - landmarks[2])
            symmetry_ratio = min(left_eye_nose_distance, right_eye_nose_distance) / \
                           max(left_eye_nose_distance, right_eye_nose_distance)
            
            frontal_score = (symmetry_ratio + (1.0 - min(eye_mouth_ratio / 100.0, 1.0))) / 2.0
            
            return min(max(frontal_score, 0.0), 1.0)
            
        except:
            return 0.5
    
    def _estimate_head_pose(self, landmarks: np.ndarray) -> Dict[str, float]:
        """
        Estimate head pose (yaw, pitch, roll) from landmarks
        
        Args:
            landmarks: Face landmarks
        
        Returns:
            Head pose angles
        """
        try:
            # Simple pose estimation using landmark positions
            left_eye = landmarks[0]
            right_eye = landmarks[1]
            nose = landmarks[2]
            left_mouth = landmarks[3]
            right_mouth = landmarks[4]
            
            # Calculate yaw (horizontal rotation)
            eye_distance = np.linalg.norm(right_eye - left_eye)
            nose_eye_distance = np.linalg.norm(nose - (left_eye + right_eye) / 2)
            yaw = np.arctan2(nose_eye_distance, eye_distance) * 180 / np.pi
            
            # Calculate pitch (vertical rotation)
            eye_mouth_distance = np.linalg.norm((left_mouth + right_mouth) / 2 - (left_eye + right_eye) / 2)
            pitch = 0.0  # Simplified
            
            # Calculate roll (tilt)
            roll = np.arctan2(right_eye[1] - left_eye[1], right_eye[0] - left_eye[0]) * 180 / np.pi
            
            return {
                'yaw': float(yaw),
                'pitch': float(pitch),
                'roll': float(roll),
            }
            
        except:
            return {'yaw': 0.0, 'pitch': 0.0, 'roll': 0.0}