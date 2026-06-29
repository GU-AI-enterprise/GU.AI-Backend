-- Migration: tặng 20 credit miễn phí cho user mới đăng ký lần đầu
-- Run in Supabase SQL Editor
--
-- Áp dụng cho mọi đường đăng ký (email/password và OAuth) vì handle_new_auth_user()
-- chạy trên trigger on_auth_user_created (AFTER INSERT ON auth.users) — fire đúng 1 lần
-- cho mỗi user mới, bất kể provider nào.
--
-- Ghi qua credit_ledger (type='bonus') thay vì set users.current_credit trực tiếp, để
-- có audit trail và tận dụng trg_credit_ledger_apply (đã tồn tại) tự cộng vào current_credit.
-- Guard NOT EXISTS để tránh cộng trùng nếu trigger vô tình fire lại trên cùng user_id.

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

  INSERT INTO public.credit_ledger (user_id, type, amount, balance_after, description)
  SELECT NEW.id, 'bonus', 20, 0, 'Quà tặng 20 credit cho thành viên mới'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.credit_ledger
    WHERE user_id = NEW.id AND description = 'Quà tặng 20 credit cho thành viên mới'
  );

  RETURN NEW;
END;
$function$;
