import cron from 'node-cron';
import { ImageService } from '../services/image.service';
import { supabaseAdmin } from '../config/supabase';

// Runs daily at 00:00 UTC
const CRON_SCHEDULE = '0 0 * * *';

async function cleanupOrphanedTopupPackages(): Promise<void> {
  if (!supabaseAdmin) return;

  // Only delete packages older than 24h that aren't linked to any pending transaction
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: stale } = await supabaseAdmin
    .from('credit_packages')
    .select('id')
    .eq('is_active', false)
    .lt('created_at', cutoff);

  if (!stale?.length) return;

  const staleIds = stale.map((p: { id: string }) => p.id);

  const { data: activeTxs } = await supabaseAdmin
    .from('transactions')
    .select('package_id')
    .in('package_id', staleIds)
    .eq('status', 'pending');

  const activeSet = new Set((activeTxs ?? []).map((t: { package_id: string }) => t.package_id));
  const deleteIds = staleIds.filter((id: string) => !activeSet.has(id));

  if (!deleteIds.length) return;

  const { count } = await supabaseAdmin
    .from('credit_packages')
    .delete({ count: 'exact' })
    .in('id', deleteIds);

  console.log(`[CleanupJob] Cleaned ${count ?? 0} orphaned topup packages.`);
}

export function startCleanupJob(): void {
  cron.schedule(CRON_SCHEDULE, async () => {
    console.log(`[CleanupJob] ${new Date().toISOString()} — Bắt đầu dọn Archive...`);
    try {
      const result = await ImageService.cleanupExpiredArchive();
      console.log(`[CleanupJob] Hoàn thành — đã xóa vĩnh viễn ${result.deletedCount} ảnh.`);
    } catch (err: any) {
      console.error(`[CleanupJob] Archive cleanup lỗi:`, err.message);
    }

    try {
      await cleanupOrphanedTopupPackages();
    } catch (err: any) {
      console.error(`[CleanupJob] Topup package cleanup lỗi:`, err.message);
    }
  }, { timezone: 'UTC' });

  console.log('[CleanupJob] Đã đăng ký — chạy mỗi ngày lúc 00:00 UTC.');
}

export async function runCleanupNow(): Promise<{ deletedCount: number }> {
  console.log('[CleanupJob] Trigger thủ công...');
  const result = await ImageService.cleanupExpiredArchive();
  console.log(`[CleanupJob] Thủ công — đã xóa ${result.deletedCount} ảnh.`);
  await cleanupOrphanedTopupPackages();
  return result;
}
