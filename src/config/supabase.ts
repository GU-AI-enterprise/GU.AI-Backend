import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Thiếu SUPABASE_URL hoặc SUPABASE_ANON_KEY trong file .env');
}

const supabaseOptions = {
  realtime: { transport: ws },
};

// Khởi tạo Supabase Client
export const supabase = createClient(supabaseUrl, supabaseAnonKey, supabaseOptions);

// Khởi tạo Supabase Client cho các tác vụ Admin (Bỏ qua RLS)
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.warn('⚠️  SUPABASE_SERVICE_ROLE_KEY not configured in .env - Admin operations will fail');
}

export const supabaseAdmin = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, supabaseOptions)
  : null;
