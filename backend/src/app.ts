import express from 'express';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import { config } from './config/env';
import { 
  securityHeaders, 
  sanitizeInput, 
  deviceFingerprint, 
  requestLogger, 
  errorHandler, 
  corsConfig 
} from './middleware/security';
import { db, testConnection, initializeDatabase } from './config/database';
import { logger } from './utils/logger';
import { redisClient } from './config/redis';
import kycRoutes from './routes/kyc';
import authRoutes from './routes/auth';
import statusRoutes from './routes/status';

class App {
  public app: express.Application;

  constructor() {
    this.app = express();
    this.initializeMiddleware();
    this.initializeDatabase();
    this.initializeRedis();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  private initializeMiddleware(): void {
    // 1. Basic Express middleware
    this.app.use(compression());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    this.app.use(cookieParser());
    
    // 2. Security middleware
    this.app.use(securityHeaders);
    this.app.use(cors(corsConfig));
    this.app.use(deviceFingerprint);
    this.app.use(requestLogger);
    this.app.use(sanitizeInput);

    // 3. Session middleware (AFTER cookie parser)
    this.initializeSession();
    
    // 4. Static files (development only)
    if (config.NODE_ENV === 'development' && !config.STORAGE.USE_S3) {
      this.app.use('/uploads', express.static(config.STORAGE.LOCAL_PATH));
    }
  }

  private initializeSession(): void {
    const sessionConfig: session.SessionOptions = {
      secret: config.SECURITY.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        secure: config.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: 'strict' as const,
        ...(config.NODE_ENV === 'production' && {
          domain: process.env.COOKIE_DOMAIN,
        }),
      },
      name: 'kyc.sid',
    };

    // Use Redis store if available
    if (config.REDIS.HOST) {
      try {
        const RedisStore = require('connect-redis').default || require('connect-redis');
        sessionConfig.store = new RedisStore({
          client: redisClient.getClient(),
          prefix: 'kyc:session:',
          ttl: 86400, // 24 hours in seconds
        });
        logger.info('Redis session store initialized');
      } catch (error) {
        logger.warn('Failed to initialize Redis session store, using memory store:', error);
      }
    }

    // Apply session middleware
    this.app.use(session(sessionConfig));
  }

  private async initializeDatabase(): Promise<void> {
    try {
      const connected = await testConnection();
      if (!connected) {
        logger.error('Failed to connect to database. Retrying in 5 seconds...');
        setTimeout(() => this.initializeDatabase(), 5000);
        return;
      }

      if (config.NODE_ENV === 'development') {
        await initializeDatabase();
      }

      logger.info('Database initialized successfully');
    } catch (error) {
      logger.error('Database initialization failed:', error);
      process.exit(1);
    }
  }

  private async initializeRedis(): Promise<void> {
    try {
      await redisClient.connect();
      
      // Test Redis connection
      const health = await redisClient.healthCheck();
      if (health.status === 'healthy') {
        logger.info(`Redis connected: ${config.REDIS.HOST}:${config.REDIS.PORT} (latency: ${health.latency}ms)`);
      } else {
        logger.warn('Redis connection test failed, proceeding without Redis');
      }
    } catch (error) {
      logger.warn('Failed to connect to Redis, proceeding without Redis:', error);
    }
  }

  private initializeRoutes(): void {
    // API routes
    this.app.use(`${config.API_PREFIX}/kyc`, kycRoutes);
    this.app.use(`${config.API_PREFIX}/auth`, authRoutes);
    this.app.use(`${config.API_PREFIX}/status`, statusRoutes);

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        message: 'KYC Backend API',
        version: process.env.npm_package_version || '1.0.0',
        environment: config.NODE_ENV,
        documentation: `${req.protocol}://${req.get('host')}/api-docs`,
        uptime: process.uptime(),
      });
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        path: req.originalUrl,
      });
    });
  }

  private initializeErrorHandling(): void {
    // Error handler must be last
    this.app.use(errorHandler);

    // Graceful shutdown
    process.on('SIGTERM', () => this.gracefulShutdown());
    process.on('SIGINT', () => this.gracefulShutdown());
  }

  private gracefulShutdown(): void {
    logger.info('Received shutdown signal. Closing server...');

    // Close HTTP server
    if (this.app.listen) {
      const server = (this.app as any).__server;
      if (server) {
        server.close(() => {
          logger.info('HTTP server closed');
        });
      }
    }

    // Close Redis connection
    redisClient.disconnect().catch(console.error);
    
    // Close database connection
    db.destroy(() => {
      logger.info('Database connection closed');
      process.exit(0);
    });

    // Force shutdown after 10 seconds
    setTimeout(() => {
      logger.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10000);
  }

  public start(): void {
    const server = this.app.listen(config.PORT, () => {
      logger.info(`
        🚀 Server running in ${config.NODE_ENV} mode
        📍 Listening on port ${config.PORT}
        🔗 API Base URL: http://localhost:${config.PORT}${config.API_PREFIX}
        🗄️  Database: ${config.DB.HOST}:${config.DB.PORT}/${config.DB.NAME}
        📊 Storage: ${config.STORAGE.USE_S3 ? 'S3' : 'Local'}
        🤖 ML Service: ${config.ML_SERVICE.URL}
        ⏰ Started at: ${new Date().toISOString()}
      `);
    });

    // Store server reference for graceful shutdown
    (this.app as any).__server = server;

    // Handle server errors
    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.syscall !== 'listen') {
        throw error;
      }

      switch (error.code) {
        case 'EACCES':
          logger.error(`Port ${config.PORT} requires elevated privileges`);
          process.exit(1);
        case 'EADDRINUSE':
          logger.error(`Port ${config.PORT} is already in use`);
          process.exit(1);
        default:
          throw error;
      }
    });
  }
}

// Create and start application
const app = new App();
app.start();

export default app;