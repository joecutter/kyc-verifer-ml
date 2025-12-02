from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from fastapi.responses import JSONResponse
from typing import Optional, List
import cv2
import numpy as np
from PIL import Image
import io
import asyncio

from src.config import settings
from src.api.schemas import (
    LivenessRequest,
    LivenessResponse,
    FaceMatchRequest,
    FaceMatchResponse,
    DocumentVerificationRequest,
    DocumentVerificationResponse,
    KYCVerificationRequest,
    KYCVerificationResponse,
)
from src.models.face_recognition import FaceRecognitionModel
from src.models.liveness_detection import LivenessDetectionModel
from src.models.document_verification import DocumentVerificationModel
from src.utils.logger import get_logger

logger = get_logger(__name__)

router = APIRouter()

# Initialize models (singleton pattern)
face_model = None
liveness_model = None
document_model = None

def get_face_model():
    global face_model
    if face_model is None:
        face_model = FaceRecognitionModel(device=settings.DEVICE)
    return face_model

def get_liveness_model():
    global liveness_model
    if liveness_model is None:
        liveness_model = LivenessDetectionModel(device=settings.DEVICE)
    return liveness_model

def get_document_model():
    global document_model
    if document_model is None:
        document_model = DocumentVerificationModel()
    return document_model

async def download_image(url: str) -> np.ndarray:
    """Download image from URL"""
    import aiohttp
    
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as response:
            if response.status != 200:
                raise HTTPException(status_code=400, detail=f"Failed to download image from {url}")
            
            image_data = await response.read()
            image = Image.open(io.BytesIO(image_data))
            return cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)

def validate_image(file: UploadFile) -> np.ndarray:
    """Validate and convert uploaded image"""
    try:
        # Read image
        contents = file.file.read()
        image = Image.open(io.BytesIO(contents))
        
        # Convert to OpenCV format
        cv_image = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        
        # Validate size
        if cv_image.size > settings.MAX_IMAGE_SIZE * settings.MAX_IMAGE_SIZE * 3:
            raise HTTPException(
                status_code=400, 
                detail=f"Image too large. Max size: {settings.MAX_IMAGE_SIZE}x{settings.MAX_IMAGE_SIZE}"
            )
        
        return cv_image
        
    except Exception as e:
        logger.error(f"Error validating image: {e}")
        raise HTTPException(status_code=400, detail="Invalid image file")

@router.post("/detect-liveness", response_model=LivenessResponse)
async def detect_liveness(
    request: LivenessRequest,
    liveness_model: LivenessDetectionModel = Depends(get_liveness_model)
):
    """
    Detect liveness in selfie image
    
    Args:
        request: Liveness detection request
    
    Returns:
        Liveness detection results
    """
    try:
        logger.info(f"Liveness detection request: {request.attempt_id}")
        
        # Download image
        image = await download_image(request.image_url)
        
        # Detect liveness
        result = liveness_model.detect_liveness(
            image=image,
            challenge_type=request.challenge_type,
            temporal_data=None  # Would be passed in production
        )
        
        # Add request metadata
        result['attempt_id'] = request.attempt_id
        result['timestamp'] = asyncio.get_event_loop().time()
        
        logger.info(f"Liveness detection completed: {result['liveness_score']}")
        
        return result
        
    except Exception as e:
        logger.error(f"Liveness detection error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/verify-face-match", response_model=FaceMatchResponse)
async def verify_face_match(
    request: FaceMatchRequest,
    face_model: FaceRecognitionModel = Depends(get_face_model)
):
    """
    Verify if face in selfie matches face in ID document
    
    Args:
        request: Face match request
    
    Returns:
        Face match verification results
    """
    try:
        logger.info(f"Face match request: {request.attempt_id}")
        
        # Download both images
        selfie_image = await download_image(request.selfie_url)
        id_image = await download_image(request.id_photo_url)
        
        # Verify face match
        result = face_model.verify_face_match(
            selfie_image=selfie_image,
            id_image=id_image,
            threshold=settings.FACE_MATCH_THRESHOLD
        )
        
        # Add request metadata
        result['attempt_id'] = request.attempt_id
        result['timestamp'] = asyncio.get_event_loop().time()
        
        logger.info(f"Face match completed: {result['match_score']}")
        
        return result
        
    except Exception as e:
        logger.error(f"Face match error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/verify-document", response_model=DocumentVerificationResponse)
async def verify_document(
    request: DocumentVerificationRequest,
    document_model: DocumentVerificationModel = Depends(get_document_model)
):
    """
    Verify document and extract information
    
    Args:
        request: Document verification request
    
    Returns:
        Document verification results
    """
    try:
        logger.info(f"Document verification request: {request.attempt_id}")
        
        # Download images
        front_image = await download_image(request.front_url)
        back_image = await download_image(request.back_url) if request.back_url else None
        
        # Verify document
        result = document_model.verify_document(
            front_image=front_image,
            back_image=back_image,
            document_type=request.document_type
        )
        
        # Add request metadata
        result['attempt_id'] = request.attempt_id
        result['timestamp'] = asyncio.get_event_loop().time()
        
        logger.info(f"Document verification completed: {result['is_valid']}")
        
        return result
        
    except Exception as e:
        logger.error(f"Document verification error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/verify-kyc", response_model=KYCVerificationResponse)
