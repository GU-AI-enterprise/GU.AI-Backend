-- =============================================================================
-- GU.AI Database Triggers
-- All triggers in the public schema (plus the auth hook).
-- Run functions.sql first so the referenced functions already exist.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Auth
-- ---------------------------------------------------------------------------

-- Sync every new Supabase Auth user into public.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();


-- ---------------------------------------------------------------------------
-- ai_jobs
-- ---------------------------------------------------------------------------

-- Auto-set timestamps when job status changes (started_at, completed_at, progress)
CREATE TRIGGER trg_ai_jobs_status_before_update
  BEFORE UPDATE ON ai_jobs
  FOR EACH ROW EXECUTE FUNCTION handle_ai_job_status_change();

-- Append to ai_job_logs on creation
CREATE TRIGGER trg_ai_jobs_log_insert
  AFTER INSERT ON ai_jobs
  FOR EACH ROW EXECUTE FUNCTION log_ai_job_status();

-- Append to ai_job_logs on status transition
CREATE TRIGGER trg_ai_jobs_log_update
  AFTER UPDATE ON ai_jobs
  FOR EACH ROW EXECUTE FUNCTION log_ai_job_status();


-- ---------------------------------------------------------------------------
-- assets
-- ---------------------------------------------------------------------------

CREATE TRIGGER trg_assets_updated_at
  BEFORE UPDATE ON assets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ---------------------------------------------------------------------------
-- background_templates
-- ---------------------------------------------------------------------------

CREATE TRIGGER trg_background_templates_updated_at
  BEFORE UPDATE ON background_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ---------------------------------------------------------------------------
-- collections / collection_assets
-- ---------------------------------------------------------------------------

CREATE TRIGGER trg_collections_updated_at
  BEFORE UPDATE ON collections
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Keep collections.asset_count accurate
CREATE TRIGGER trg_collection_assets_count_insert
  AFTER INSERT ON collection_assets
  FOR EACH ROW EXECUTE FUNCTION sync_collection_asset_count();

CREATE TRIGGER trg_collection_assets_count_delete
  AFTER DELETE ON collection_assets
  FOR EACH ROW EXECUTE FUNCTION sync_collection_asset_count();


-- ---------------------------------------------------------------------------
-- credit_ledger  ← CRITICAL
-- Applies the ledger entry to users.current_credit atomically.
-- ⚠️  Never insert into credit_ledger manually from application code if the
--     DB trigger already handles it — that would fire this trigger twice.
-- ---------------------------------------------------------------------------
CREATE TRIGGER trg_credit_ledger_apply
  BEFORE INSERT ON credit_ledger
  FOR EACH ROW EXECUTE FUNCTION apply_credit_ledger();


-- ---------------------------------------------------------------------------
-- credit_packages
-- ---------------------------------------------------------------------------

CREATE TRIGGER trg_credit_packages_updated_at
  BEFORE UPDATE ON credit_packages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ---------------------------------------------------------------------------
-- model_templates
-- ---------------------------------------------------------------------------

CREATE TRIGGER trg_model_templates_updated_at
  BEFORE UPDATE ON model_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ---------------------------------------------------------------------------
-- notifications / notification_* tables
-- ---------------------------------------------------------------------------

-- Set read_at when notification status → 'read'
CREATE TRIGGER trg_notifications_read_at
  BEFORE UPDATE ON notifications
  FOR EACH ROW EXECUTE FUNCTION mark_notification_read_at();

CREATE TRIGGER trg_notification_deliveries_updated_at
  BEFORE UPDATE ON notification_deliveries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_notification_templates_updated_at
  BEFORE UPDATE ON notification_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ---------------------------------------------------------------------------
-- pose_templates
-- ---------------------------------------------------------------------------

CREATE TRIGGER trg_pose_templates_updated_at
  BEFORE UPDATE ON pose_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ---------------------------------------------------------------------------
-- support_conversations / support_messages / support_tickets
-- ---------------------------------------------------------------------------

CREATE TRIGGER trg_support_conversations_updated_at
  BEFORE UPDATE ON support_conversations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Reopen conversation and update last_message_at on new message
CREATE TRIGGER trg_support_messages_after_insert
  AFTER INSERT ON support_messages
  FOR EACH ROW EXECUTE FUNCTION sync_support_conversation_on_message();

-- Set resolved_at when ticket transitions to resolved/closed
CREATE TRIGGER trg_support_tickets_before_update
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION handle_support_ticket_status();


-- ---------------------------------------------------------------------------
-- system_settings
-- ---------------------------------------------------------------------------

CREATE TRIGGER trg_system_settings_updated_at
  BEFORE UPDATE ON system_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ---------------------------------------------------------------------------
-- transactions  ← CRITICAL
-- On INSERT or UPDATE, if status = 'success', auto-inserts into credit_ledger
-- which in turn fires trg_credit_ledger_apply → increments current_credit.
-- ⚠️  DO NOT also insert into credit_ledger from application code.
-- ---------------------------------------------------------------------------
CREATE TRIGGER trg_transactions_before_insert_update
  BEFORE INSERT OR UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION create_ledger_for_success_transaction();


-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
