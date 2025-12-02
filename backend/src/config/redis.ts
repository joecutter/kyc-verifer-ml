import { createClient } from "redis";
import { RedisStore } from "connect-redis";
import { config } from "./env";
import { logger } from "../utils/logger";

export class RedisClient {
  private static instance: RedisClient;
  private client: ReturnType<typeof createClient>;
  private store: RedisStore | null = null;

  private constructor() {
    this.client = createClient({
      url: `redis://${config.REDIS.HOST}:${config.REDIS.PORT}`,
      password: config.REDIS.PASSWORD || undefined,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            logger.error("Redis reconnection failed after 10 attempts");
            return new Error("Max reconnection attempts reached");
          }
          return Math.min(retries * 100, 3000);
        },
      },
    });

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.client.on("connect", () => {
      logger.info("Redis client connected");
    });

    this.client.on("ready", () => {
      logger.info("Redis client ready");
    });

    this.client.on("error", (err) => {
      logger.error("Redis client error:", err);
    });

    this.client.on("reconnecting", () => {
      logger.info("Redis client reconnecting...");
    });

    this.client.on("end", () => {
      logger.warn("Redis client connection closed");
    });
  }

  public static getInstance(): RedisClient {
    if (!RedisClient.instance) {
      RedisClient.instance = new RedisClient();
    }
    return RedisClient.instance;
  }

  public async connect(): Promise<void> {
    try {
      await this.client.connect();
    } catch (error) {
      logger.error("Failed to connect to Redis:", error);
      throw error;
    }
  }

  public getClient(): ReturnType<typeof createClient> {
    return this.client;
  }

  public getStore(): RedisStore  | null{
    if (!this.store) {
      const { RedisStore } = require("connect-redis");
      this.store = new RedisStore({
        client: this.client,
        prefix: "kyc:session:",
        ttl: 86400, // 24 hours in seconds
      });
    }
    return this.store;
  }

  public async set(key: string, value: any, ttl?: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      if (ttl) {
        await this.client.setEx(key, ttl, serialized);
      } else {
        await this.client.set(key, serialized);
      }
    } catch (error) {
      logger.error(`Redis SET error for key ${key}:`, error);
      throw error;
    }
  }

  public async get<T>(key: string): Promise<T | null> {
    try {
      const data = await this.client.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error(`Redis GET error for key ${key}:`, error);
      return null;
    }
  }

  public async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (error) {
      logger.error(`Redis DEL error for key ${key}:`, error);
      throw error;
    }
  }

  public async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error(`Redis EXISTS error for key ${key}:`, error);
      return false;
    }
  }

  public async incr(key: string): Promise<number> {
    try {
      return await this.client.incr(key);
    } catch (error) {
      logger.error(`Redis INCR error for key ${key}:`, error);
      throw error;
    }
  }

  public async expire(key: string, ttl: number): Promise<void> {
    try {
      await this.client.expire(key, ttl);
    } catch (error) {
      logger.error(`Redis EXPIRE error for key ${key}:`, error);
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    try {
      await this.client.quit();
      logger.info("Redis client disconnected");
    } catch (error) {
      logger.error("Error disconnecting Redis:", error);
    }
  }

  // Rate limiting methods
  public async rateLimit(
    key: string,
    windowMs: number,
    maxRequests: number
  ): Promise<{
    allowed: boolean;
    remaining: number;
    reset: number;
  }> {
    const now = Date.now();
    const windowStart = now - windowMs;
    const resetTime = now + windowMs;

    try {
      // Get all requests in the current window
      const requests = await this.client.zRangeByScore(key, windowStart, now);

      // Count requests
      const requestCount = requests.length;

      if (requestCount >= maxRequests) {
        return {
          allowed: false,
          remaining: 0,
          reset: resetTime,
        };
      }

      // Add current request
      await this.client.zAdd(key, {
        score: now,
        value: now.toString(),
      });

      // Clean up old entries
      await this.client.zRemRangeByScore(key, 0, windowStart - 1);

      // Set expiry on the key
      await this.client.expire(key, Math.ceil(windowMs / 1000));

      return {
        allowed: true,
        remaining: maxRequests - requestCount - 1,
        reset: resetTime,
      };
    } catch (error) {
      logger.error("Redis rate limit error:", error);
      // Allow request if Redis fails (fail-open)
      return {
        allowed: true,
        remaining: maxRequests,
        reset: resetTime,
      };
    }
  }

  // Cache methods
  public async cacheGet<T>(
    key: string,
    fetchFn?: () => Promise<T>,
    ttl: number = config.REDIS.TTL
  ): Promise<T | null> {
    try {
      // Try to get from cache
      const cached = await this.get<T>(key);

      if (cached !== null) {
        logger.debug(`Cache HIT for key: ${key}`);
        return cached;
      }

      logger.debug(`Cache MISS for key: ${key}`);

      // If fetch function provided and cache miss, fetch and cache
      if (fetchFn) {
        const data = await fetchFn();
        await this.set(key, data, ttl);
        return data;
      }

      return null;
    } catch (error) {
      logger.error(`Cache GET error for key ${key}:`, error);
      // If cache fails and fetch function provided, return fresh data
      if (fetchFn) {
        return await fetchFn();
      }
      return null;
    }
  }

  public async cacheSet<T>(
    key: string,
    value: T,
    ttl: number = config.REDIS.TTL
  ): Promise<void> {
    await this.set(key, value, ttl);
  }

  public async cacheDel(pattern: string): Promise<void> {
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
        logger.debug(
          `Cache cleared for pattern: ${pattern} (${keys.length} keys)`
        );
      }
    } catch (error) {
      logger.error(`Cache DEL error for pattern ${pattern}:`, error);
    }
  }

  // Session management
  public async getSession(sid: string): Promise<any> {
    return this.get(`session:${sid}`);
  }

  public async setSession(
    sid: string,
    session: any,
    ttl: number = 86400
  ): Promise<void> {
    await this.set(`session:${sid}`, session, ttl);
  }

  public async destroySession(sid: string): Promise<void> {
    await this.del(`session:${sid}`);
  }

  // Health check
  public async healthCheck(): Promise<{
    status: "healthy" | "unhealthy";
    latency?: number;
    error?: string;
  }> {
    const start = Date.now();

    try {
      await this.client.ping();
      const latency = Date.now() - start;

      return {
        status: "healthy",
        latency,
      };
    } catch (error) {
      return {
        status: "unhealthy",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}

// Export singleton instance
export const redisClient = RedisClient.getInstance();
