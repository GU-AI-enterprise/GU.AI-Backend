-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.activity_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  actor_role character varying CHECK (actor_role::text = ANY (ARRAY['customer'::character varying, 'staff'::character varying, 'admin'::character varying, 'system'::character varying]::text[])),
  action character varying NOT NULL,
  target_type character varying CHECK (target_type::text = ANY (ARRAY['user'::character varying, 'asset'::character varying, 'ai_job'::character varying, 'transaction'::character varying, 'collection'::character varying, 'support_ticket'::character varying]::text[])),
  target_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address inet,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT activity_logs_pkey PRIMARY KEY (id),
  CONSTRAINT activity_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.ai_job_assets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  role character varying NOT NULL CHECK (role::text = ANY (ARRAY['input'::character varying, 'output'::character varying, 'product'::character varying, 'model'::character varying, 'background'::character varying, 'reference'::character varying, 'mask'::character varying]::text[])),
  sort_order integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ai_job_assets_pkey PRIMARY KEY (id),
  CONSTRAINT ai_job_assets_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.ai_jobs(id),
  CONSTRAINT ai_job_assets_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id)
);
CREATE TABLE public.ai_job_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  status character varying NOT NULL,
  message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ai_job_logs_pkey PRIMARY KEY (id),
  CONSTRAINT ai_job_logs_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.ai_jobs(id)
);
CREATE TABLE public.ai_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type character varying NOT NULL CHECK (type::text = ANY (ARRAY['try_on'::character varying, 'generate'::character varying, 'edit'::character varying, 'remove_bg'::character varying, 'upscale'::character varying]::text[])),
  status character varying NOT NULL DEFAULT 'queued'::character varying CHECK (status::text = ANY (ARRAY['queued'::character varying, 'processing'::character varying, 'completed'::character varying, 'failed'::character varying, 'cancelled'::character varying]::text[])),
  prompt text,
  negative_prompt text,
  provider character varying NOT NULL CHECK (provider::text = ANY (ARRAY['nano_banana'::character varying, 'remove_bg'::character varying]::text[])),
  provider_job_id character varying,
  progress integer NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  queue_position integer NOT NULL DEFAULT 0 CHECK (queue_position >= 0),
  credit_cost integer NOT NULL DEFAULT 0 CHECK (credit_cost >= 0),
  input_params jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ai_jobs_pkey PRIMARY KEY (id),
  CONSTRAINT ai_jobs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.assets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type character varying NOT NULL CHECK (type::text = ANY (ARRAY['image'::character varying, 'video'::character varying, 'file'::character varying]::text[])),
  category character varying NOT NULL CHECK (category::text = ANY (ARRAY['product'::character varying, 'model'::character varying, 'background'::character varying, 'output'::character varying, 'reference'::character varying]::text[])),
  url text NOT NULL,
  thumbnail_url text,
  file_name character varying,
  mime_type character varying,
  file_size bigint CHECK (file_size IS NULL OR file_size >= 0),
  width integer CHECK (width IS NULL OR width > 0),
  height integer CHECK (height IS NULL OR height > 0),
  storage_provider character varying DEFAULT 'supabase'::character varying,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT assets_pkey PRIMARY KEY (id),
  CONSTRAINT assets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.background_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name character varying NOT NULL,
  category character varying,
  thumbnail_asset_id uuid,
  is_premium boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT background_templates_pkey PRIMARY KEY (id),
  CONSTRAINT background_templates_thumbnail_asset_id_fkey FOREIGN KEY (thumbnail_asset_id) REFERENCES public.assets(id)
);
CREATE TABLE public.collection_assets (
  collection_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  added_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT collection_assets_pkey PRIMARY KEY (collection_id, asset_id),
  CONSTRAINT collection_assets_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.collections(id),
  CONSTRAINT collection_assets_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id)
);
CREATE TABLE public.collections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name character varying NOT NULL,
  description text,
  cover_asset_id uuid,
  visibility character varying NOT NULL DEFAULT 'private'::character varying CHECK (visibility::text = ANY (ARRAY['private'::character varying, 'public'::character varying]::text[])),
  asset_count integer NOT NULL DEFAULT 0 CHECK (asset_count >= 0),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT collections_pkey PRIMARY KEY (id),
  CONSTRAINT collections_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT collections_cover_asset_id_fkey FOREIGN KEY (cover_asset_id) REFERENCES public.assets(id)
);
CREATE TABLE public.credit_ledger (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  transaction_id uuid,
  ai_job_id uuid,
  type character varying NOT NULL CHECK (type::text = ANY (ARRAY['purchase'::character varying, 'spend'::character varying, 'refund'::character varying, 'bonus'::character varying, 'admin_adjust'::character varying]::text[])),
  amount integer NOT NULL,
  balance_after integer NOT NULL CHECK (balance_after >= 0),
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT credit_ledger_pkey PRIMARY KEY (id),
  CONSTRAINT credit_ledger_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT credit_ledger_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id),
  CONSTRAINT credit_ledger_ai_job_id_fkey FOREIGN KEY (ai_job_id) REFERENCES public.ai_jobs(id)
);
CREATE TABLE public.credit_packages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name character varying NOT NULL,
  price numeric NOT NULL CHECK (price >= 0::numeric),
  credit_amount integer NOT NULL CHECK (credit_amount > 0),
  bonus_credit integer NOT NULL DEFAULT 0 CHECK (bonus_credit >= 0),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT credit_packages_pkey PRIMARY KEY (id)
);
CREATE TABLE public.model_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name character varying NOT NULL,
  gender character varying,
  body_type character varying,
  pose character varying,
  thumbnail_asset_id uuid,
  is_premium boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT model_templates_pkey PRIMARY KEY (id),
  CONSTRAINT model_templates_thumbnail_asset_id_fkey FOREIGN KEY (thumbnail_asset_id) REFERENCES public.assets(id)
);
CREATE TABLE public.notification_deliveries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL,
  channel character varying NOT NULL CHECK (channel::text = ANY (ARRAY['in_app'::character varying, 'email'::character varying, 'push'::character varying]::text[])),
  status character varying NOT NULL DEFAULT 'pending'::character varying CHECK (status::text = ANY (ARRAY['pending'::character varying, 'sent'::character varying, 'failed'::character varying]::text[])),
  error_message text,
  sent_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT notification_deliveries_pkey PRIMARY KEY (id),
  CONSTRAINT notification_deliveries_notification_id_fkey FOREIGN KEY (notification_id) REFERENCES public.notifications(id)
);
CREATE TABLE public.notification_preferences (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type character varying NOT NULL,
  in_app_enabled boolean NOT NULL DEFAULT true,
  email_enabled boolean NOT NULL DEFAULT false,
  push_enabled boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT notification_preferences_pkey PRIMARY KEY (id),
  CONSTRAINT notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.notification_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  type character varying NOT NULL UNIQUE,
  title_template text NOT NULL,
  content_template text NOT NULL,
  default_channel character varying NOT NULL DEFAULT 'in_app'::character varying CHECK (default_channel::text = ANY (ARRAY['in_app'::character varying, 'email'::character varying]::text[])),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT notification_templates_pkey PRIMARY KEY (id)
);
CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  template_id uuid,
  type character varying NOT NULL CHECK (type::text = ANY (ARRAY['payment'::character varying, 'ai_job'::character varying, 'support'::character varying, 'system'::character varying, 'security'::character varying, 'promotion'::character varying]::text[])),
  title character varying,
  content text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status character varying NOT NULL DEFAULT 'unread'::character varying CHECK (status::text = ANY (ARRAY['unread'::character varying, 'read'::character varying, 'archived'::character varying]::text[])),
  priority character varying NOT NULL DEFAULT 'normal'::character varying CHECK (priority::text = ANY (ARRAY['low'::character varying, 'normal'::character varying, 'high'::character varying, 'urgent'::character varying]::text[])),
  action_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  read_at timestamp with time zone,
  CONSTRAINT notifications_pkey PRIMARY KEY (id),
  CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT notifications_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.notification_templates(id)
);
CREATE TABLE public.pose_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name character varying NOT NULL,
  category character varying,
  thumbnail_asset_id uuid,
  prompt_hint text,
  is_premium boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT pose_templates_pkey PRIMARY KEY (id),
  CONSTRAINT pose_templates_thumbnail_asset_id_fkey FOREIGN KEY (thumbnail_asset_id) REFERENCES public.assets(id)
);
CREATE TABLE public.support_attachments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT support_attachments_pkey PRIMARY KEY (id),
  CONSTRAINT support_attachments_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.support_messages(id),
  CONSTRAINT support_attachments_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id)
);
CREATE TABLE public.support_conversations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  assigned_staff_id uuid,
  status character varying NOT NULL DEFAULT 'open'::character varying CHECK (status::text = ANY (ARRAY['open'::character varying, 'pending'::character varying, 'resolved'::character varying, 'closed'::character varying]::text[])),
  source character varying NOT NULL DEFAULT 'web'::character varying CHECK (source::text = ANY (ARRAY['web'::character varying, 'email'::character varying, 'zalo'::character varying, 'facebook'::character varying]::text[])),
  last_message_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT support_conversations_pkey PRIMARY KEY (id),
  CONSTRAINT support_conversations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT support_conversations_assigned_staff_id_fkey FOREIGN KEY (assigned_staff_id) REFERENCES public.users(id)
);
CREATE TABLE public.support_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  sender_id uuid,
  sender_type character varying NOT NULL CHECK (sender_type::text = ANY (ARRAY['customer'::character varying, 'staff'::character varying, 'admin'::character varying, 'bot'::character varying, 'system'::character varying]::text[])),
  content text NOT NULL,
  message_type character varying NOT NULL DEFAULT 'text'::character varying CHECK (message_type::text = ANY (ARRAY['text'::character varying, 'image'::character varying, 'file'::character varying, 'system'::character varying]::text[])),
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT support_messages_pkey PRIMARY KEY (id),
  CONSTRAINT support_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.support_conversations(id),
  CONSTRAINT support_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.users(id)
);
CREATE TABLE public.support_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL,
  staff_id uuid,
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT support_notes_pkey PRIMARY KEY (id),
  CONSTRAINT support_notes_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.support_tickets(id),
  CONSTRAINT support_notes_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.users(id)
);
CREATE TABLE public.support_tickets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  user_id uuid NOT NULL,
  title character varying NOT NULL,
  category character varying NOT NULL CHECK (category::text = ANY (ARRAY['payment'::character varying, 'account'::character varying, 'ai_generation'::character varying, 'bug'::character varying, 'refund'::character varying]::text[])),
  status character varying NOT NULL DEFAULT 'new'::character varying CHECK (status::text = ANY (ARRAY['new'::character varying, 'in_progress'::character varying, 'waiting_user'::character varying, 'resolved'::character varying, 'closed'::character varying]::text[])),
  priority character varying NOT NULL DEFAULT 'low'::character varying CHECK (priority::text = ANY (ARRAY['low'::character varying, 'medium'::character varying, 'high'::character varying, 'urgent'::character varying]::text[])),
  assigned_staff_id uuid,
  resolved_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT support_tickets_pkey PRIMARY KEY (id),
  CONSTRAINT support_tickets_assigned_staff_id_fkey FOREIGN KEY (assigned_staff_id) REFERENCES public.users(id),
  CONSTRAINT support_tickets_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.support_conversations(id),
  CONSTRAINT support_tickets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.system_settings (
  key character varying NOT NULL,
  value text,
  value_type character varying CHECK (value_type::text = ANY (ARRAY['string'::character varying, 'int'::character varying, 'bool'::character varying, 'json'::character varying]::text[])),
  description text,
  updated_by uuid,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT system_settings_pkey PRIMARY KEY (key),
  CONSTRAINT system_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id)
);
CREATE TABLE public.transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  package_id uuid,
  provider character varying NOT NULL CHECK (provider::text = ANY (ARRAY['payos'::character varying, 'vnpay'::character varying, 'momo'::character varying, 'bank'::character varying]::text[])),
  amount numeric NOT NULL CHECK (amount >= 0::numeric),
  status character varying NOT NULL DEFAULT 'pending'::character varying CHECK (status::text = ANY (ARRAY['pending'::character varying, 'success'::character varying, 'failed'::character varying, 'cancelled'::character varying, 'refunded'::character varying]::text[])),
  payment_url text,
  provider_transaction_id character varying,
  paid_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT transactions_pkey PRIMARY KEY (id),
  CONSTRAINT transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT transactions_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.credit_packages(id)
);
CREATE TABLE public.user_unlocked_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  template_type character varying NOT NULL CHECK (template_type::text = ANY (ARRAY['model'::character varying, 'background'::character varying, 'pose'::character varying]::text[])),
  template_id uuid NOT NULL,
  unlocked_by character varying NOT NULL CHECK (unlocked_by::text = ANY (ARRAY['plan'::character varying, 'purchase'::character varying, 'admin'::character varying]::text[])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_unlocked_templates_pkey PRIMARY KEY (id),
  CONSTRAINT user_unlocked_templates_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email USER-DEFINED NOT NULL UNIQUE,
  name character varying,
  avatar_url text,
  provider character varying,
  role character varying NOT NULL DEFAULT 'customer'::character varying CHECK (role::text = ANY (ARRAY['customer'::character varying, 'staff'::character varying, 'admin'::character varying]::text[])),
  status character varying NOT NULL DEFAULT 'active'::character varying CHECK (status::text = ANY (ARRAY['active'::character varying, 'banned'::character varying]::text[])),
  current_credit integer NOT NULL DEFAULT 0 CHECK (current_credit >= 0),
  plan_type character varying NOT NULL DEFAULT 'free'::character varying CHECK (plan_type::text = ANY (ARRAY['free'::character varying, 'pro'::character varying, 'business'::character varying]::text[])),
  last_login_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT users_pkey PRIMARY KEY (id)
);