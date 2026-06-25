-- 1. Thêm cột lưu hạn gói — null = free / không có hạn (không phải đang mua gói trả phí).
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS plan_expires_at timestamptz;

-- ── Kiểm tra trước khi đổi CHECK constraint (chạy tay, xem có row nào dùng 'agency' không) ──
-- SELECT id, email, plan_type FROM public.users WHERE plan_type = 'agency';
-- SELECT id, name, grants_plan_type FROM public.credit_packages WHERE grants_plan_type = 'agency';
-- SELECT id, name, required_tier FROM public.app_models WHERE required_tier = 'agency';

-- Nếu có row dùng 'agency' ở trên, hạ về 'pro' (hoặc tier phù hợp) TRƯỚC khi chạy phần dưới:
-- UPDATE public.users SET plan_type = 'pro' WHERE plan_type = 'agency';
-- UPDATE public.credit_packages SET grants_plan_type = 'pro' WHERE grants_plan_type = 'agency';
-- UPDATE public.app_models SET required_tier = 'pro' WHERE required_tier = 'agency';

-- 2. Bỏ 'agency' khỏi CHECK constraint của users.plan_type (chỉ còn free/basic/pro).
-- Tên constraint có thể khác tuỳ lúc tạo — kiểm tra tên thật trước khi DROP:
-- SELECT conname FROM pg_constraint WHERE conrelid = 'public.users'::regclass AND contype = 'c';
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_plan_type_check;
ALTER TABLE public.users ADD CONSTRAINT users_plan_type_check
  CHECK (plan_type IN ('free', 'basic', 'pro'));

-- 3. Bỏ 'agency' khỏi CHECK constraint của app_models.required_tier.
ALTER TABLE public.app_models DROP CONSTRAINT IF EXISTS app_models_required_tier_check;
ALTER TABLE public.app_models ADD CONSTRAINT app_models_required_tier_check
  CHECK (required_tier IN ('free', 'basic', 'pro'));

-- ── 4. Backfill thủ công cho 1 user đã thanh toán thành công nhưng KHÔNG được nâng cấp plan_type ──
-- (xảy ra nếu mua gói TRƯỚC khi cột plan_expires_at ở bước 1 tồn tại — webhook/processPayment
-- update plan_type+plan_expires_at thất bại âm thầm vì cột chưa có, credit vẫn cộng bình thường
-- do trigger riêng). Điền email, chạy SAU khi đã chạy xong bước 1-3 ở trên:
-- WITH target_user AS (
--   SELECT id FROM public.users WHERE email = 'EMAIL_CUA_BAN'
-- ),
-- latest_paid_plan AS (
--   SELECT pkg.grants_plan_type
--   FROM public.transactions t
--   JOIN public.credit_packages pkg ON pkg.id = t.package_id
--   JOIN target_user tu ON tu.id = t.user_id
--   WHERE t.status = 'success' AND pkg.grants_plan_type IS NOT NULL AND pkg.grants_plan_type <> 'free'
--   ORDER BY t.paid_at DESC
--   LIMIT 1
-- )
-- UPDATE public.users
-- SET plan_type = (SELECT grants_plan_type FROM latest_paid_plan),
--     plan_expires_at = now() + interval '30 days',
--     updated_at = now()
-- WHERE id = (SELECT id FROM target_user)
--   AND EXISTS (SELECT 1 FROM latest_paid_plan);
