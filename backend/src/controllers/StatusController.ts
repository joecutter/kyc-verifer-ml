import { Request, Response } from "express";
import { config } from "../config/env";
import { logger } from "../utils/logger";
import { redisClient } from "../config/redis";
import { db } from "../config/database";
import { MLService } from "../services/MLService";

export class StatusController {
  private readonly mlService: MLService;

  constructor() {
    this.mlService = new MLService();
  }

  async getSystemStatus(req: Request, res: Response) {
    const transactionId = `status_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      logger.debug(`[${transactionId}] Getting system status`);

      // Check database health
      const dbHealth = await this.checkDatabaseHealth();

      // Check Redis health
      const redisHealth = await redisClient.healthCheck();

      // Check ML service health
      const mlHealth = await this.mlService.getHealth();

      // System metrics
      const systemMetrics = {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        nodeVersion: process.version,
        platform: process.platform,
        pid: process.pid,
      };

      // Determine overall status
      const services = {
        database: dbHealth.status,
        redis: redisHealth.status,
        mlService: mlHealth.status,
      };

      const unhealthyServices = Object.entries(services)
        .filter(([, status]) => status !== "healthy")
        .map(([service]) => service);

      const overallStatus =
        unhealthyServices.length === 0 ? "healthy" : "degraded";

      const response = {
        success: true,
        transactionId,
        data: {
          status: overallStatus,
          timestamp: new Date().toISOString(),
          environment: config.NODE_ENV,
          version: process.env.npm_package_version || "1.0.0",
          services,
          unhealthyServices,
          system: systemMetrics,
          ...(config.NODE_ENV === "development" && {
            config: {
              db: {
                host: config.DB.HOST,
                port: config.DB.PORT,
                name: config.DB.NAME,
              },
              redis: {
                host: config.REDIS.HOST,
                port: config.REDIS.PORT,
              },
              mlService: config.ML_SERVICE.URL,
            },
          }),
        },
      };

      logger.debug(`[${transactionId}] System status retrieved`);
      return res.status(200).json(response);
    } catch (error) {
      logger.error(`[${transactionId}] System status error:`, error);

      return res.status(500).json({
        success: false,
        transactionId,
        error: "Failed to get system status",
        status: "unhealthy",
      });
    }
  }

  async getHealth(req: Request, res: Response) {
    const transactionId = `health_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      // Simple health check - just check if server is responding
      return res.status(200).json({
        success: true,
        transactionId,
        status: "healthy",
        timestamp: new Date().toISOString(),
        service: "kyc-backend",
      });
    } catch (error) {
      logger.error(`[${transactionId}] Health check error:`, error);

      return res.status(503).json({
        success: false,
        transactionId,
        status: "unhealthy",
        error: "Service unavailable",
      });
    }
  }

  async getApiStatus(req: Request, res: Response) {
    const transactionId = `api_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      logger.debug(`[${transactionId}] Getting API status`);

      // Get API usage statistics from Redis
      const apiStats = await this.getApiStatistics();

      // Get error rates
      const errorStats = await this.getErrorStatistics();

      // Get response time percentiles
      const performanceStats = await this.getPerformanceStatistics();

      const response = {
        success: true,
        transactionId,
        data: {
          timestamp: new Date().toISOString(),
          endpoints: {
            kyc: `${config.API_PREFIX}/kyc`,
            auth: `${config.API_PREFIX}/auth`,
            status: `${config.API_PREFIX}/status`,
          },
          usage: apiStats,
          errors: errorStats,
          performance: performanceStats,
          rateLimiting: {
            enabled: true,
            windowMs: config.SECURITY.RATE_LIMIT.WINDOW_MS,
            maxRequests: config.SECURITY.RATE_LIMIT.MAX_REQUESTS,
          },
          security: {
            cors: "enabled",
            helmet: "enabled",
            rateLimiting: "enabled",
            inputSanitization: "enabled",
          },
        },
      };

      logger.debug(`[${transactionId}] API status retrieved`);
      return res.status(200).json(response);
    } catch (error) {
      logger.error(`[${transactionId}] API status error:`, error);

      return res.status(500).json({
        success: false,
        transactionId,
        error: "Failed to get API status",
      });
    }
  }

  async getKYCStats(req: Request, res: Response) {
    const transactionId = `stats_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      const { timeframe = "day", userId } = req.query;

      logger.debug(`[${transactionId}] Getting KYC statistics`, {
        timeframe,
        userId,
      });

      // Get statistics from database
      const stats = await this.getKYCStatistics(
        timeframe as string,
        userId as string
      );

      // Get recent activities
      const activities = await this.getRecentActivities();

      const response = {
        success: true,
        transactionId,
        data: {
          timeframe,
          ...stats,
          recentActivities: activities,
          generatedAt: new Date().toISOString(),
        },
      };

      logger.debug(`[${transactionId}] KYC statistics retrieved`);
      return res.status(200).json(response);
    } catch (error) {
      logger.error(`[${transactionId}] KYC stats error:`, error);

      return res.status(500).json({
        success: false,
        transactionId,
        error: "Failed to get KYC statistics",
      });
    }
  }

  // Helper methods
  private async checkDatabaseHealth(): Promise<{
    status: "healthy" | "unhealthy";
    latency?: number;
    error?: string;
  }> {
    const start = Date.now();

    try {
      await db.raw("SELECT 1");
      const latency = Date.now() - start;

      return {
        status: "healthy",
        latency,
      };
    } catch (error) {
      return {
        status: "unhealthy",
        error:
          error instanceof Error ? error.message : "Database connection failed",
      };
    }
  }

  private async getApiStatistics(): Promise<any> {
    try {
      // Get total requests from Redis
      const totalRequests =
        (await redisClient.get<number>("stats:api:total")) || 0;
      const todayRequests =
        (await redisClient.get<number>("stats:api:today")) || 0;

      // Get endpoint statistics
      const endpointStats =
        (await redisClient.get<Record<string, number>>(
          "stats:api:endpoints"
        )) || {};

      return {
        totalRequests,
        todayRequests,
        endpoints: endpointStats,
      };
    } catch (error) {
      logger.error("Failed to get API statistics:", error);
      return {
        totalRequests: 0,
        todayRequests: 0,
        endpoints: {},
      };
    }
  }

  private async getErrorStatistics(): Promise<any> {
    try {
      const errors =
        (await redisClient.get<Record<string, number>>("stats:errors")) || {};

      const totalErrors = Object.values(errors).reduce(
        (sum, count) => sum + count,
        0
      );
      const errorRate =
        totalErrors > 0
          ? (totalErrors /
              ((await redisClient.get<number>("stats:api:total")) || 1)) *
            100
          : 0;

      return {
        totalErrors,
        errorRate: errorRate.toFixed(2),
        byType: errors,
      };
    } catch (error) {
      logger.error("Failed to get error statistics:", error);
      return {
        totalErrors: 0,
        errorRate: 0,
        byType: {},
      };
    }
  }

  private async getPerformanceStatistics(): Promise<any> {
    try {
      const perfData = (await redisClient.get<{
        p50: number;
        p95: number;
        p99: number;
        avg: number;
      }>("stats:performance")) || {
        p50: 100,
        p95: 300,
        p99: 500,
        avg: 150,
      };

      return {
        responseTimeMs: perfData,
        thresholds: {
          good: 200,
          acceptable: 500,
          poor: 1000,
        },
      };
    } catch (error) {
      logger.error("Failed to get performance statistics:", error);
      return {
        responseTimeMs: {
          p50: 0,
          p95: 0,
          p99: 0,
          avg: 0,
        },
        thresholds: {
          good: 200,
          acceptable: 500,
          poor: 1000,
        },
      };
    }
  }

  private async getKYCStatistics(
    timeframe: string,
    userId?: string
  ): Promise<any> {
    try {
      let dateFilter = new Date();

      switch (timeframe) {
        case "day":
          dateFilter.setDate(dateFilter.getDate() - 1);
          break;
        case "week":
          dateFilter.setDate(dateFilter.getDate() - 7);
          break;
        case "month":
          dateFilter.setMonth(dateFilter.getMonth() - 1);
          break;
        case "year":
          dateFilter.setFullYear(dateFilter.getFullYear() - 1);
          break;
        default:
          dateFilter.setDate(dateFilter.getDate() - 1);
      }

      // Build query
      let query = db("kyc_attempts")
        .select(
          db.raw("COUNT(*) as total"),
          db.raw("SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as completed", [
            "completed",
          ]),
          db.raw("SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as failed", [
            "failed",
          ]),
          db.raw("SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as pending", [
            "pending",
          ]),
          db.raw("AVG(liveness_score) as avg_liveness"),
          db.raw("AVG(match_score) as avg_match"),
          db.raw("AVG(fraud_score) as avg_fraud")
        )
        .where("created_at", ">=", dateFilter);

      if (userId) {
        query = query.where("user_id", userId);
      }

      const [stats] = await query;

      // Get completion time statistics
      const completionStats = await db("kyc_attempts")
        .select(
          db.raw(
            "EXTRACT(EPOCH FROM AVG(updated_at - created_at)) as avg_completion_time"
          ),
          db.raw(
            "EXTRACT(EPOCH FROM MIN(updated_at - created_at)) as min_completion_time"
          ),
          db.raw(
            "EXTRACT(EPOCH FROM MAX(updated_at - created_at)) as max_completion_time"
          )
        )
        .where("status", "completed")
        .where("created_at", ">=", dateFilter)
        .first();

      return {
        timeframe,
        total: parseInt(stats.total) || 0,
        completed: parseInt(stats.completed) || 0,
        failed: parseInt(stats.failed) || 0,
        pending: parseInt(stats.pending) || 0,
        completionRate:
          stats.total > 0
            ? (
                (parseInt(stats.completed) / parseInt(stats.total)) *
                100
              ).toFixed(2) + "%"
            : "0%",
        averageScores: {
          liveness: parseFloat(stats.avg_liveness) || 0,
          match: parseFloat(stats.avg_match) || 0,
          fraud: parseFloat(stats.avg_fraud) || 0,
        },
        completionTime: {
          average: parseFloat(completionStats?.avg_completion_time) || 0,
          minimum: parseFloat(completionStats?.min_completion_time) || 0,
          maximum: parseFloat(completionStats?.max_completion_time) || 0,
        },
      };
    } catch (error) {
      logger.error("Failed to get KYC statistics:", error);
      throw error;
    }
  }

  private async getRecentActivities(): Promise<any[]> {
    try {
      const activities = await db("kyc_attempts")
        .select(
          "kyc_attempts.*",
          "users.email",
          "users.first_name",
          "users.last_name"
        )
        .leftJoin("users", "kyc_attempts.user_id", "users.id")
        .orderBy("kyc_attempts.created_at", "desc")
        .limit(10);

      return activities.map((activity) => ({
        id: activity.id,
        userId: activity.user_id,
        userEmail: activity.email,
        userName: `${activity.first_name} ${activity.last_name}`,
        status: activity.status,
        scores: {
          liveness: activity.liveness_score,
          match: activity.match_score,
          fraud: activity.fraud_score,
        },
        createdAt: activity.created_at,
        updatedAt: activity.updated_at,
      }));
    } catch (error) {
      logger.error("Failed to get recent activities:", error);
      return [];
    }
  }
}
