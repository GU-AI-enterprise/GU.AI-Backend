import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Thiếu SUPABASE_URL hoặc SUPABASE_ANON_KEY trong file .env');
}

// Khởi tạo Supabase Client
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Khởi tạo Supabase Client cho các tác vụ Admin (Bỏ qua RLS)
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const supabaseAdmin = supabaseServiceKey 
  ? createClient(supabaseUrl, supabaseServiceKey) 
  : null;
