import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function updatePricing() {
  try {
    console.log("Đang xóa dữ liệu gói cũ...");
    const { error: delError } = await supabase
      .from('credit_packages')
      .delete()
      .in('sort_order', [1, 2, 3]);

    if (delError) {
      console.error("Lỗi xóa gói cũ:", delError);
      return;
    }

    console.log("Đang thêm dữ liệu bảng giá mới...");
    const { error: insError } = await supabase
      .from('credit_packages')
      .insert([
        { name: 'Starter', price: 199000, credit_amount: 100, bonus_credit: 0, is_active: true, sort_order: 1, grants_plan_type: 'basic' },
        { name: 'Gói Cơ Bản', price: 349000, credit_amount: 200, bonus_credit: 0, is_active: true, sort_order: 2, grants_plan_type: 'pro' }
      ]);

    if (insError) {
      console.error("Lỗi khi thêm gói mới:", insError);
      return;
    }

    console.log("Cập nhật giá thành công! Dữ liệu đã đồng bộ trên Supabase.");
  } catch (err) {
    console.error("Lỗi không mong muốn:", err);
  }
}

updatePricing();
