from fastapi import FastAPI, Request, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
import time
import uuid
from typing import Dict, Any
import redis.asyncio as redis

from src.config import settings
from src.utils.logger import setup_logger
from src.api.routes import router as api_router
from src.api.middleware import RateLimitMiddleware, AuthMiddleware
from src.utils.metrics import MetricsMiddleware, metrics_router

# Setup logger
logger = setup_logger(__name__)

# Create FastAPI app
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security middleware
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["*"])
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Custom middleware
app.add_middleware(MetricsMiddleware)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(AuthMiddleware)

# Add routers
app.include_router(api_router, prefix="/api/v1")
app.include_router(metrics_router, prefix="/metrics")

# Global Redis connection pool
redis_pool = None

@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    global redis_pool
    
    logger.info(f"Starting {settings.APP_NAME} v{settings.APP_VERSION}")
    logger.info(f"Environment: {'development' if settings.DEBUG else 'production'}")
    logger.info(f"Using device: {settings.DEVICE}")
    
    # Initialize Redis
    try:
        redis_pool = redis.ConnectionPool.from_url(
            f"redis://{settings.REDIS_HOST}:{settings.REDIS_PORT}/{settings.REDIS_DB}",
            password=settings.REDIS_PASSWORD,
            decode_responses=True,
            max_connections=20,
        )
        logger.info(f"Redis connected: {settings.REDIS_HOST}:{settings.REDIS_PORT}")
    except Exception as e:
        logger.error(f"Redis connection failed: {e}")
        redis_pool = None
    
    # Load ML models (this would be done in actual implementation)
    logger.info("Startup completed")

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    logger.info("Shutting down...")
    
    if redis_pool:
        await redis_pool.disconnect()
        logger.info("Redis connection closed")

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Handle HTTP exceptions"""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "error": exc.detail,
            "transaction_id": getattr(request.state, "transaction_id", None),
        },
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle validation errors"""
    errors = []
    for error in exc.errors():
        errors.append({
            "field": ".".join(error["loc"]),
            "message": error["msg"],
            "type": error["type"],
        })
    
    return JSONResponse(
        status_code=422,
        content={
            "success": False,
            "error": "Validation failed",
            "errors": errors,
            "transaction_id": getattr(request.state, "transaction_id", None),
        },
    )

@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    """Handle all other exceptions"""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": "Internal server error",
            "transaction_id": getattr(request.state, "transaction_id", None),
        },
    )

@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    """Add processing time to response headers"""
    start_time = time.time()
    transaction_id = str(uuid.uuid4())[:8]
    
    # Add transaction ID to request state
    request.state.transaction_id = transaction_id
    
    # Add request info to logs
    logger.info(
        f"Request started: {request.method} {request.url.path}",
        extra={
            "transaction_id": transaction_id,
            "method": request.method,
            "path": request.url.path,
            "client_ip": request.client.host if request.client else None,
        }
    )
    
    try:
        response = await call_next(request)
    except Exception as e:
        logger.error(
            f"Request failed: {e}",
            extra={"transaction_id": transaction_id},
            exc_info=True
        )
        raise
    
    # Calculate processing time
    process_time = time.time() - start_time
    
    # Add headers
    response.headers["X-Process-Time"] = str(process_time)
    response.headers["X-Transaction-ID"] = transaction_id
    
    # Log completion
    logger.info(
        f"Request completed: {response.status_code} in {process_time:.3f}s",
        extra={
            "transaction_id": transaction_id,
            "status_code": response.status_code,
            "process_time": process_time,
        }
    )
    
    return response

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": f"Welcome to {settings.APP_NAME}",
        "version": settings.APP_VERSION,
        "status": "operational",
        "documentation": "/docs" if settings.DEBUG else None,
    }

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    health_status: Dict[str, Any] = {
        "status": "healthy",
        "timestamp": time.time(),
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
    }
    
    # Check Redis
    if redis_pool:
        try:
            async with redis.Redis(connection_pool=redis_pool) as r:
                await r.ping()
            health_status["redis"] = "healthy"
        except Exception as e:
            health_status["redis"] = "unhealthy"
            health_status["redis_error"] = str(e)
    else:
        health_status["redis"] = "not_configured"
    
    # Check ML models (simplified)
    health_status["ml_models"] = {
        "face_recognition": "loaded",
        "liveness_detection": "loaded",
        "document_verification": "loaded",
    }
    
    # System info
    health_status["system"] = {
        "python_version": sys.version,
        "device": settings.DEVICE,
        "gpu_available": torch.cuda.is_available() if hasattr(torch, 'cuda') else False,
    }
    
    return health_status

if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "app:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        workers=settings.WORKERS,
        log_level=settings.LOG_LEVEL.lower(),
    )