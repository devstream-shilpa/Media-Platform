// lambda/index.js
// Media processing Lambda function

const AWS = require('aws-sdk');
const { Pool } = require('pg');
const Redis = require('ioredis');
const sharp = require('sharp');

const s3 = new AWS.S3();
const S3_BUCKET = process.env.S3_MEDIA_BUCKET;

// Database connection pool
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 2,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Redis client
const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
});

/**
 * Main Lambda handler
 * Processes SQS messages containing media upload information
 */
exports.handler = async (event) => {
  console.log('Received event:', JSON.stringify(event, null, 2));
  
  const results = {
    successful: [],
    failed: []
  };

  for (const record of event.Records) {
    try {
      const message = JSON.parse(record.body);
      console.log('Processing message:', message);

      await processMedia(message);
      results.successful.push(message.mediaId);
      
    } catch (error) {
      console.error('Error processing record:', error);
      results.failed.push({
        messageId: record.messageId,
        error: error.message
      });
      
      // Throw error to move message to DLQ after max retries
      throw error;
    }
  }

  console.log('Processing results:', results);
  return results;
};

/**
 * Process a single media file
 */
async function processMedia(message) {
  const { mediaId, userId, s3Key, fileType } = message;
  
  console.log(`Processing media ${mediaId} for user ${userId}`);

  try {
    // Update status to processing
    await updateMediaStatus(mediaId, 'processing');

    // Download original file from S3
    const originalObject = await s3.getObject({
      Bucket: S3_BUCKET,
      Key: s3Key
    }).promise();

    let metadata = {
      size: originalObject.ContentLength,
      contentType: originalObject.ContentType
    };

    // Process based on file type
    if (fileType.startsWith('image/')) {
      metadata = await processImage(s3Key, originalObject.Body, metadata);
    } else if (fileType.startsWith('video/')) {
      metadata = await processVideo(s3Key, originalObject.Body, metadata);
    }

    // Update database with final metadata
    await updateMediaMetadata(mediaId, metadata, 'ready');

    // Invalidate cache for this user's media
    await invalidateUserMediaCache(userId);

    console.log(`Successfully processed media ${mediaId}`);
    
  } catch (error) {
    console.error(`Failed to process media ${mediaId}:`, error);
    await updateMediaStatus(mediaId, 'failed', error.message);
    throw error;
  }
}

/**
 * Process image: create thumbnails and extract metadata
 */
async function processImage(s3Key, imageBuffer, metadata) {
  console.log('Processing image:', s3Key);

  // Get image metadata
  const image = sharp(imageBuffer);
  const imageMetadata = await image.metadata();

  metadata.width = imageMetadata.width;
  metadata.height = imageMetadata.height;
  metadata.format = imageMetadata.format;

  // Create thumbnail (300x300)
  const thumbnailBuffer = await image
    .resize(300, 300, { fit: 'cover' })
    .jpeg({ quality: 80 })
    .toBuffer();

  const thumbnailKey = s3Key.replace(/\.[^.]+$/, '_thumb.jpg');
  
  await s3.putObject({
    Bucket: S3_BUCKET,
    Key: thumbnailKey,
    Body: thumbnailBuffer,
    ContentType: 'image/jpeg'
  }).promise();

  metadata.thumbnailKey = thumbnailKey;

  // Create medium size (800x800)
  const mediumBuffer = await image
    .resize(800, 800, { fit: 'inside' })
    .jpeg({ quality: 85 })
    .toBuffer();

  const mediumKey = s3Key.replace(/\.[^.]+$/, '_medium.jpg');
  
  await s3.putObject({
    Bucket: S3_BUCKET,
    Key: mediumKey,
    Body: mediumBuffer,
    ContentType: 'image/jpeg'
  }).promise();

  metadata.mediumKey = mediumKey;

  console.log('Image processed successfully');
  return metadata;
}

/**
 * Process video: extract thumbnail and metadata
 * Note: For full video transcoding, you'd use AWS MediaConvert or Elastic Transcoder
 */
async function processVideo(s3Key, videoBuffer, metadata) {
  console.log('Processing video:', s3Key);

  // For this example, we'll just store metadata
  // In production, you would:
  // 1. Use AWS MediaConvert for transcoding
  // 2. Extract thumbnail using ffmpeg
  // 3. Generate multiple quality versions (360p, 720p, 1080p)

  metadata.duration = 0; // Would extract from video
  metadata.codec = 'unknown'; // Would extract from video
  
  // Create a placeholder thumbnail
  const placeholderThumbnail = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );

  const thumbnailKey = s3Key.replace(/\.[^.]+$/, '_thumb.jpg');
  
  await s3.putObject({
    Bucket: S3_BUCKET,
    Key: thumbnailKey,
    Body: placeholderThumbnail,
    ContentType: 'image/jpeg'
  }).promise();

  metadata.thumbnailKey = thumbnailKey;

  console.log('Video processed successfully');
  return metadata;
}

/**
 * Update media status in database
 */
async function updateMediaStatus(mediaId, status, errorMessage = null) {
  const query = `
    UPDATE media 
    SET status = $1, 
        error_message = $2,
        updated_at = NOW()
    WHERE id = $3
  `;
  
  await pool.query(query, [status, errorMessage, mediaId]);
}

/**
 * Update media metadata in database
 */
async function updateMediaMetadata(mediaId, metadata, status) {
  const query = `
    UPDATE media 
    SET status = $1,
        metadata = $2,
        thumbnail_key = $3,
        processed_at = NOW(),
        updated_at = NOW()
    WHERE id = $4
  `;
  
  await pool.query(query, [
    status,
    JSON.stringify(metadata),
    metadata.thumbnailKey,
    mediaId
  ]);
}

/**
 * Invalidate Redis cache for user's media
 */
async function invalidateUserMediaCache(userId) {
  const cacheKeys = [
    `user:${userId}:media`,
    `user:${userId}:media:*`
  ];

  for (const pattern of cacheKeys) {
    if (pattern.includes('*')) {
      // Scan and delete matching keys
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } else {
      await redis.del(pattern);
    }
  }

  console.log(`Invalidated cache for user ${userId}`);
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, cleaning up...');
  await pool.end();
  redis.disconnect();
});
