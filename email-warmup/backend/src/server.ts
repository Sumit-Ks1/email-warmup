/**
 * Express Application Entry Point.
 *
 * Sets up middleware, routes, health checks, and graceful shutdown.
 * All services are initialized here for clean dependency management.
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config';
import { logger } from './config/logger';
import { checkDbHealth, closePool } from './db';
import { shutdownAll } from './services/warmupOrchestrator';
import domainAccountRoutes from './routes/domainAccounts';
import leadAccountRoutes from './routes/leadAccounts';
import warmupRoutes from './routes/warmup';

const app = express();

// ====================================
// Middleware
// ====================================

// Security headers
app.use(helmet());

// CORS — allow frontend origin
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://frontend:3000',
    'http://warmup-frontend:3000',
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use(morgan('combined', {
  stream: {
    write: (message: string) => logger.info(message.trim()),
  },
}));

// ====================================
// Routes
// ====================================

app.use('/api/domain-accounts', domainAccountRoutes);
app.use('/api/lead-accounts', leadAccountRoutes);
app.use('/api/warmup', warmupRoutes);

// Health check endpoint
app.get('/api/health', async (_req, res) => {
  const dbHealthy = await checkDbHealth();
  res.status(dbHealthy ? 200 : 503).json({
    status: dbHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    services: {
      database: dbHealthy ? 'connected' : 'disconnected',
      server: 'running',
    },
  });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
  });
});

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({
    success: false,
    error: config.nodeEnv === 'production' ? 'Internal Server Error' : err.message,
  });
});

// ====================================
// Server Startup
// ====================================

const server = app.listen(config.port, () => {
  logger.info(`Backend server running on port ${config.port}`);
  logger.info(`Environment: ${config.nodeEnv}`);
});

// ====================================
// Graceful Shutdown
// ====================================

async function gracefulShutdown(signal: string) {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  // 1. Stop accepting new connections
  server.close(() => {
    logger.info('HTTP server closed');
  });

  // 2. Pause all active warm-up sessions
  try {
    await shutdownAll();
    logger.info('All warm-up sessions paused');
  } catch (error: any) {
    logger.error('Error during warm-up shutdown', { error: error.message });
  }

  // 3. Close database pool
  try {
    await closePool();
    logger.info('Database pool closed');
  } catch (error: any) {
    logger.error('Error closing database pool', { error: error.message });
  }

  logger.info('Graceful shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason: any) => {
  logger.error('Unhandled promise rejection', { reason: reason?.message || reason });
});

export default app;
