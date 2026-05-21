-- =========================================================================
-- SUPABASE OPTIMIZED DATABASE SCHEMA FOR GU.AI
-- =========================================================================
-- File này đã được thiết kế lại để tương thích hoàn toàn với Supabase Auth
-- và tối ưu hóa PostgreSQL hiệu năng cao.
-- =========================================================================

-- Dọn dẹp trigger cũ nếu có để tránh xung đột
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- =====================================================
-- 1. users (Liên kết trực tiếp với auth.users của Supabase)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    google_id VARCHAR(255),
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255),
    role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'staff', 'admin')),
    credit_balance INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON public.users(google_id);

-- Enable RLS cho bảng users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Tạo RLS Policies cho bảng users
CREATE POLICY "Cho phép tất cả người dùng xem thông tin cơ bản của chính mình"
    ON public.users FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Cho phép chính người dùng cập nhật thông tin của mình"
    ON public.users FOR UPDATE
    USING (auth.uid() = id);

-- =====================================================
-- TRIGGER TỰ ĐỘNG ĐỒNG BỘ TỪ auth.users SANG public.users
-- =====================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    user_fullname VARCHAR(255);
    user_google_id VARCHAR(255);
BEGIN
    -- Trích xuất tên hiển thị từ metadata của provider
    user_fullname := COALESCE(
        new.raw_user_meta_data->>'full_name', 
        new.raw_user_meta_data->>'name', 
        split_part(new.email, '@', 1)
    );
    
    -- Trích xuất google_id nếu đăng nhập qua Google OAuth
    IF new.raw_app_meta_data->>'provider' = 'google' THEN
        user_google_id := new.raw_user_meta_data->>'sub';
    ELSE
        user_google_id := NULL;
    END IF;

    INSERT INTO public.users (id, email, full_name, google_id, role, credit_balance, is_active)
    VALUES (
        new.id,
        new.email,
        user_fullname,
        user_google_id,
        'user',
        0, -- Số dư credit khởi tạo mặc định là 0
        TRUE
    );
    RETURN new;
END;
$$ language plpgsql security definer;

-- Đăng ký trigger chạy sau khi chèn dòng mới vào auth.users
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- =====================================================
-- 2. user_sessions
-- =====================================================
CREATE TABLE IF NOT EXISTS public.user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    access_token TEXT,
    refresh_token TEXT,
    device_info JSONB,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON public.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON public.user_sessions(expires_at);

-- =====================================================
-- 3. user_preferences
-- =====================================================
CREATE TABLE IF NOT EXISTS public.user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    theme VARCHAR(10) DEFAULT 'light' CHECK (theme IN ('dark', 'light')),
    language VARCHAR(10) DEFAULT 'en',
    shortcuts_config JSONB,
    notification_prefs JSONB,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_prefs_user_id ON public.user_preferences(user_id);

-- =====================================================
-- 4. ai_jobs
-- =====================================================
CREATE TABLE IF NOT EXISTS public.ai_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    job_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    input_params JSONB,
    queue_position INT DEFAULT 0,
    cost_credits INT DEFAULT 0,
    result_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON public.ai_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.ai_jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_job_type ON public.ai_jobs(job_type);

-- =====================================================
-- 5. model_catalog
-- =====================================================
CREATE TABLE IF NOT EXISTS public.model_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    thumbnail_url TEXT,
    tags JSONB,
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- =====================================================
-- 6. images
-- =====================================================
CREATE TABLE IF NOT EXISTS public.images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    job_id UUID REFERENCES public.ai_jobs(id) ON DELETE SET NULL,
    file_url TEXT NOT NULL,
    thumbnail_url TEXT,
    type VARCHAR(20) CHECK (type IN ('input', 'output', 'edit', 'temp')),
    file_size BIGINT,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_images_user_id ON public.images(user_id);
CREATE INDEX IF NOT EXISTS idx_images_job_id ON public.images(job_id);
CREATE INDEX IF NOT EXISTS idx_images_type ON public.images(type);

-- =====================================================
-- 7. collections
-- =====================================================
CREATE TABLE IF NOT EXISTS public.collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    cover_image_id UUID REFERENCES public.images(id) ON DELETE SET NULL,
    is_public BOOLEAN DEFAULT FALSE,
    image_count INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_collections_user_id ON public.collections(user_id);

-- =====================================================
-- 8. collection_items
-- =====================================================
CREATE TABLE IF NOT EXISTS public.collection_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    collection_id UUID NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
    image_id UUID NOT NULL REFERENCES public.images(id) ON DELETE CASCADE,
    sort_order INT DEFAULT 0,
    UNIQUE(collection_id, image_id)
);

CREATE INDEX IF NOT EXISTS idx_collection_items_collection_id ON public.collection_items(collection_id);
CREATE INDEX IF NOT EXISTS idx_collection_items_image_id ON public.collection_items(image_id);

-- =====================================================
-- 9. batch_uploads
-- =====================================================
CREATE TABLE IF NOT EXISTS public.batch_uploads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    total_files INT DEFAULT 0,
    uploaded_count INT DEFAULT 0,
    failed_count INT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    error_log JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_batch_user_id ON public.batch_uploads(user_id);

