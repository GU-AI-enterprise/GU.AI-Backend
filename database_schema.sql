-- =====================================================
-- 1. users
-- =====================================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_id VARCHAR(255),
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255),
    role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'staff', 'admin')),
    credit_balance INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_google_id ON users(google_id);

-- =====================================================
-- 2. user_sessions
-- =====================================================
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    access_token TEXT,
    refresh_token TEXT,
    device_info JSONB,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON user_sessions(expires_at);

-- =====================================================
-- 3. user_preferences
-- =====================================================
CREATE TABLE user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    theme VARCHAR(10) DEFAULT 'light' CHECK (theme IN ('dark', 'light')),
    language VARCHAR(10) DEFAULT 'en',
    shortcuts_config JSONB,
    notification_prefs JSONB,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_prefs_user_id ON user_preferences(user_id);

-- =====================================================
-- 4. ai_jobs
-- =====================================================
CREATE TABLE ai_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    job_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    input_params JSONB,
    queue_position INT DEFAULT 0,
    cost_credits INT DEFAULT 0,
    result_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_jobs_user_id ON ai_jobs(user_id);
CREATE INDEX idx_jobs_status ON ai_jobs(status);
CREATE INDEX idx_jobs_job_type ON ai_jobs(job_type);

-- =====================================================
-- 5. model_catalog
-- =====================================================
CREATE TABLE model_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    thumbnail_url TEXT,
    tags JSONB,
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- 6. images
-- =====================================================
CREATE TABLE images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    job_id UUID REFERENCES ai_jobs(id) ON DELETE SET NULL,
    file_url TEXT NOT NULL,
    thumbnail_url TEXT,
    type VARCHAR(20) CHECK (type IN ('input', 'output', 'edit', 'temp')),
    file_size BIGINT,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_images_user_id ON images(user_id);
CREATE INDEX idx_images_job_id ON images(job_id);
CREATE INDEX idx_images_type ON images(type);

-- =====================================================
-- 7. collections
-- =====================================================
CREATE TABLE collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    cover_image_id UUID REFERENCES images(id) ON DELETE SET NULL,
    is_public BOOLEAN DEFAULT FALSE,
    image_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_collections_user_id ON collections(user_id);

-- =====================================================
-- 8. collection_items
-- =====================================================
CREATE TABLE collection_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    image_id UUID NOT NULL REFERENCES images(id) ON DELETE CASCADE,
    sort_order INT DEFAULT 0,
    UNIQUE(collection_id, image_id)
);

CREATE INDEX idx_collection_items_collection_id ON collection_items(collection_id);
CREATE INDEX idx_collection_items_image_id ON collection_items(image_id);

-- =====================================================
-- 9. batch_uploads
-- =====================================================
CREATE TABLE batch_uploads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    total_files INT DEFAULT 0,
    uploaded_count INT DEFAULT 0,
    failed_count INT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    error_log JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_batch_user_id ON batch_uploads(user_id);

-- =====================================================
-- 10. image_edits
-- =====================================================
CREATE TABLE image_edits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    image_id UUID NOT NULL REFERENCES images(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    edit_type VARCHAR(50) NOT NULL,
    params JSONB,
    result_image_id UUID REFERENCES images(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_edits_image_id ON image_edits(image_id);
CREATE INDEX idx_edits_user_id ON image_edits(user_id);

-- =====================================================
-- 11. backgrounds
-- =====================================================
CREATE TABLE backgrounds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    preview_url TEXT,
    is_premium BOOLEAN DEFAULT FALSE,
    tags JSONB,
    usage_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_backgrounds_category ON backgrounds(category);
CREATE INDEX idx_backgrounds_is_premium ON backgrounds(is_premium);

-- =====================================================
-- 12. notifications
-- =====================================================
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255),
    body TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    sent_via VARCHAR(20) CHECK (sent_via IN ('app', 'email', 'both')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_type ON notifications(type);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);

-- =====================================================
-- 13. activity_logs
-- =====================================================
CREATE TABLE activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action VARCHAR(255) NOT NULL,
    entity_type VARCHAR(100),
    entity_id UUID,
    meta JSONB,
    ip_address INET,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_logs_user_id ON activity_logs(user_id);
CREATE INDEX idx_logs_action ON activity_logs(action);
CREATE INDEX idx_logs_created_at ON activity_logs(created_at);

-- =====================================================
-- 14. usage_stats
-- =====================================================
CREATE TABLE usage_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stat_date DATE NOT NULL,
    images_generated INT DEFAULT 0,
    credits_used INT DEFAULT 0,
    api_calls INT DEFAULT 0,
    storage_mb INT DEFAULT 0,
    UNIQUE(user_id, stat_date)
);

