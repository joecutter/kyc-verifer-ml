from pydantic import BaseModel, Field, HttpUrl
from typing import Optional, List, Dict, Any
from datetime import datetime

class HealthResponse(BaseModel):
    status: str
    timestamp: float
    service: str
    version: str
    redis: Optional[str] = None
    ml_models: Dict[str, str] = Field(default_factory=dict)
    system: Dict[str, Any] = Field(default_factory=dict)

class LivenessRequest(BaseModel):
    image_url: HttpUrl
    attempt_id: str
    challenge_type: Optional[str] = None

class LivenessResponse(BaseModel):
    liveness_score: float = Field(..., ge=0.0, le=1.0)
    is_live: bool
    confidence: float = Field(..., ge=0.0, le=1.0)
    spoof_type: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    attempt_id: Optional[str] = None
    timestamp: Optional[float] = None

class FaceMatchRequest(BaseModel):
    selfie_url: HttpUrl
    id_photo_url: HttpUrl
    attempt_id: str

class FaceMatchResponse(BaseModel):
    match_score: float = Field(..., ge=0.0, le=1.0)
    is_match: bool
    confidence: float = Field(..., ge=0.0, le=1.0)
    distance: float = Field(..., ge=0.0)
    embeddings: Dict[str, List[float]] = Field(default_factory=dict)
    selfie_face: Optional[Dict[str, Any]] = None
    id_face: Optional[Dict[str, Any]] = None
    attempt_id: Optional[str] = None
    timestamp: Optional[float] = None

class DocumentVerificationRequest(BaseModel):
    front_url: HttpUrl
    back_url: Optional[HttpUrl] = None
    attempt_id: str
    document_type: Optional[str] = None

class DocumentVerificationResponse(BaseModel):
    is_valid: bool
    document_type: str
    extracted_data: Dict[str, Any] = Field(default_factory=dict)
    quality_score: float = Field(..., ge=0.0, le=1.0)
    fraud_indicators: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    attempt_id: Optional[str] = None
    timestamp: Optional[float] = None

class KYCVerificationRequest(BaseModel):
    attempt_id: str
    selfie_url: HttpUrl
    id_front_url: HttpUrl
    id_back_url: Optional[HttpUrl] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)

class KYCVerificationResponse(BaseModel):
    liveness_score: float = Field(..., ge=0.0, le=1.0)
    match_score: float = Field(..., ge=0.0, le=1.0)
    fraud_score: float = Field(..., ge=0.0, le=1.0)
    document_quality_score: float = Field(..., ge=0.0, le=1.0)
    overall_score: float = Field(..., ge=0.0, le=1.0)
    status: str  # "approved", "rejected", "manual_review"
    reasons: List[str] = Field(default_factory=list)
    confidence: float = Field(..., ge=0.0, le=1.0)
    processing_time: float
    metadata: Dict[str, Any] = Field(default_factory=dict)

class ErrorResponse(BaseModel):
    success: bool = False
    error: str
    transaction_id: Optional[str] = None
    details: Optional[Dict[str, Any]] = None

class SuccessResponse(BaseModel):
    success: bool = True
    message: str
    data: Optional[Dict[str, Any]] = None
    transaction_id: Optional[str] = None

class ModelStatusResponse(BaseModel):
    face_recognition: Dict[str, Any]
    liveness_detection: Dict[str, Any]
    document_verification: Dict[str, Any]
    anti_spoof: Dict[str, Any]
    timestamp: float

class MetricsResponse(BaseModel):
    uptime: float
    total_inferences: int
    overall_success_rate: float
    models: Dict[str, Dict[str, Any]]
    timestamp: float