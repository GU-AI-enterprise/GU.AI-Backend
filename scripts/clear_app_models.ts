import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  console.log('Đang xoá toàn bộ dữ liệu trong bảng app_models...');
  // Xoá tất cả (phải dùng filter .gte hoặc .neq để xoá toàn bộ)
  const { data, error } = await supabase
    .from('app_models')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');
    
  if (error) {
    console.error('Lỗi khi xoá dữ liệu:', error.message);
  } else {
    console.log('Đã xoá thành công dữ liệu cũ trong bảng app_models!');
  }
}

run();
