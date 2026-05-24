DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- USERS
CREATE TABLE public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar NOT NULL UNIQUE,
  name varchar,
  avatar_url text,
  provider varchar,
  role varchar NOT NULL DEFAULT 'user' CHECK (role IN ('user','staff','admin')),
  status varchar NOT NULL DEFAULT 'active' CHECK (status IN ('active','banned')),
  current_credit integer NOT NULL DEFAULT 0,
  plan_type varchar NOT NULL DEFAULT 'free' CHECK (plan_type IN ('free','pro','business')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- CORE
CREATE TABLE public.credit_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar NOT NULL,
  price numeric NOT NULL,
  credit_amount integer NOT NULL,
  bonus_credit integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type varchar NOT NULL CHECK (type IN ('image','video','file')),
  category varchar NOT NULL CHECK (category IN ('product','model','background','output','reference')),
  url text NOT NULL,
  thumbnail_url text,
  file_name varchar,
  mime_type varchar,
  file_size bigint,
  width integer,
  height integer,
  storage_provider varchar,
  metadata jsonb,
  is_public boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- TEMPLATES
CREATE TABLE public.model_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar NOT NULL,
  gender varchar,
  body_type varchar,
  pose varchar,
  thumbnail_asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  is_premium boolean DEFAULT false,
  is_active boolean DEFAULT true,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.background_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar NOT NULL,
  category varchar,
  thumbnail_asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  is_premium boolean DEFAULT false,
  is_active boolean DEFAULT true,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.pose_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar NOT NULL,
  category varchar,
  thumbnail_asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  prompt_hint text,
  is_premium boolean DEFAULT false,
  is_active boolean DEFAULT true,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

-- COLLECTIONS
CREATE TABLE public.collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name varchar NOT NULL,
  description text,
  cover_asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  visibility varchar DEFAULT 'private' CHECK (visibility IN ('private','public')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.collection_assets (
  collection_id uuid REFERENCES public.collections(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES public.assets(id) ON DELETE CASCADE,
  added_at timestamptz DEFAULT now(),
  PRIMARY KEY (collection_id, asset_id)
);

-- AI JOBS
CREATE TABLE public.ai_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type varchar NOT NULL CHECK (type IN ('try_on','generate','edit','remove_bg','upscale')),
  status varchar DEFAULT 'queued' CHECK (status IN ('queued','processing','completed','failed','cancelled')),
  prompt text,
  negative_prompt text,
  provider varchar NOT NULL CHECK (provider IN ('nano_banana','remove_bg')),
  provider_job_id varchar,
  progress integer DEFAULT 0,
  queue_position integer DEFAULT 0,
  credit_cost integer DEFAULT 0,
  input_params jsonb,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.ai_job_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.ai_jobs(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES public.assets(id) ON DELETE CASCADE,
  role varchar NOT NULL CHECK (role IN ('input','output','product','model','background','reference','mask')),
  sort_order integer DEFAULT 0,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.ai_job_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.ai_jobs(id) ON DELETE CASCADE,
  status varchar NOT NULL,
  message text,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

-- PAYMENTS
CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  package_id uuid REFERENCES public.credit_packages(id) ON DELETE SET NULL,
  provider varchar NOT NULL CHECK (provider IN ('payos')),
  amount numeric NOT NULL,
  status varchar DEFAULT 'pending' CHECK (status IN ('pending','success','failed','cancelled')),
  payment_url text,
  provider_transaction_id varchar,
  paid_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  ai_job_id uuid REFERENCES public.ai_jobs(id) ON DELETE SET NULL,
  type varchar NOT NULL CHECK (type IN ('purchase','spend','refund','bonus','admin_adjust')),
  amount integer NOT NULL,
  balance_after integer NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);

-- NOTIFICATIONS
CREATE TABLE public.notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type varchar NOT NULL,
  title_template text NOT NULL,
  content_template text NOT NULL,
  default_channel varchar CHECK (default_channel IN ('in_app','email')),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.notification_templates(id) ON DELETE SET NULL,
  type varchar NOT NULL CHECK (type IN ('payment','ai_job','support','system','security','promotion')),
  title varchar,
  content text,
  data jsonb,
  status varchar DEFAULT 'unread' CHECK (status IN ('unread','read','archived')),
  priority varchar DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  action_url text,
  created_at timestamptz DEFAULT now(),
  read_at timestamptz
);

CREATE TABLE public.notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid REFERENCES public.notifications(id) ON DELETE CASCADE,
  channel varchar CHECK (channel IN ('in_app','email','push')),
  status varchar CHECK (status IN ('pending','sent','failed')),
  error_message text,
  sent_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  type varchar NOT NULL,
  in_app_enabled boolean DEFAULT true,
  email_enabled boolean DEFAULT false,
  push_enabled boolean DEFAULT false
);

-- SUPPORT
CREATE TABLE public.support_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  assigned_staff_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  status varchar DEFAULT 'open' CHECK (status IN ('open','pending','resolved','closed')),
  source varchar CHECK (source IN ('web','email','zalo','facebook')),
  last_message_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES public.support_conversations(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  sender_type varchar CHECK (sender_type IN ('user','staff','admin','bot')),
  content text NOT NULL,
  message_type varchar CHECK (message_type IN ('text','image','file','system')),
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.support_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid REFERENCES public.support_messages(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES public.assets(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES public.support_conversations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  title varchar NOT NULL,
  category varchar CHECK (category IN ('payment','account','ai_generation','bug','refund')),
  status varchar DEFAULT 'new' CHECK (status IN ('new','in_progress','waiting_user','resolved','closed')),
  priority varchar DEFAULT 'low' CHECK (priority IN ('low','medium','high','urgent')),
  assigned_staff_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.support_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- EXTRA
CREATE TABLE public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  actor_role varchar CHECK (actor_role IN ('user','staff','admin','system')),
  action varchar NOT NULL,
  target_type varchar CHECK (target_type IN ('user','asset','ai_job','transaction')),
  target_id uuid,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.user_unlocked_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  template_type varchar CHECK (template_type IN ('model','background','pose')),
  template_id uuid NOT NULL,
  unlocked_by varchar CHECK (unlocked_by IN ('plan','purchase','admin')),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.system_settings (
  key varchar PRIMARY KEY,
  value text,
  value_type varchar CHECK (value_type IN ('string','int','bool','json')),
  description text,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at timestamptz DEFAULT now()
);