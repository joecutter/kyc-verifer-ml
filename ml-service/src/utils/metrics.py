import time
from typing import Dict, Any, Optional
from dataclasses import dataclass, field
from collections import defaultdict
import threading

@dataclass
class ModelMetrics:
    """Metrics for ML model performance"""
    total_inferences: int = 0
    total_processing_time: float = 0.0
    avg_processing_time: float = 0.0
    success_count: int = 0
    error_count: int = 0
    last_inference_time: Optional[float] = None
    
    def update(self, processing_time: float, success: bool = True):
        """Update metrics with new inference"""
        self.total_inferences += 1
        self.total_processing_time += processing_time
        self.avg_processing_time = self.total_processing_time / self.total_inferences
        self.last_inference_time = time.time()
        
        if success:
            self.success_count += 1
        else:
            self.error_count += 1

class MetricsCollector:
    """Collect and manage metrics for ML service"""
    
    def __init__(self):
        self.metrics: Dict[str, ModelMetrics] = defaultdict(ModelMetrics)
        self.start_time = time.time()
        self.lock = threading.Lock()
        
    def record_inference(
        self,
        model_name: str,
        processing_time: float,
        success: bool = True
    ):
        """Record inference metrics for a model"""
        with self.lock:
            self.metrics[model_name].update(processing_time, success)
    
    def get_model_metrics(self, model_name: str) -> Dict[str, Any]:
        """Get metrics for specific model"""
        with self.lock:
            metrics = self.metrics.get(model_name, ModelMetrics())
            return {
                'total_inferences': metrics.total_inferences,
                'avg_processing_time': metrics.avg_processing_time,
                'success_rate': (
                    metrics.success_count / metrics.total_inferences
                    if metrics.total_inferences > 0 else 0
                ),
                'last_inference_time': metrics.last_inference_time,
            }
    
    def get_all_metrics(self) -> Dict[str, Any]:
        """Get all collected metrics"""
        with self.lock:
            total_inferences = sum(m.total_inferences for m in self.metrics.values())
            total_success = sum(m.success_count for m in self.metrics.values())
            
            return {
                'uptime': time.time() - self.start_time,
                'total_inferences': total_inferences,
                'overall_success_rate': (
                    total_success / total_inferences if total_inferences > 0 else 0
                ),
                'models': {
                    name: self.get_model_metrics(name)
                    for name in self.metrics.keys()
                },
                'timestamp': time.time(),
            }
    
    def reset(self):
        """Reset all metrics"""
        with self.lock:
            self.metrics.clear()
            self.start_time = time.time()
    
    def get_health_status(self) -> Dict[str, Any]:
        """Get health status based on metrics"""
        metrics = self.get_all_metrics()
        
        # Determine health based on recent activity and success rate
        is_healthy = metrics['total_inferences'] > 0
        if is_healthy:
            is_healthy = metrics['overall_success_rate'] > 0.8
        
        return {
            'status': 'healthy' if is_healthy else 'degraded',
            'message': 'Service is operational' if is_healthy else 'Service may be experiencing issues',
            'metrics': metrics,
        }