import cron from 'node-cron';
import { ImageService } from '../services/image.service';

// Chạy mỗi ngày lúc 00:00 UTC
// Logic: xóa vĩnh viễn assets có status='archived' và archived_at quá 2 ngày
const CRON_SCHEDULE = '0 0 * * *';

export function startCleanupJob(): void {
  cron.schedule(CRON_SCHEDULE, async () => {
    console.log(`[CleanupJob] ${new Date().toISOString()} — Bắt đầu dọn Archive...`);
    try {
      const result = await ImageService.cleanupExpiredArchive();
      console.log(`[CleanupJob] Hoàn thành — đã xóa vĩnh viễn ${result.deletedCount} ảnh.`);
    } catch (err: any) {
      console.error(`[CleanupJob] Lỗi:`, err.message);
    }
  }, { timezone: 'UTC' });

  console.log('[CleanupJob] Đã đăng ký — chạy mỗi ngày lúc 00:00 UTC.');
}

export async function runCleanupNow(): Promise<{ deletedCount: number }> {
  console.log('[CleanupJob] Trigger thủ công...');
  const result = await ImageService.cleanupExpiredArchive();
  console.log(`[CleanupJob] Thủ công — đã xóa ${result.deletedCount} ảnh.`);
  return result;
}
