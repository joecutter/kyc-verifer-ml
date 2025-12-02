import os
import sys
from typing import List, Optional
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

load_dotenv()

class Settings(BaseSettings):
    # Server
    APP_NAME: str = "KYC ML Service"
    APP_VERSION: str = "1.0.0"
    HOST: str = "0.0.0.0"
    PORT: int = 5000
    DEBUG: bool = os.getenv("DEBUG", "False").lower() == "true"
    WORKERS: int = int(os.getenv("WORKERS", "1"))
    RELOAD: bool = os.getenv("RELOAD", "False").lower() == "true"
    
    # Redis
    REDIS_HOST: str = os.getenv("REDIS_HOST", "localhost")
    REDIS_PORT: int = int(os.getenv("REDIS_PORT", "6379"))
    REDIS_PASSWORD: Optional[str] = os.getenv("REDIS_PASSWORD")
    REDIS_DB: int = int(os.getenv("REDIS_DB", "0"))
    
    # Models
    MODEL_DIR: str = os.getenv("MODEL_DIR", "./models")
    FACE_DETECTION_MODEL: str = os.path.join(MODEL_DIR, "face_detection")
    FACE_RECOGNITION_MODEL: str = os.path.join(MODEL_DIR, "face_recognition")
    LIVENESS_MODEL: str = os.path.join(MODEL_DIR, "liveness")
    ANTI_SPOOF_MODEL: str = os.path.join(MODEL_DIR, "anti_spoof")
    DOCUMENT_MODEL: str = os.path.join(MODEL_DIR, "document")
    
    # Thresholds
    FACE_MATCH_THRESHOLD: float = float(os.getenv("FACE_MATCH_THRESHOLD", "0.6"))
    LIVENESS_THRESHOLD: float = float(os.getenv("LIVENESS_THRESHOLD", "0.7"))
    ANTI_SPOOF_THRESHOLD: float = float(os.getenv("ANTI_SPOOF_THRESHOLD", "0.8"))
    DOCUMENT_QUALITY_THRESHOLD: float = float(os.getenv("DOCUMENT_QUALITY_THRESHOLD", "0.5"))
    
    # Performance
    MAX_IMAGE_SIZE: int = int(os.getenv("MAX_IMAGE_SIZE", "1920"))
    MIN_FACE_SIZE: int = int(os.getenv("MIN_FACE_SIZE", "100"))
    BATCH_SIZE: int = int(os.getenv("BATCH_SIZE", "32"))
    CACHE_SIZE: int = int(os.getenv("CACHE_SIZE", "1000"))
    
    # GPU
    GPU_ENABLED: bool = os.getenv("GPU_ENABLED", "False").lower() == "true"
    
    # Security
    API_KEY: Optional[str] = os.getenv("API_KEY")
    RATE_LIMIT_PER_MINUTE: int = int(os.getenv("RATE_LIMIT_PER_MINUTE", "60"))
    CORS_ORIGINS: List[str] = os.getenv("CORS_ORIGINS", "*").split(",")
    
    # Backend
    BACKEND_URL: str = os.getenv("BACKEND_URL", "http://localhost:3001")
    
    # Logging
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    LOG_FILE: Optional[str] = os.getenv("LOG_FILE")
    
    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()

# Determine device
try:
    import torch
    DEVICE = "cuda" if settings.GPU_ENABLED and torch.cuda.is_available() else "cpu"
    if DEVICE == "cuda":
        print(f"Using GPU: {torch.cuda.get_device_name(0)}")
    else:
        print("Using CPU")
except ImportError:
    DEVICE = "cpu"
    print("Torch not available, using CPU")

settings.DEVICE = DEVICE