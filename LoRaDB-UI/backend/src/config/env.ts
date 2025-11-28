import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  loradbApiUrl: process.env.LORADB_API_URL || 'http://localhost:8080',
  jwtSecret: process.env.JWT_SECRET || process.env.LORADB_API_JWT_SECRET || '',
  jwtExpirationHours: parseInt(process.env.JWT_EXPIRATION_HOURS || '1', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
};

// Validate required config
if (!config.jwtSecret || config.jwtSecret.length < 32) {
  console.error('ERROR: JWT_SECRET must be set and at least 32 characters long');
  process.exit(1);
}

console.log('Configuration loaded:');
console.log(`- Port: ${config.port}`);
console.log(`- LoRaDB API: ${config.loradbApiUrl}`);
console.log(`- JWT Expiration: ${config.jwtExpirationHours} hour(s)`);
console.log(`- CORS Origin: ${config.corsOrigin}`);
console.log(`- Environment: ${config.nodeEnv}`);
