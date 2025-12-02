from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
from typing import Callable, Optional
import time
import asyncio
from redis.asyncio import Redis
import json

from src.config import settings
from src.utils.logger import get_logger

logger = get_logger(__name__)

class RateLimitMiddleware:
    """Rate limiting middleware"""
    
    def __init__(self, redis_client: Optional[Redis] = None):
        self.redis_client = redis_client
    
    async def __call__(self, request: Request, call_next):
        # Skip rate limiting for health checks
        if request.url.path in ['/health', '/metrics', '/docs', '/redoc', '/openapi.json']:
            return await call_next(request)
        
        # Get client identifier
        client_id = self._get_client_id(request)
        key = f"rate_limit:{client_id}"
        
        try:
            if self.redis_client:
                # Use Redis for rate limiting
                current = await self.redis_client.get(key)
                
                if current is None:
                    # First request
                    await self.redis_client.setex(
                        key,
                        60,  # 1 minute window
                        1
                    )
                elif int(current) < settings.RATE_LIMIT_PER_MINUTE:
                    # Increment counter
                    await self.redis_client.incr(key)
                else:
                    # Rate limit exceeded
                    retry_after = await self.redis_client.ttl(key)
                    raise HTTPException(
                        status_code=429,
                        detail={
                            "error": "Rate limit exceeded",
                            "retry_after": retry_after,
                            "limit": settings.RATE_LIMIT_PER_MINUTE,
                        }
                    )
            
            # Call next middleware/handler
            return await call_next(request)
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Rate limit error: {e}")
            # Allow request if rate limiting fails
            return await call_next(request)
    
    def _get_client_id(self, request: Request) -> str:
        """Get unique identifier for client"""
        # Use API key if provided
        api_key = request.headers.get("X-API-Key")
        if api_key:
            return f"api_key:{api_key}"
        
        # Fall back to IP address
        client_ip = request.client.host if request.client else "unknown"
        return f"ip:{client_ip}"

class AuthMiddleware:
    """API authentication middleware"""
    
    def __init__(self):
        self.api_key = settings.API_KEY
    
    async def __call__(self, request: Request, call_next):
        # Skip authentication for public endpoints
        if request.url.path in ['/health', '/docs', '/redoc', '/openapi.json']:
            return await call_next(request)
        
        # Check for API key
        if self.api_key:
            api_key = request.headers.get("X-API-Key")
            
            if not api_key or api_key != self.api_key:
                raise HTTPException(
                    status_code=401,
                    detail={
                        "error": "Invalid or missing API key",
                        "hint": "Include a valid X-API-Key header"
                    }
                )
        
        return await call_next(request)

class MetricsMiddleware:
    """Metrics collection middleware"""
    
    def __init__(self, metrics_collector):
        self.metrics_collector = metrics_collector
    
    async def __call__(self, request: Request, call_next):
        start_time = time.time()
        
        try:
            response = await call_next(request)
            processing_time = time.time() - start_time
            
            # Record metrics for ML endpoints
            if request.url.path.startswith("/api/v1/"):
                endpoint = request.url.path.split("/")[-1]
                self.metrics_collector.record_inference(
                    model_name=endpoint,
                    processing_time=processing_time,
                    success=response.status_code < 400
                )
            
            # Add processing time header
            response.headers["X-Processing-Time"] = str(processing_time)
            
            return response
            
        except Exception as e:
            processing_time = time.time() - start_time
            logger.error(f"Request failed: {e}", extra={"processing_time": processing_time})
            raise

async def add_process_time_header(request: Request, call_next):
    """Add process time to response headers"""
    start_time = time.time()
    
    response = await call_next(request)
    
    process_time = time.time() - start_time
    response.headers["X-Process-Time"] = str(process_time)
    
    return response