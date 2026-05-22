-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.activity_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action character varying NOT NULL,
  entity_type character varying,
  entity_id uuid,
  meta jsonb,
  ip_address inet,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT activity_logs_pkey PRIMARY KEY (id),
  CONSTRAINT activity_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.ai_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  job_type character varying NOT NULL,
  status character varying DEFAULT 'pending'::character varying CHECK (status::text = ANY (ARRAY['pending'::character varying, 'processing'::character varying, 'completed'::character varying, 'failed'::character varying, 'cancelled'::character varying]::text[])),
  input_params jsonb,
  queue_position integer DEFAULT 0,
  cost_credits integer DEFAULT 0,
  result_url text,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ai_jobs_pkey PRIMARY KEY (id),
  CONSTRAINT ai_jobs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.backgrounds (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name character varying NOT NULL,
  category character varying,
  preview_url text,
  is_premium boolean DEFAULT false,
  tags jsonb,
  usage_count integer DEFAULT 0,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT backgrounds_pkey PRIMARY KEY (id)
);
CREATE TABLE public.batch_uploads (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  total_files integer DEFAULT 0,
  uploaded_count integer DEFAULT 0,
  failed_count integer DEFAULT 0,
  status character varying DEFAULT 'pending'::character varying CHECK (status::text = ANY (ARRAY['pending'::character varying, 'processing'::character varying, 'completed'::character varying, 'failed'::character varying]::text[])),
  error_log jsonb,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT batch_uploads_pkey PRIMARY KEY (id),
  CONSTRAINT batch_uploads_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.collection_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  collection_id uuid NOT NULL,
  image_id uuid NOT NULL,
  sort_order integer DEFAULT 0,
  CONSTRAINT collection_items_pkey PRIMARY KEY (id),
  CONSTRAINT collection_items_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.collections(id),
  CONSTRAINT collection_items_image_id_fkey FOREIGN KEY (image_id) REFERENCES public.images(id)
);
CREATE TABLE public.collections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name character varying NOT NULL,
  cover_image_id uuid,
  is_public boolean DEFAULT false,
  image_count integer DEFAULT 0,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT collections_pkey PRIMARY KEY (id),
  CONSTRAINT collections_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT collections_cover_image_id_fkey FOREIGN KEY (cover_image_id) REFERENCES public.images(id)
);
CREATE TABLE public.credit_ledger (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  ref_id uuid,
  ref_type character varying CHECK (ref_type::text = ANY (ARRAY['transaction'::character varying, 'job'::character varying, 'refund'::character varying, 'bonus'::character varying]::text[])),
  delta integer NOT NULL,
  balance_after integer NOT NULL,
  description text,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT credit_ledger_pkey PRIMARY KEY (id),
  CONSTRAINT credit_ledger_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.credit_packages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name character varying NOT NULL,
  credits integer NOT NULL,
  price_vnd bigint NOT NULL,
  discount_pct integer DEFAULT 0,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT credit_packages_pkey PRIMARY KEY (id)
);
CREATE TABLE public.finetune_samples (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL,
  prompt_text text,
  model_used character varying,
  input_image_id uuid,
  output_image_id uuid,
  quality_score double precision,
  status character varying DEFAULT 'pending'::character varying CHECK (status::text = ANY (ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'training'::character varying]::text[])),
  tags jsonb,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT finetune_samples_pkey PRIMARY KEY (id),
  CONSTRAINT finetune_samples_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id),
  CONSTRAINT finetune_samples_input_image_id_fkey FOREIGN KEY (input_image_id) REFERENCES public.images(id),
  CONSTRAINT finetune_samples_output_image_id_fkey FOREIGN KEY (output_image_id) REFERENCES public.images(id)
);
CREATE TABLE public.image_edits (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  image_id uuid NOT NULL,
  user_id uuid NOT NULL,
  edit_type character varying NOT NULL,
  params jsonb,
  result_image_id uuid,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT image_edits_pkey PRIMARY KEY (id),
  CONSTRAINT image_edits_image_id_fkey FOREIGN KEY (image_id) REFERENCES public.images(id),
  CONSTRAINT image_edits_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT image_edits_result_image_id_fkey FOREIGN KEY (result_image_id) REFERENCES public.images(id)
);
CREATE TABLE public.images (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  job_id uuid,
  file_url text NOT NULL,
  thumbnail_url text,
  type character varying CHECK (type::text = ANY (ARRAY['input'::character varying, 'output'::character varying, 'edit'::character varying, 'temp'::character varying]::text[])),
  file_size bigint,
  is_deleted boolean DEFAULT false,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT images_pkey PRIMARY KEY (id),
  CONSTRAINT images_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT images_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.ai_jobs(id)
);
CREATE TABLE public.model_catalog (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name character varying NOT NULL,
  category character varying,
  thumbnail_url text,
  tags jsonb,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT model_catalog_pkey PRIMARY KEY (id)
);
CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type character varying NOT NULL,
  title character varying,
  body text,
  is_read boolean DEFAULT false,
  sent_via character varying CHECK (sent_via::text = ANY (ARRAY['app'::character varying, 'email'::character varying, 'both'::character varying]::text[])),
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT notifications_pkey PRIMARY KEY (id),
  CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.pose_recommendations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name character varying NOT NULL,
  category character varying,
  preview_url text,
  tags jsonb,
  is_trending boolean DEFAULT false,
  usage_count integer DEFAULT 0,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pose_recommendations_pkey PRIMARY KEY (id)
);
CREATE TABLE public.support_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  from_user_id uuid NOT NULL,
  to_staff_id uuid,
  ticket_id uuid,
  body text NOT NULL,
  is_read boolean DEFAULT false,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT support_messages_pkey PRIMARY KEY (id),
  CONSTRAINT support_messages_from_user_id_fkey FOREIGN KEY (from_user_id) REFERENCES public.users(id),
  CONSTRAINT support_messages_to_staff_id_fkey FOREIGN KEY (to_staff_id) REFERENCES public.users(id)
);
CREATE TABLE public.system_configs (
  key character varying NOT NULL,
  value text,
  value_type character varying CHECK (value_type::text = ANY (ARRAY['string'::character varying, 'int'::character varying, 'bool'::character varying, 'json'::character varying]::text[])),
  description text,
  updated_by uuid,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT system_configs_pkey PRIMARY KEY (key),
  CONSTRAINT system_configs_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id)
);
CREATE TABLE public.thread_comments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL,
  user_id uuid NOT NULL,
  parent_id uuid,
  body text NOT NULL,
  likes_count integer DEFAULT 0,
  is_deleted boolean DEFAULT false,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT thread_comments_pkey PRIMARY KEY (id),
  CONSTRAINT thread_comments_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.threads(id),
  CONSTRAINT thread_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT thread_comments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.thread_comments(id)
);
CREATE TABLE public.threads (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title character varying NOT NULL,
  body text,
  category character varying CHECK (category::text = ANY (ARRAY['pose'::character varying, 'bg'::character varying, 'tip'::character varying, 'share'::character varying]::text[])),
  cover_image_id uuid,
  likes_count integer DEFAULT 0,
  views_count integer DEFAULT 0,
  is_pinned boolean DEFAULT false,
  is_published boolean DEFAULT true,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT threads_pkey PRIMARY KEY (id),
  CONSTRAINT threads_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT threads_cover_image_id_fkey FOREIGN KEY (cover_image_id) REFERENCES public.images(id)
);
CREATE TABLE public.transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  package_id uuid,
  amount_vnd bigint NOT NULL,
  provider character varying CHECK (provider::text = ANY (ARRAY['vnpay'::character varying, 'momo'::character varying, 'bank'::character varying]::text[])),
  provider_txn_id character varying,
  status character varying DEFAULT 'pending'::character varying CHECK (status::text = ANY (ARRAY['pending'::character varying, 'success'::character varying, 'failed'::character varying, 'refunded'::character varying]::text[])),
  paid_at timestamp without time zone,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT transactions_pkey PRIMARY KEY (id),
  CONSTRAINT transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT transactions_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.credit_packages(id)
);
CREATE TABLE public.usage_stats (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  stat_date date NOT NULL,
  images_generated integer DEFAULT 0,
  credits_used integer DEFAULT 0,
  api_calls integer DEFAULT 0,
  storage_mb integer DEFAULT 0,
  CONSTRAINT usage_stats_pkey PRIMARY KEY (id),
  CONSTRAINT usage_stats_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.user_preferences (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  theme character varying DEFAULT 'light'::character varying CHECK (theme::text = ANY (ARRAY['dark'::character varying, 'light'::character varying]::text[])),
  language character varying DEFAULT 'en'::character varying,
  shortcuts_config jsonb,
  notification_prefs jsonb,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT user_preferences_pkey PRIMARY KEY (id),
  CONSTRAINT user_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.user_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  access_token text,
  refresh_token text,
  device_info jsonb,
  expires_at timestamp without time zone,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT user_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  google_id character varying,
  email character varying NOT NULL UNIQUE,
  full_name character varying,
  role character varying DEFAULT 'user'::character varying CHECK (role::text = ANY (ARRAY['user'::character varying, 'staff'::character varying, 'admin'::character varying]::text[])),
  credit_balance integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT users_pkey PRIMARY KEY (id)
);