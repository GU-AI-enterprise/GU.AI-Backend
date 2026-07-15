-- Migration: thêm cột description (JSONB) cho credit_packages — mô tả ưu đãi của từng gói.
-- Chạy thủ công trong Supabase SQL Editor.
--
-- Cấu trúc JSON:
--   ai_assistant    boolean          — gói có được dùng Trợ lý AI Studio không (basic trở lên)
--   models_unlocked number | "all"   — số người mẫu AI được mở khóa (free 4, basic 9, pro tất cả)
--   perks           string[]         — (tuỳ chọn) các dòng ưu đãi bổ sung hiển thị trên card

ALTER TABLE public.credit_packages
  ADD COLUMN IF NOT EXISTS description JSONB DEFAULT NULL;

UPDATE public.credit_packages
SET description = '{"ai_assistant": false, "models_unlocked": 4}'::jsonb
WHERE grants_plan_type = 'free';

UPDATE public.credit_packages
SET description = '{"ai_assistant": true, "models_unlocked": 9}'::jsonb
WHERE grants_plan_type = 'basic';

UPDATE public.credit_packages
SET description = '{"ai_assistant": true, "models_unlocked": "all"}'::jsonb
WHERE grants_plan_type = 'pro';

-- ⚠ Số models trong description phải khớp với dữ liệu app_models.required_tier
-- (free mở 4, basic mở thêm 5 = 9, pro = tất cả). Kiểm tra bằng:
--   SELECT required_tier, COUNT(*) FROM public.app_models WHERE is_active = true GROUP BY required_tier;
-- Nếu lệch, chỉnh required_tier của từng model trong trang admin /dashboard/models
-- (hoặc UPDATE trực tiếp) rồi cập nhật lại số trong description cho khớp.
