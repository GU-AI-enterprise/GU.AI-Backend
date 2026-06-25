import cron from 'node-cron';
import { supabaseAdmin } from '../config/supabase';

// Chạy mỗi giờ — hạ user về free ngay khi gói hết hạn, không để trễ cả ngày như cleanup job.
const CRON_SCHEDULE = '0 * * * *';

export async function downgradeExpiredPlans(): Promise<{ downgradedCount: number }> {
  if (!supabaseAdmin) return { downgradedCount: 0 };

  const { data, error } = await supabaseAdmin
    .from('users')
    .update({ plan_type: 'free', plan_expires_at: null, updated_at: new Date().toISOString() })
    .neq('plan_type', 'free')
    .lt('plan_expires_at', new Date().toISOString())
    .select('id');

  if (error) {
    console.error('[PlanExpiryJob] Lỗi hạ cấp gói hết hạn:', error.message);
    return { downgradedCount: 0 };
  }

  return { downgradedCount: data?.length ?? 0 };
}

export function startPlanExpiryJob(): void {
  cron.schedule(CRON_SCHEDULE, async () => {
    const { downgradedCount } = await downgradeExpiredPlans();
    if (downgradedCount > 0) {
      console.log(`[PlanExpiryJob] Đã hạ cấp ${downgradedCount} user hết hạn gói về free.`);
    }
  }, { timezone: 'UTC' });

  console.log('[PlanExpiryJob] Đã đăng ký — chạy mỗi giờ.');
}
