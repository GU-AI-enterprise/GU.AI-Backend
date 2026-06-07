-- Migration: plan_type tiers + top-up pay-as-you-go
-- Run in Supabase SQL Editor

-- 1. Ensure plan_type column exists on users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS plan_type VARCHAR(20) NOT NULL DEFAULT 'free';

-- Expand allowed values
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_plan_type_check;
ALTER TABLE public.users ADD CONSTRAINT users_plan_type_check
  CHECK (plan_type IN ('free', 'basic', 'pro', 'agency'));

-- 2. Add grants_plan_type to credit_packages
ALTER TABLE public.credit_packages
  ADD COLUMN IF NOT EXISTS grants_plan_type VARCHAR(20) DEFAULT NULL;

-- 3. Map packages → plan types  (sort_order 1=Starter, 2=Cơ Bản, 3=Chuyên Nghiệp)
UPDATE public.credit_packages SET grants_plan_type = 'basic'  WHERE sort_order = 1;
UPDATE public.credit_packages SET grants_plan_type = 'pro'    WHERE sort_order = 2;
UPDATE public.credit_packages SET grants_plan_type = 'agency' WHERE sort_order = 3;
