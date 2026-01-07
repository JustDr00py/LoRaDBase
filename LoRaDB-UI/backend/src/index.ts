import express from 'express';
import morgan from 'morgan';
import { config } from './config/env';
import { corsMiddleware } from './middleware/cors';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { generalLimiter } from './middleware/rateLimiter';
import authRoutes from './routes/auth';
import serverRoutes from './routes/servers';
import proxyRoutes from './routes/proxy';
import backupRoutes from './routes/backup';

// Initialize database (schema creation happens on import)
import './db/database';

// Import backup scheduler
import { startBackupScheduler } from './utils/backupScheduler';

const app = express();

// Middleware
app.use(morgan(config.nodeEnv === 'development' ? 'dev' : 'combined'));
app.use(corsMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Apply general rate limiter to all API routes
app.use('/api', generalLimiter);

// Routes
app.get('/', (_req, res) => {
  res.json({
    name: 'LoRaDB UI Backend',
    version: '2.0.0',
    status: 'running',
    features: ['multi-server', 'encrypted-credentials', 'rate-limiting'],
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/servers', serverRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api', proxyRoutes);

// Error handlers (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
app.listen(config.port, () => {
  console.log(`\n🚀 LoRaDB UI Backend v2.0.0 running on port ${config.port}`);
  console.log(`   Environment: ${config.nodeEnv}`);
  console.log(`\n📚 API Endpoints:`);
  console.log(`   GET  /                          - Server info`);
  console.log(`\n   Auth:`);
  console.log(`   POST /api/auth/verify-token     - Verify session token`);
  console.log(`   POST /api/auth/logout           - Logout`);
  console.log(`\n   Servers:`);
  console.log(`   GET  /api/servers               - List all servers`);
  console.log(`   POST /api/servers               - Create new server`);
  console.log(`   GET  /api/servers/:id           - Get server details`);
  console.log(`   POST /api/servers/:id/authenticate - Authenticate to server`);
  console.log(`   POST /api/servers/:id/test-connection - Test server connection`);
  console.log(`   DELETE /api/servers/:id         - Delete server`);
  console.log(`\n   Backup & Restore:`);
  console.log(`   POST /api/backup/export         - Export system backup`);
  console.log(`   POST /api/backup/import         - Import system backup`);
  console.log(`   GET  /api/backup/list           - List automatic backups`);
  console.log(`   GET  /api/backup/download/:file - Download automatic backup`);
  console.log(`   DELETE /api/backup/:file        - Delete automatic backup`);
  console.log(`\n   LoRaDB Proxy (requires authentication):`);
  console.log(`   GET  /api/health                - LoRaDB health check`);
  console.log(`   POST /api/query                 - Execute query`);
  console.log(`   GET  /api/devices               - List devices`);
  console.log(`   GET  /api/devices/:dev_eui      - Get device info`);
  console.log(`   (+ tokens, retention policies...)\n`);

  // Start backup scheduler
  startBackupScheduler();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing server');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing server');
  process.exit(0);
});