CREATE INDEX idx_stats_user_id ON usage_stats(user_id);
CREATE INDEX idx_stats_stat_date ON usage_stats(stat_date);

-- =====================================================
-- 15. credit_packages
-- =====================================================
CREATE TABLE credit_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    credits INT NOT NULL,
    price_vnd BIGINT NOT NULL,
    discount_pct INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- 16. transactions
-- =====================================================
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    package_id UUID REFERENCES credit_packages(id) ON DELETE SET NULL,
    amount_vnd BIGINT NOT NULL,
    provider VARCHAR(20) CHECK (provider IN ('vnpay', 'momo', 'bank')),
    provider_txn_id VARCHAR(255),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'refunded')),
    paid_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_provider_txn_id ON transactions(provider_txn_id);

-- =====================================================
-- 17. credit_ledger
-- =====================================================
CREATE TABLE credit_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ref_id UUID,
    ref_type VARCHAR(20) CHECK (ref_type IN ('transaction', 'job', 'refund', 'bonus')),
    delta INT NOT NULL,
    balance_after INT NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ledger_user_id ON credit_ledger(user_id);
CREATE INDEX idx_ledger_ref_id ON credit_ledger(ref_id);

-- =====================================================
-- 18. threads (cộng đồng)
-- =====================================================
CREATE TABLE threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    body TEXT,
    category VARCHAR(50) CHECK (category IN ('pose', 'bg', 'tip', 'share')),
    cover_image_id UUID REFERENCES images(id) ON DELETE SET NULL,
    likes_count INT DEFAULT 0,
    views_count INT DEFAULT 0,
    is_pinned BOOLEAN DEFAULT FALSE,
    is_published BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_threads_user_id ON threads(user_id);
CREATE INDEX idx_threads_category ON threads(category);
CREATE INDEX idx_threads_created_at ON threads(created_at);

-- =====================================================
-- 19. thread_comments
-- =====================================================
CREATE TABLE thread_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES thread_comments(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    likes_count INT DEFAULT 0,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_comments_thread_id ON thread_comments(thread_id);
CREATE INDEX idx_comments_user_id ON thread_comments(user_id);
CREATE INDEX idx_comments_parent_id ON thread_comments(parent_id);

-- =====================================================
-- 20. support_messages
-- =====================================================
CREATE TABLE support_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_staff_id UUID REFERENCES users(id) ON DELETE SET NULL,
    ticket_id UUID,
    body TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_support_from_user ON support_messages(from_user_id);
CREATE INDEX idx_support_ticket_id ON support_messages(ticket_id);

-- =====================================================
-- 21. pose_recommendations
-- =====================================================
CREATE TABLE pose_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    preview_url TEXT,
    tags JSONB,
    is_trending BOOLEAN DEFAULT FALSE,
    usage_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- 22. system_configs
-- =====================================================
CREATE TABLE system_configs (
    key VARCHAR(255) PRIMARY KEY,
    value TEXT,
    value_type VARCHAR(20) CHECK (value_type IN ('string', 'int', 'bool', 'json')),
    description TEXT,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- 23. finetune_samples
-- =====================================================
CREATE TABLE finetune_samples (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    prompt_text TEXT,
    model_used VARCHAR(255),
    input_image_id UUID REFERENCES images(id) ON DELETE SET NULL,
    output_image_id UUID REFERENCES images(id) ON DELETE SET NULL,
    quality_score FLOAT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'training')),
    tags JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_finetune_created_by ON finetune_samples(created_by);
CREATE INDEX idx_finetune_status ON finetune_samples(status);
-- =====================================================
-- 20. collections
-- =====================================================
CREATE TABLE collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    cover_image_id UUID, -- References images(id), omitted foreign key for flexibility but could be added
    image_count INT DEFAULT 0,
    is_public BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_collections_user_id ON collections(user_id);

-- =====================================================
-- 21. collection_items
-- =====================================================
CREATE TABLE collection_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    image_id UUID NOT NULL REFERENCES images(id) ON DELETE CASCADE,
    sort_order INT DEFAULT 0,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(collection_id, image_id)
);

CREATE INDEX idx_collection_items_col_id ON collection_items(collection_id);