async def verify_kyc(
    request: KYCVerificationRequest,
    face_model: FaceRecognitionModel = Depends(get_face_model),
    liveness_model: LivenessDetectionModel = Depends(get_liveness_model),
    document_model: DocumentVerificationModel = Depends(get_document_model)
):
    """
    Complete KYC verification pipeline
    
    Args:
        request: KYC verification request
    
    Returns:
        Complete KYC verification results
    """
    try:
        logger.info(f"KYC verification request: {request.attempt_id}")
        
        start_time = asyncio.get_event_loop().time()
        
        # Download all images
        download_tasks = [
            download_image(request.selfie_url),
            download_image(request.id_front_url),
        ]
        
        if request.id_back_url:
            download_tasks.append(download_image(request.id_back_url))
        
        images = await asyncio.gather(*download_tasks)
        
        selfie_image = images[0]
        id_front_image = images[1]
        id_back_image = images[2] if len(images) > 2 else None
        
        # Run all verifications in parallel
        verification_tasks = [
            asyncio.to_thread(
                liveness_model.detect_liveness,
                selfie_image,
                None,
                None
            ),
            asyncio.to_thread(
                face_model.verify_face_match,
                selfie_image,
                id_front_image,
                settings.FACE_MATCH_THRESHOLD
            ),
            asyncio.to_thread(
                document_model.verify_document,
                id_front_image,
                id_back_image,
                None
            ),
        ]
        
        results = await asyncio.gather(*verification_tasks, return_exceptions=True)
        
        # Handle any exceptions
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error(f"Verification task {i} failed: {result}")
                results[i] = {
                    'liveness_score': 0.0,
                    'is_live': False,
                    'match_score': 0.0,
                    'is_match': False,
                    'is_valid': False,
                    'fraud_indicators': ['verification_failed'],
                }
        
        liveness_result, face_match_result, document_result = results
        
        # Calculate overall scores
        liveness_score = liveness_result.get('liveness_score', 0.0)
        match_score = face_match_result.get('match_score', 0.0)
        document_quality_score = document_result.get('quality_score', 0.0)
        
        # Calculate fraud score
        fraud_indicators = []
        fraud_indicators.extend(liveness_result.get('spoof_type', []))
        fraud_indicators.extend(document_result.get('fraud_indicators', []))
        
        fraud_score = min(len(fraud_indicators) / 10.0, 1.0)
        
        # Calculate overall score
        overall_score = (
            liveness_score * 0.3 +
            match_score * 0.4 +
            document_quality_score * 0.2 +
            (1 - fraud_score) * 0.1
        )
        
        # Determine status
        if overall_score >= 0.8 and liveness_score >= 0.7 and match_score >= 0.6:
            status = "approved"
        elif overall_score >= 0.6:
            status = "manual_review"
        else:
            status = "rejected"
        
        # Calculate processing time
        processing_time = asyncio.get_event_loop().time() - start_time
        
        # Build response
        response = KYCVerificationResponse(
            liveness_score=liveness_score,
            match_score=match_score,
            fraud_score=fraud_score,
            document_quality_score=document_quality_score,
            overall_score=overall_score,
            status=status,
            reasons=fraud_indicators,
            confidence=min(liveness_result.get('confidence', 0.0), 
                         face_match_result.get('confidence', 0.0)),
            processing_time=processing_time,
            metadata={
                'attempt_id': request.attempt_id,
                'liveness_details': liveness_result.get('metadata', {}),
                'face_match_details': {
                    'selfie_face': face_match_result.get('selfie_face', {}),
                    'id_face': face_match_result.get('id_face', {}),
                },
                'document_details': {
                    'extracted_data': document_result.get('extracted_data', {}),
                    'fraud_indicators': document_result.get('fraud_indicators', []),
                },
            },
        )
        
        logger.info(f"KYC verification completed: {status} (score: {overall_score:.2f})")
        
        return response
        
    except Exception as e:
        logger.error(f"KYC verification error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/upload")
async def upload_image(
    file: UploadFile = File(...),
    file_type: str = Form(...)
):
    """
    Upload image for processing
    
    Args:
        file: Image file
        file_type: Type of image (selfie, id_front, id_back)
    
    Returns:
        Upload results
    """
    try:
        # Validate file type
        if file_type not in ['selfie', 'id_front', 'id_back']:
            raise HTTPException(status_code=400, detail="Invalid file type")
        
        # Validate and process image
        image = validate_image(file)
        
        # In production, you would save the image to storage
        # and return a URL or identifier
        
        return {
            "success": True,
            "message": "Image uploaded successfully",
            "file_type": file_type,
            "image_size": f"{image.shape[1]}x{image.shape[0]}",
            "processing_available": True,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Image upload error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/models/status")
async def get_model_status():
    """
    Get status of all ML models
    
    Returns:
        Model status information
    """
    try:
        models = {
            "face_recognition": {
                "status": "loaded" if face_model else "not_loaded",
                "device": settings.DEVICE,
            },
            "liveness_detection": {
                "status": "loaded" if liveness_model else "not_loaded",
                "device": settings.DEVICE,
            },
            "document_verification": {
                "status": "loaded" if document_model else "not_loaded",
                "ocr_engine": "easyocr" if document_model and document_model.reader else "pytesseract",
            },
        }
        
        return {
            "success": True,
            "models": models,
            "timestamp": asyncio.get_event_loop().time(),
        }
        
    except Exception as e:
        logger.error(f"Model status error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))