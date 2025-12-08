
// backend/src/index.js
// Main Express API server

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const Redis = require('ioredis');
const AWS = require('aws-sdk');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

// AWS Configuration
AWS.config.update({ region: process.env.AWS_REGION || 'us-east-1' });
const s3 = new AWS.S3();
const sqs = new AWS.SQS();


// Database configuration (will be initialized on startup)
const { initializeDatabasePool, getDatabasePool } = require('./config/database');
let pool; // Will be initialized after fetching credentials

// Redis client for caching
const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT || 6379,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ==================== Authentication Middleware ====================

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// ==================== Health Check ====================

app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {}
  };

  try {
    // Check database
    await pool.query('SELECT 1');
    health.checks.database = 'ok';
  } catch (error) {
    health.checks.database = 'error';
    health.status = 'unhealthy';
  }

  try {
    // Check Redis
    await redis.ping();
    health.checks.redis = 'ok';
  } catch (error) {
    health.checks.redis = 'error';
    health.status = 'unhealthy';
  }

  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});

// ==================== Authentication Routes ====================

// Register new user
app.post('/api/auth/register', async (req, res) => {
  const { email, password, username } = req.body;

  if (!email || !password || !username) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Check if user exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const result = await pool.query(
      `INSERT INTO users (email, username, password_hash, created_at, updated_at) 
       VALUES ($1, $2, $3, NOW(), NOW()) 
       RETURNING id, email, username, created_at`,
      [email, username, hashedPassword]
    );

    const user = result.rows[0];

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        createdAt: user.created_at
      },
      token
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    const result = await pool.query(
      'SELECT id, email, username, password_hash FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    res.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username
      },
      token
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ==================== Media Routes ====================

// Get presigned URL for upload
app.post('/api/media/upload-url', authenticateToken, async (req, res) => {
  const { fileName, fileType } = req.body;

  if (!fileName || !fileType) {
    return res.status(400).json({ error: 'fileName and fileType required' });
  }

  try {
    const key = `uploads/${req.userId}/${Date.now()}-${fileName}`;
    
    const presignedUrl = s3.getSignedUrl('putObject', {
      Bucket: process.env.S3_MEDIA_BUCKET,
      Key: key,
      ContentType: fileType,
      Expires: 300 // 5 minutes
    });

    // Create media record
    const result = await pool.query(
      `INSERT INTO media (user_id, s3_key, file_name, file_type, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'pending', NOW(), NOW())
       RETURNING id, s3_key, status`,
      [req.userId, key, fileName, fileType]
    );

    res.json({
      uploadUrl: presignedUrl,
      mediaId: result.rows[0].id,
      s3Key: result.rows[0].s3_key
    });

  } catch (error) {
    console.error('Upload URL generation error:', error);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

// Confirm upload and trigger processing
app.post('/api/media/:id/confirm', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    // Verify media belongs to user
    const mediaResult = await pool.query(
      'SELECT s3_key, file_type FROM media WHERE id = $1 AND user_id = $2',
      [id, req.userId]
    );

    if (mediaResult.rows.length === 0) {
      return res.status(404).json({ error: 'Media not found' });
    }

    const media = mediaResult.rows[0];

    // Send message to SQS for processing
    await sqs.sendMessage({
      QueueUrl: process.env.SQS_QUEUE_URL,
      MessageBody: JSON.stringify({
        mediaId: id,
        userId: req.userId,
        s3Key: media.s3_key,
        fileType: media.file_type
      })
    }).promise();

    res.json({ message: 'Media queued for processing', mediaId: id });

  } catch (error) {
    console.error('Upload confirmation error:', error);
    res.status(500).json({ error: 'Failed to confirm upload' });
  }
});

// Get media status
app.get('/api/media/:id/status', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT id, status, file_name, file_type, metadata, thumbnail_key, 
              created_at, processed_at 
       FROM media 
       WHERE id = $1 AND user_id = $2`,
      [id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Media not found' });
    }

    res.json(result.rows[0]);

  } catch (error) {
    console.error('Media status error:', error);
    res.status(500).json({ error: 'Failed to get media status' });
  }
});

// List user's media with caching
app.get('/api/media', authenticateToken, async (req, res) => {
  const cacheKey = `user:${req.userId}:media`;

  try {
    // Try cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    // Query database
    const result = await pool.query(
      `SELECT id, file_name, file_type, status, thumbnail_key, 
              metadata, created_at, processed_at
       FROM media 
       WHERE user_id = $1 AND status = 'ready'
       ORDER BY created_at DESC 
       LIMIT 50`,
      [req.userId]
    );

    const media = result.rows;

    // Cache for 5 minutes
    await redis.setex(cacheKey, 300, JSON.stringify(media));

    res.json(media);

  } catch (error) {
    console.error('Media list error:', error);
    res.status(500).json({ error: 'Failed to retrieve media' });
  }
});

// Share media with another user
app.post('/api/media/:id/share', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { targetEmail } = req.body;

  if (!targetEmail) {
    return res.status(400).json({ error: 'targetEmail required' });
  }

  try {
    // Verify media ownership
    const mediaResult = await pool.query(
      'SELECT s3_key, file_name FROM media WHERE id = $1 AND user_id = $2 AND status = $3',
      [id, req.userId, 'ready']
    );

    if (mediaResult.rows.length === 0) {
      return res.status(404).json({ error: 'Media not found or not ready' });
    }

    // Find target user
    const userResult = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [targetEmail]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Target user not found' });
    }

    const targetUserId = userResult.rows[0].id;

    // Create share record
    await pool.query(
      `INSERT INTO shared_media (media_id, from_user_id, to_user_id, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (media_id, to_user_id) DO NOTHING`,
      [id, req.userId, targetUserId]
    );

    // Invalidate cache
    await redis.del(`user:${targetUserId}:shared-media`);

    // Generate CloudFront URL (or S3 presigned URL)
    const viewUrl = s3.getSignedUrl('getObject', {
      Bucket: process.env.S3_MEDIA_BUCKET,
      Key: mediaResult.rows[0].s3_key,
      Expires: 604800 // 7 days
    });

    res.json({
      message: 'Media shared successfully',
      viewUrl
    });

  } catch (error) {
    console.error('Share media error:', error);
    res.status(500).json({ error: 'Failed to share media' });
  }
});

// ==================== Error Handling ====================

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ==================== Server Start ====================

// Initialize database and start server
async function startServer() {
  try {
    // Initialize database pool with credentials from Secrets Manager
    pool = await initializeDatabasePool();
    
    // Start Express server
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📍 Environment: ${process.env.ENVIRONMENT || 'dev'}`);
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing server gracefully...');
  const { closeDatabasePool } = require('./config/database');
  await closeDatabasePool();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing server gracefully...');
  const { closeDatabasePool } = require('./config/database');
  await closeDatabasePool();
  process.exit(0);
});

// Start the application
startServer();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await pool.end();
  redis.disconnect();
  process.exit(0);
});
