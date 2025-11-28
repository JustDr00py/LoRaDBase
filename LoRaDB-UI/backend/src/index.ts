import express from 'express';
import morgan from 'morgan';
import { config } from './config/env';
import { corsMiddleware } from './middleware/cors';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth';
import proxyRoutes from './routes/proxy';

const app = express();

// Middleware
app.use(morgan(config.nodeEnv === 'development' ? 'dev' : 'combined'));
app.use(corsMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/', (_req, res) => {
  res.json({
    name: 'LoRaDB UI Backend',
    version: '1.0.0',
    status: 'running',
  });
});

app.use('/api/auth', authRoutes);
app.use('/api', proxyRoutes);

// Error handlers (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
app.listen(config.port, () => {
  console.log(`\n🚀 LoRaDB UI Backend running on port ${config.port}`);
  console.log(`   Environment: ${config.nodeEnv}`);
  console.log(`   LoRaDB API: ${config.loradbApiUrl}`);
  console.log(`\nEndpoints:`);
  console.log(`   GET  /               - Server info`);
  console.log(`   POST /api/auth/generate-token - Generate JWT token`);
  console.log(`   POST /api/auth/verify-token   - Verify JWT token`);
  console.log(`   GET  /api/health     - LoRaDB health check`);
  console.log(`   POST /api/query      - Execute query`);
  console.log(`   GET  /api/devices    - List devices`);
  console.log(`   GET  /api/devices/:dev_eui - Get device info\n`);
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
