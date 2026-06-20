-- Migration: dọn tàn dư kiến trúc cũ (audit 2026-06)
-- ⚠ Chạy thủ công trong Supabase SQL Editor. KHÔNG tự động — hãy chạy từng bước,
--   kiểm tra kết quả các SELECT xác minh trước khi ALTER/DROP.

-- ── 1. Xóa 4 bảng template cũ ─────────────────────────────────────────────────
-- Đã được thay thế hoàn toàn bởi `library_items` (migration_create_library_items.sql).
-- Xác nhận: không còn file code nào trong GU.AI-Backend hoặc GU.AI-Frontend query các bảng này
-- (chỉ còn xuất hiện trong database_schema.sql/functions.sql/triggers.sql cũ).
-- Không có bảng nào khác FK tới 4 bảng này ngoài chính chúng tham chiếu tới `assets`.
drop table if exists public.user_unlocked_templates;
drop table if exists public.model_templates;
drop table if exists public.background_templates;
drop table if exists public.pose_templates;

-- ── 2. Thu hẹp CHECK constraint của ai_jobs.provider ──────────────────────────
-- 'nano_banana' là tàn dư kiến trúc Gemini-trực-tiếp cũ (trước khi chuyển sang Fashn.ai).
-- 'remove_bg' được định nghĩa trong enum AIProvider nhưng chưa từng được gán cho job nào
-- (toàn bộ ai.controller.ts chỉ dùng AIProvider.FASHN).
-- ⚠ BẮT BUỘC chạy trước để xác nhận an toàn:
--   SELECT DISTINCT provider FROM public.ai_jobs;
--   → nếu thấy giá trị khác 'fashn', DỪNG LẠI, không chạy ALTER bên dưới.
alter table public.ai_jobs drop constraint if exists ai_jobs_provider_check;
alter table public.ai_jobs add constraint ai_jobs_provider_check
  check (provider::text = 'fashn'::text);

-- ── 3. Thu hẹp CHECK constraint của transactions.provider ─────────────────────
-- Chỉ PayOS được implement (payos.service.ts); vnpay/momo/bank chưa từng được code.
-- ⚠ BẮT BUỘC chạy trước để xác nhận an toàn:
--   SELECT DISTINCT provider FROM public.transactions;
--   → nếu thấy giá trị khác 'payos', DỪNG LẠI, không chạy ALTER bên dưới.
alter table public.transactions drop constraint if exists transactions_provider_check;
alter table public.transactions add constraint transactions_provider_check
  check (provider::text = 'payos'::text);
