-- Credit packages — run in Supabase SQL Editor
-- Clears old test data and inserts production packages

DELETE FROM public.credit_packages WHERE sort_order IN (0, 1, 2, 3);

-- Gói "Dùng Thử" (free): baseline hiển thị trên pricing/top-up, không mua qua PayOS.
INSERT INTO public.credit_packages (name, price, credit_amount, bonus_credit, is_active, sort_order, grants_plan_type, description)
VALUES
  ('Dùng Thử',                0,   20, 0, true, 0, 'free',  '{"ai_assistant": false, "models_unlocked": 4}'::jsonb),
  ('Starter',            199000,  100, 0, true, 1, 'basic', '{"ai_assistant": true, "models_unlocked": 9}'::jsonb),
  ('Gói Cơ Bản',        349000,  200, 0, true, 2, 'pro',   '{"ai_assistant": true, "models_unlocked": "all"}'::jsonb)
ON CONFLICT DO NOTHING;
