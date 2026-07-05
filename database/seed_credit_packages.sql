-- Credit packages — run in Supabase SQL Editor
-- Clears old test data and inserts production packages

DELETE FROM public.credit_packages WHERE sort_order IN (1, 2, 3);

INSERT INTO public.credit_packages (name, price, credit_amount, bonus_credit, is_active, sort_order, grants_plan_type)
VALUES
  ('Starter',            249000,  100, 0, true, 1, 'basic'),
  ('Gói Cơ Bản',        449000,  200, 0, true, 2, 'pro'),
  ('Gói Chuyên Nghiệp', 990000, 500, 0, true, 3, 'agency')
ON CONFLICT DO NOTHING;
