-- Migration: Expand ai_jobs.type CHECK constraint to include all job types
-- Run this in Supabase SQL Editor

ALTER TABLE public.ai_jobs
  DROP CONSTRAINT IF EXISTS ai_jobs_type_check;

ALTER TABLE public.ai_jobs
  ADD CONSTRAINT ai_jobs_type_check
  CHECK (type::text = ANY (ARRAY[
    'try_on',
    'try_on_max',
    'generate',
    'edit',
    'remove_bg',
    'upscale',
    'product_to_model',
    'reframe',
    'face_swap',
    'model_swap',
    'create_model',
    'image_to_video'
  ]::text[]));
