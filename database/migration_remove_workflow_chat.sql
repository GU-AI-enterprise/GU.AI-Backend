-- Migration: gỡ bỏ "Trợ lý ảo" (workflow planner chat đa bước) — xem
-- docs/09-tro-ly-ao-danh-gia-va-de-xuat.md để biết lý do/ngữ cảnh quyết định.
-- ⚠ Chạy thủ công trong Supabase SQL Editor. KHÔNG tự động — hãy chạy từng bước,
--   kiểm tra kết quả các SELECT xác minh trước khi DROP.

-- ── 0. Xác minh trước khi xoá (BẮT BUỘC chạy + đọc kết quả trước) ────────────
-- Nếu 1 trong các bảng dưới đây còn dữ liệu mà bạn cần giữ lại (vd. lịch sử workflow
-- cũ của user), DỪNG LẠI — cân nhắc export/backup trước khi DROP.
select count(*) as ai_workflows_rows       from public.ai_workflows;
select count(*) as ai_workflow_steps_rows  from public.ai_workflow_steps;
select count(*) as workflow_chat_state_rows from public.workflow_chat_state;

-- ── 1. Xoá bảng workflow chat history ────────────────────────────────────────
-- Chỉ được dùng bởi WorkflowChatService (đã xoá khỏi code) để lưu 1 thread chat/user.
drop table if exists public.workflow_chat_state;

-- ── 2. Xoá bảng workflow execution (child trước, FK tới ai_workflows) ────────
-- Chỉ được dùng bởi WorkflowExecutorService (đã xoá khỏi code) để chạy plan đa bước
-- do "Trợ lý ảo" sinh ra. Không có tính năng nào khác tạo ra "plan" để bảng này phục vụ.
drop table if exists public.ai_workflow_steps;
drop table if exists public.ai_workflows;
