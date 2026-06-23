-- Lưu lịch sử chat của workflow planner: 1 luồng hội thoại liên tục mỗi user
-- (không phải multi-thread). Chạy thủ công trong Supabase SQL Editor.

CREATE TABLE public.workflow_chat_state (
  user_id    uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  turns      jsonb NOT NULL DEFAULT '[]'::jsonb,  -- ConversationTurn[]: [{role, text}, ...]
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workflow_chat_state ENABLE ROW LEVEL SECURITY;

-- Chỉ truy cập qua supabaseAdmin (service role) từ backend — không thêm policy nào
-- (service role bypass RLS), nhưng vẫn cần GRANT base privilege vì bảng mới không
-- tự động kế thừa default privileges của project cho role service_role.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_chat_state TO service_role;
