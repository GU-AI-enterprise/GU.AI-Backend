-- =============================================================================
-- GU.AI Database Functions
-- All trigger functions used in the public schema.
-- Run this before triggers.sql.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- set_updated_at
-- Generic helper: sets updated_at = now() on any BEFORE UPDATE trigger.
-- Used by: assets, background_templates, collections, credit_packages,
--          model_templates, notification_deliveries, notification_preferences,
--          notification_templates, pose_templates, support_conversations,
--          system_settings, users, transactions (via create_ledger…)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;


-- ---------------------------------------------------------------------------
-- handle_new_auth_user
-- Fires AFTER INSERT on auth.users.
-- Upserts a matching row in public.users so every Supabase Auth sign-up
-- automatically creates an application-level user record.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'auth'
AS $function$
BEGIN
  INSERT INTO public.users (id, email, name, avatar_url, provider)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_app_meta_data->>'provider'
  )
  ON CONFLICT (id) DO UPDATE SET
    email      = EXCLUDED.email,
    name       = COALESCE(public.users.name, EXCLUDED.name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, public.users.avatar_url),
    provider   = COALESCE(EXCLUDED.provider, public.users.provider),
    updated_at = now();

  -- Quà tặng 20 credit miễn phí cho user mới đăng ký lần đầu (mọi provider) — ghi qua
  -- credit_ledger (type='bonus') để có audit trail, trg_credit_ledger_apply tự cộng vào
  -- current_credit. Guard NOT EXISTS để tránh cộng trùng nếu trigger fire lại trên cùng user_id.
  INSERT INTO public.credit_ledger (user_id, type, amount, balance_after, description)
  SELECT NEW.id, 'bonus', 20, 0, 'Quà tặng 20 credit cho thành viên mới'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.credit_ledger
    WHERE user_id = NEW.id AND description = 'Quà tặng 20 credit cho thành viên mới'
  );

  RETURN NEW;
END;
$function$;


-- ---------------------------------------------------------------------------
-- handle_ai_job_status_change
-- Fires BEFORE UPDATE on ai_jobs.
-- Auto-sets started_at / completed_at / progress when status changes.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_ai_job_status_change()
  RETURNS trigger
  LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'processing' AND NEW.started_at IS NULL THEN
      NEW.started_at = now();
    END IF;

    IF NEW.status IN ('completed', 'failed', 'cancelled') AND NEW.completed_at IS NULL THEN
      NEW.completed_at = now();
    END IF;

    IF NEW.status = 'completed' THEN
      NEW.progress = 100;
    END IF;
  END IF;

  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;


-- ---------------------------------------------------------------------------
-- log_ai_job_status
-- Fires AFTER INSERT OR UPDATE on ai_jobs.
-- Appends a row to ai_job_logs on creation and on every status transition.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_ai_job_status()
  RETURNS trigger
  LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.ai_job_logs (job_id, status, message)
    VALUES (NEW.id, NEW.status, 'Job created');
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.ai_job_logs (job_id, status, message, metadata)
    VALUES (
      NEW.id,
      NEW.status,
      COALESCE(NEW.error_message, 'Status changed from ' || OLD.status || ' to ' || NEW.status),
      jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$function$;


-- ---------------------------------------------------------------------------
-- sync_collection_asset_count
-- Fires AFTER INSERT OR DELETE on collection_assets.
-- Keeps collections.asset_count in sync without a full COUNT(*).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_collection_asset_count()
  RETURNS trigger
  LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.collections
    SET asset_count = asset_count + 1, updated_at = now()
    WHERE id = NEW.collection_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.collections
    SET asset_count = GREATEST(asset_count - 1, 0), updated_at = now()
    WHERE id = OLD.collection_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;


-- ---------------------------------------------------------------------------
-- create_ledger_for_success_transaction   ← CRITICAL for payment credits
-- Fires BEFORE INSERT OR UPDATE on transactions.
-- When status transitions to 'success', inserts one row into credit_ledger
-- so that apply_credit_ledger (below) can increment users.current_credit.
--
-- ⚠️  DO NOT also insert into credit_ledger manually from application code.
--     Doing so causes apply_credit_ledger to fire twice → credits doubled.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_ledger_for_success_transaction()
  RETURNS trigger
  LANGUAGE plpgsql
AS $function$
DECLARE
  package_credits integer;
BEGIN
  IF NEW.status = 'success' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'success') THEN
    SELECT credit_amount + bonus_credit
    INTO package_credits
    FROM public.credit_packages
    WHERE id = NEW.package_id;

    IF package_credits IS NOT NULL THEN
      INSERT INTO public.credit_ledger (user_id, transaction_id, type, amount, balance_after, description)
      VALUES (NEW.user_id, NEW.id, 'purchase', package_credits, 0, 'Credit package purchase');
    END IF;

    IF NEW.paid_at IS NULL THEN
      NEW.paid_at = now();
    END IF;
  END IF;

  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;


-- ---------------------------------------------------------------------------
-- apply_credit_ledger   ← CRITICAL for payment credits
-- Fires BEFORE INSERT on credit_ledger.
-- Atomically adds the ledger amount to users.current_credit and stores the
-- resulting balance back in credit_ledger.balance_after.
-- Raises an exception if the user would go below 0 credits.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_credit_ledger()
  RETURNS trigger
  LANGUAGE plpgsql
AS $function$
DECLARE
  new_balance integer;
BEGIN
  UPDATE public.users
  SET current_credit = current_credit + NEW.amount,
      updated_at     = now()
  WHERE id = NEW.user_id
    AND current_credit + NEW.amount >= 0
  RETURNING current_credit INTO new_balance;

  IF new_balance IS NULL THEN
    RAISE EXCEPTION 'Insufficient credit or user not found for user_id %', NEW.user_id;
  END IF;

  NEW.balance_after = new_balance;
  RETURN NEW;
END;
$function$;


-- ---------------------------------------------------------------------------
-- mark_notification_read_at
-- Fires BEFORE UPDATE on notifications.
-- Sets read_at = now() the first time a notification is marked 'read'.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_notification_read_at()
  RETURNS trigger
  LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.status = 'read' AND OLD.status IS DISTINCT FROM 'read' AND NEW.read_at IS NULL THEN
    NEW.read_at = now();
  END IF;
  RETURN NEW;
END;
$function$;


-- ---------------------------------------------------------------------------
-- sync_support_conversation_on_message
-- Fires AFTER INSERT on support_messages.
-- Updates the parent conversation's last_message_at and reopens closed ones.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_support_conversation_on_message()
  RETURNS trigger
  LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE public.support_conversations
  SET last_message_at = NEW.created_at,
      updated_at      = now(),
      status          = CASE WHEN status = 'closed' THEN 'open' ELSE status END
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$function$;


-- ---------------------------------------------------------------------------
-- handle_support_ticket_status
-- Fires BEFORE UPDATE on support_tickets.
-- Sets resolved_at when a ticket first transitions to 'resolved' or 'closed'.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_support_ticket_status()
  RETURNS trigger
  LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.status IN ('resolved', 'closed')
     AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.resolved_at IS NULL THEN
    NEW.resolved_at = now();
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;