-- =====================================================
-- 10. image_edits
-- =====================================================
CREATE TABLE IF NOT EXISTS public.image_edits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    image_id UUID NOT NULL REFERENCES public.images(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    edit_type VARCHAR(50) NOT NULL,
    params JSONB,
    result_image_id UUID REFERENCES public.images(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_edits_image_id ON public.image_edits(image_id);
CREATE INDEX IF NOT EXISTS idx_edits_user_id ON public.image_edits(user_id);

-- =====================================================
-- 11. backgrounds
-- =====================================================
CREATE TABLE IF NOT EXISTS public.backgrounds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    preview_url TEXT,
    is_premium BOOLEAN DEFAULT FALSE,
    tags JSONB,
    usage_count INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_backgrounds_category ON public.backgrounds(category);
CREATE INDEX IF NOT EXISTS idx_backgrounds_is_premium ON public.backgrounds(is_premium);

-- =====================================================
-- 12. notifications
-- =====================================================
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255),
    body TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    sent_via VARCHAR(20) CHECK (sent_via IN ('app', 'email', 'both')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications(is_read);

-- =====================================================
-- 13. activity_logs
-- =====================================================
CREATE TABLE IF NOT EXISTS public.activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    action VARCHAR(255) NOT NULL,
    entity_type VARCHAR(100),
    entity_id UUID,
    meta JSONB,
    ip_address INET,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_logs_user_id ON public.activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_logs_action ON public.activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON public.activity_logs(created_at);

-- =====================================================
-- 14. usage_stats
-- =====================================================
CREATE TABLE IF NOT EXISTS public.usage_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    stat_date DATE NOT NULL,
    images_generated INT DEFAULT 0,
    credits_used INT DEFAULT 0,
    api_calls INT DEFAULT 0,
    storage_mb INT DEFAULT 0,
    UNIQUE(user_id, stat_date)
);

CREATE INDEX IF NOT EXISTS idx_stats_user_id ON public.usage_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_stats_stat_date ON public.usage_stats(stat_date);

-- =====================================================
-- 15. credit_packages
-- =====================================================
CREATE TABLE IF NOT EXISTS public.credit_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    credits INT NOT NULL,
    price_vnd BIGINT NOT NULL,
    discount_pct INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- =====================================================
-- 16. transactions
-- =====================================================
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    package_id UUID REFERENCES public.credit_packages(id) ON DELETE SET NULL,
    amount_vnd BIGINT NOT NULL,
    provider VARCHAR(20) CHECK (provider IN ('vnpay', 'momo', 'bank')),
    provider_txn_id VARCHAR(255),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'refunded')),
    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON public.transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_provider_txn_id ON public.transactions(provider_txn_id);

-- =====================================================
-- 17. credit_ledger
-- =====================================================
CREATE TABLE IF NOT EXISTS public.credit_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    ref_id UUID,
    ref_type VARCHAR(20) CHECK (ref_type IN ('transaction', 'job', 'refund', 'bonus')),
    delta INT NOT NULL,
    balance_after INT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ledger_user_id ON public.credit_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_ledger_ref_id ON public.credit_ledger(ref_id);

-- =====================================================
-- 18. threads (Cộng đồng)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    body TEXT,
    category VARCHAR(50) CHECK (category IN ('pose', 'bg', 'tip', 'share')),
    cover_image_id UUID REFERENCES public.images(id) ON DELETE SET NULL,
    likes_count INT DEFAULT 0,
    views_count INT DEFAULT 0,
    is_pinned BOOLEAN DEFAULT FALSE,
    is_published BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_threads_user_id ON public.threads(user_id);
CREATE INDEX IF NOT EXISTS idx_threads_category ON public.threads(category);
CREATE INDEX IF NOT EXISTS idx_threads_created_at ON public.threads(created_at);

-- =====================================================
-- 19. thread_comments
-- =====================================================
CREATE TABLE IF NOT EXISTS public.thread_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID NOT NULL REFERENCES public.threads(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES public.thread_comments(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    likes_count INT DEFAULT 0,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_comments_thread_id ON public.thread_comments(thread_id);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON public.thread_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON public.thread_comments(parent_id);

-- =====================================================
-- 20. support_messages
-- =====================================================
CREATE TABLE IF NOT EXISTS public.support_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    to_staff_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    ticket_id UUID,
    body TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_support_from_user ON public.support_messages(from_user_id);
CREATE INDEX IF NOT EXISTS idx_support_ticket_id ON public.support_messages(ticket_id);

-- =====================================================
-- 21. pose_recommendations
-- =====================================================
CREATE TABLE IF NOT EXISTS public.pose_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    preview_url TEXT,
    tags JSONB,
    is_trending BOOLEAN DEFAULT FALSE,
    usage_count INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- =====================================================
-- 22. system_configs
-- =====================================================
CREATE TABLE IF NOT EXISTS public.system_configs (
    key VARCHAR(255) PRIMARY KEY,
    value TEXT,
    value_type VARCHAR(20) CHECK (value_type IN ('string', 'int', 'bool', 'json')),
    description TEXT,
    updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- =====================================================
-- 23. finetune_samples
-- =====================================================
CREATE TABLE IF NOT EXISTS public.finetune_samples (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    prompt_text TEXT,
    model_used VARCHAR(255),
    input_image_id UUID REFERENCES public.images(id) ON DELETE SET NULL,
    output_image_id UUID REFERENCES public.images(id) ON DELETE SET NULL,
    quality_score FLOAT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'training')),
    tags JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_finetune_created_by ON public.finetune_samples(created_by);
CREATE INDEX IF NOT EXISTS idx_finetune_status ON public.finetune_samples(status);
