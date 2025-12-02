import numpy as np
from typing import List, Dict, Any, Optional
import hashlib
import json

class EmbeddingService:
    """Service for generating and comparing face embeddings"""
    
    def __init__(self, embedding_dim: int = 512):
        self.embedding_dim = embedding_dim
        
    def generate_embedding(self, face_image: np.ndarray) -> np.ndarray:
        """
        Generate embedding for face image
        
        Args:
            face_image: Face image (aligned and preprocessed)
        
        Returns:
            Face embedding vector
        """
        # This would use a pre-trained face recognition model
        # For demonstration, generate a random embedding
        np.random.seed(self._image_hash(face_image))
        embedding = np.random.randn(self.embedding_dim)
        
        # Normalize to unit length
        embedding = embedding / np.linalg.norm(embedding)
        
        return embedding
    
    def compare_embeddings(
        self,
        embedding1: np.ndarray,
        embedding2: np.ndarray
    ) -> Dict[str, Any]:
        """
        Compare two face embeddings
        
        Args:
            embedding1: First embedding
            embedding2: Second embedding
        
        Returns:
            Comparison results
        """
        # Ensure embeddings are normalized
        emb1 = embedding1 / np.linalg.norm(embedding1)
        emb2 = embedding2 / np.linalg.norm(embedding2)
        
        # Calculate cosine similarity
        similarity = np.dot(emb1, emb2)
        
        # Calculate Euclidean distance
        distance = np.linalg.norm(emb1 - emb2)
        
        # Calculate matching probability (sigmoid of similarity)
        probability = 1 / (1 + np.exp(-10 * (similarity - 0.5)))
        
        return {
            'similarity': float(similarity),
            'distance': float(distance),
            'probability': float(probability),
            'is_match': similarity > 0.6,  # Threshold
            'confidence': min(abs(similarity), 1.0),
        }
    
    def find_best_match(
        self,
        query_embedding: np.ndarray,
        reference_embeddings: List[np.ndarray],
        reference_ids: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Find best match for query embedding among references
        
        Args:
            query_embedding: Query embedding
            reference_embeddings: List of reference embeddings
            reference_ids: Optional IDs for references
        
        Returns:
            Best match results
        """
        if not reference_embeddings:
            return {
                'best_match_index': -1,
                'similarity': 0.0,
                'is_match': False,
                'confidence': 0.0,
            }
        
        # Calculate similarities
        similarities = []
        for ref_emb in reference_embeddings:
            similarity = np.dot(
                query_embedding / np.linalg.norm(query_embedding),
                ref_emb / np.linalg.norm(ref_emb)
            )
            similarities.append(similarity)
        
        # Find best match
        best_idx = np.argmax(similarities)
        best_similarity = similarities[best_idx]
        
        return {
            'best_match_index': int(best_idx),
            'best_match_id': reference_ids[best_idx] if reference_ids else None,
            'similarity': float(best_similarity),
            'is_match': best_similarity > 0.6,
            'confidence': float(best_similarity),
            'all_similarities': [float(s) for s in similarities],
        }
    
    def create_embedding_cache(self, embeddings: List[np.ndarray]) -> Dict[str, Any]:
        """
        Create optimized cache for embeddings
        
        Args:
            embeddings: List of embeddings
        
        Returns:
            Cache structure
        """
        # Convert to numpy array for efficient operations
        embedding_matrix = np.array(embeddings)
        
        # Normalize all embeddings
        norms = np.linalg.norm(embedding_matrix, axis=1, keepdims=True)
        normalized_matrix = embedding_matrix / norms
        
        return {
            'embeddings': normalized_matrix,
            'count': len(embeddings),
            'dimension': self.embedding_dim,
            'hash': self._embeddings_hash(embedding_matrix),
        }
    
    def _image_hash(self, image: np.ndarray) -> int:
        """Generate hash for image"""
        # Use average pixel value as simple hash
        return int(np.mean(image) * 1000)
    
    def _embeddings_hash(self, embeddings: np.ndarray) -> str:
        """Generate hash for embeddings"""
        # Flatten and hash
        flattened = embeddings.flatten().tobytes()
        return hashlib.md5(flattened).hexdigest()
    
    def validate_embedding(self, embedding: np.ndarray) -> bool:
        """
        Validate embedding vector
        
        Args:
            embedding: Embedding to validate
        
        Returns:
            Whether embedding is valid
        """
        if embedding.shape[0] != self.embedding_dim:
            return False
        
        # Check for NaN or infinite values
        if np.any(np.isnan(embedding)) or np.any(np.isinf(embedding)):
            return False
        
        # Check magnitude (should be close to 1 for normalized embeddings)
        magnitude = np.linalg.norm(embedding)
        if magnitude < 0.1 or magnitude > 10:
            return False
        
        return True