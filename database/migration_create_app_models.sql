-- Bảng người mẫu của app (curated bởi admin), mở khóa theo tier của user.
-- Tách hẳn khỏi library_items (category='model' cũ) — xem migration_cleanup_legacy.sql
-- nếu cần dọn category đó khỏi library_items sau khi đã di chuyển dữ liệu cần giữ.

CREATE TABLE public.app_models (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    image_url text NOT NULL,
    gender text CHECK (gender IN ('male', 'female', 'unisex')),
    tags text[],
    required_tier text NOT NULL DEFAULT 'free' CHECK (required_tier IN ('free', 'basic', 'pro', 'agency')),
    display_order int NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_app_models_active_order ON public.app_models (is_active, display_order);

ALTER TABLE public.app_models ENABLE ROW LEVEL SECURITY;

-- Đọc qua backend (service role) là chính; policy này chỉ phòng trường hợp
-- frontend gọi trực tiếp Supabase sau này.
CREATE POLICY "Cho phép user đã đăng nhập xem người mẫu đang active"
ON public.app_models
FOR SELECT
TO authenticated
USING (is_active = true);

-- Admin CRUD đi qua supabaseAdmin (service role) — bảng mới không tự động kế thừa
-- default privileges của project cho service_role, nên cần GRANT base privilege.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_models TO service_role;

-- ── Kiểm tra trước khi chạy DROP (nếu dọn category 'model' khỏi library_items) ──
-- SELECT count(*) FROM public.library_items WHERE category = 'model';
    