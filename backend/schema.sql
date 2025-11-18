-- backend/schema.sql
-- PostgreSQL database schema for Media Platform

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);

-- Media table
CREATE TABLE IF NOT EXISTS media (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    s3_key VARCHAR(500) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    -- Status values: pending, processing, ready, failed
    metadata JSONB,
    thumbnail_key VARCHAR(500),
    error_message TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMP
);

CREATE INDEX idx_media_user_id ON media(user_id);
CREATE INDEX idx_media_status ON media(status);
CREATE INDEX idx_media_created_at ON media(created_at DESC);

-- Shared media table
CREATE TABLE IF NOT EXISTS shared_media (
    id SERIAL PRIMARY KEY,
    media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(media_id, to_user_id)
);

CREATE INDEX idx_shared_media_to_user ON shared_media(to_user_id);
CREATE INDEX idx_shared_media_from_user ON shared_media(from_user_id);
CREATE INDEX idx_shared_media_media_id ON shared_media(media_id);

-- Comments table (optional feature)
CREATE TABLE IF NOT EXISTS comments (
    id SERIAL PRIMARY KEY,
    media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_comments_media_id ON comments(media_id);
CREATE INDEX idx_comments_user_id ON comments(user_id);

-- Likes table (optional feature)
CREATE TABLE IF NOT EXISTS likes (
    id SERIAL PRIMARY KEY,
    media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(media_id, user_id)
);

CREATE INDEX idx_likes_media_id ON likes(media_id);
CREATE INDEX idx_likes_user_id ON likes(user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers to automatically update updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_media_updated_at BEFORE UPDATE ON media
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_comments_updated_at BEFORE UPDATE ON comments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- View for media with share counts
CREATE OR REPLACE VIEW media_with_stats AS
SELECT 
    m.id,
    m.user_id,
    m.s3_key,
    m.file_name,
    m.file_type,
    m.status,
    m.metadata,
    m.thumbnail_key,
    m.created_at,
    m.processed_at,
    COALESCE(share_count.count, 0) as share_count,
    COALESCE(like_count.count, 0) as like_count,
    COALESCE(comment_count.count, 0) as comment_count
FROM media m
LEFT JOIN (
    SELECT media_id, COUNT(*) as count 
    FROM shared_media 
    GROUP BY media_id
) share_count ON m.id = share_count.media_id
LEFT JOIN (
    SELECT media_id, COUNT(*) as count 
    FROM likes 
    GROUP BY media_id
) like_count ON m.id = like_count.media_id
LEFT JOIN (
    SELECT media_id, COUNT(*) as count 
    FROM comments 
    GROUP BY media_id
) comment_count ON m.id = comment_count.media_id;

-- Sample data for testing (optional)
-- INSERT INTO users (email, username, password_hash) VALUES
-- ('test@example.com', 'testuser', '$2a$10$...');

-- Grant permissions (adjust as needed for your RDS setup)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_db_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO your_db_user;
