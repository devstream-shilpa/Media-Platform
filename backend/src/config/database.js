// backend/src/config/database.js
// Database configuration with AWS Secrets Manager integration

const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
const { Pool } = require('pg');

// Create Secrets Manager client
const secretsClient = new SecretsManagerClient({
  region: process.env.AWS_REGION || "us-east-1"
});

let dbPool = null;
let cachedCredentials = null;

/**
 * Fetch database credentials from AWS Secrets Manager
 * Credentials are cached for the lifetime of the application
 */
async function getDatabaseCredentials() {
  if (cachedCredentials) {
    return cachedCredentials;
  }

  try {
    const secretName = `media/db-credentials-${process.env.ENVIRONMENT || 'dev'}`;
    
    console.log(`🔐 Fetching database credentials from Secrets Manager: ${secretName}`);
    
    const response = await secretsClient.send(
      new GetSecretValueCommand({ SecretId: secretName })
    );
    
    if ('SecretString' in response) {
      cachedCredentials = JSON.parse(response.SecretString);
      console.log('✅ Successfully retrieved database credentials from Secrets Manager');
      return cachedCredentials;
    }
    
    throw new Error('Secret not found in response');
    
  } catch (error) {
    console.error('❌ Error retrieving database credentials from Secrets Manager:', error);
    throw error;
  }
}

/**
 * Initialize database connection pool
 * This should be called once when the application starts
 */
async function initializeDatabasePool() {
  if (dbPool) {
    return dbPool;
  }

  try {
    console.log('🗄️  Initializing database connection pool...');
    
    // Fetch credentials from Secrets Manager
    const credentials = await getDatabaseCredentials();
    
    // Create connection pool
    dbPool = new Pool({
      host: credentials.host,
      port: credentials.port,
      database: credentials.database,
      user: credentials.username,
      password: credentials.password,
      max: 50,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
    
    // Test the connection
    const client = await dbPool.connect();
    await client.query('SELECT NOW()');
    client.release();
    
    console.log('✅ Database connection pool initialized successfully');
    
    // Handle pool errors
    dbPool.on('error', (err) => {
      console.error('Unexpected database pool error:', err);
    });
    
    return dbPool;
    
  } catch (error) {
    console.error('❌ Failed to initialize database pool:', error);
    throw error;
  }
}

/**
 * Get the database pool
 * Throws error if pool hasn't been initialized
 */
function getDatabasePool() {
  if (!dbPool) {
    throw new Error('Database pool not initialized. Call initializeDatabasePool() first.');
  }
  return dbPool;
}

/**
 * Close database connections gracefully
 */
async function closeDatabasePool() {
  if (dbPool) {
    await dbPool.end();
    dbPool = null;
    cachedCredentials = null;
    console.log('Database pool closed');
  }
}

module.exports = {
  initializeDatabasePool,
  getDatabasePool,
  closeDatabasePool
};
