import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpirationHours: parseInt(process.env.JWT_EXPIRATION_HOURS || '1', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  masterPassword: process.env.MASTER_PASSWORD || '',
  masterSessionHours: parseInt(process.env.MASTER_SESSION_HOURS || '24', 10),
};

// Validate required config
if (!config.jwtSecret || config.jwtSecret.length < 32) {
  console.error('ERROR: JWT_SECRET must be set and at least 32 characters long');
  process.exit(1);
}

// Validate master password if provided
if (config.masterPassword && config.masterPassword.length > 0) {
  // Validate password length
  if (config.masterPassword.length < 8) {
    console.error('ERROR: MASTER_PASSWORD must be at least 8 characters long');
    process.exit(1);
  }
  if (config.masterPassword.length > 72) {
    console.error('ERROR: MASTER_PASSWORD must be 72 characters or less (bcrypt limitation)');
    process.exit(1);
  }
  console.log('🔒 Master password protection enabled');
} else {
  console.warn('⚠️  WARNING: No master password set. Server management is unprotected!');
}

console.log('⚙️  Configuration loaded:');
console.log(`   Port: ${config.port}`);
console.log(`   JWT Expiration: ${config.jwtExpirationHours} hour(s)`);
console.log(`   Master Session: ${config.masterSessionHours} hour(s)`);
console.log(`   CORS Origin: ${config.corsOrigin}`);
console.log(`   Environment: ${config.nodeEnv}`);
