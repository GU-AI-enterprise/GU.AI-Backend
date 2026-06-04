-- Seed 3 test credit packages (10,000 VND / 50 credits each)
-- Run this in Supabase SQL Editor to set up test packages

INSERT INTO public.credit_packages (name, price, credit_amount, bonus_credit, is_active, sort_order)
VALUES
  ('Gói Starter',  10000, 50, 0, true, 1),
  ('Gói Creator',  10000, 50, 0, true, 2),
  ('Gói Pro',      10000, 50, 0, true, 3)
ON CONFLICT DO NOTHING;
