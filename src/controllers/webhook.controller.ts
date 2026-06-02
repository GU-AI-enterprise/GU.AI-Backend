import { Request, Response } from 'express';
import { CreditService } from '../services/credit.service';
import { StorageService } from '../services/storage.service';
import { SocketService } from '../services/socket.service';
import { AdminEventService } from '../services/adminEvent.service';
import { AIJobStatus } from '../constants/ai';
import { AssetCategory, AssetRole } from '../constants/asset';

export interface PendingWebhookJob {
  userId: string;
  jobId: string;
  cost: number;
  description: string;
  filePrefix: string;
}

/** predictionId (Fashn) → job context */
export const pendingWebhookJobs = new Map<string, PendingWebhookJob>();

interface FashnWebhookPayload {
  id: string;
  status: 'completed' | 'failed' | 'processing' | 'in_queue' | 'starting';
  output?: string[];
  error?: { name?: string; message?: string } | string | null;
}

export class WebhookController {
  public async fashn(req: Request, res: Response): Promise<void> {
    // Acknowledge immediately so Fashn doesn't retry
    res.status(200).json({ received: true });

    const payload = req.body as FashnWebhookPayload;
    if (!payload?.id) return;

    // Only handle terminal states
    if (payload.status !== 'completed' && payload.status !== 'failed') return;

    const context = pendingWebhookJobs.get(payload.id);
    if (!context) {
      console.warn(`[WebhookController] No pending job for prediction ${payload.id}`);
      return;
    }
    pendingWebhookJobs.delete(payload.id);

    const { userId, jobId, cost, description, filePrefix } = context;

    try {
      if (payload.status === 'failed' || !payload.output?.[0]) {
        const err = payload.error;
        const errMsg =
          err && typeof err === 'object'
            ? `${err.name ?? 'Error'}: ${err.message ?? JSON.stringify(err)}`
            : String(err ?? 'Fashn job failed');

        await CreditService.updateAIJob(jobId, AIJobStatus.FAILED, errMsg).catch(() => {});
        SocketService.emitAIJobUpdate(userId, { jobId, status: 'failed', error: errMsg });
        AdminEventService.emit({
          type: 'job_failed',
          message: `Thất bại: ${description}`,
          userId,
          metadata: { jobId, error: errMsg },
        });
        return;
      }

      const outputUrl = payload.output[0];
      const fileName = `${filePrefix}_${Date.now()}.png`;

      const dlRes = await fetch(outputUrl);
      if (!dlRes.ok) throw new Error('Không tải được ảnh output từ Fashn (webhook).');
      const buffer = Buffer.from(await dlRes.arrayBuffer());
      const publicUrl = await StorageService.uploadBuffer(buffer, fileName, 'image/png', userId);

      const asset = await CreditService.saveOutputAsset({
        userId,
        url: publicUrl,
        category: AssetCategory.OUTPUT,
        mimeType: 'image/png',
        fileName,
      });

      await CreditService.linkAssetToJob(jobId, asset.id, AssetRole.OUTPUT);
      await CreditService.updateAIJob(jobId, AIJobStatus.COMPLETED);
      await CreditService.deductCredit(userId, cost, description, jobId);

      SocketService.emitAIJobUpdate(userId, {
        jobId,
        status: 'completed',
        imageUrl: publicUrl,
        assetId: asset.id,
        creditsUsed: cost,
      });

      AdminEventService.emit({
        type: 'job_completed',
        message: `Hoàn thành: ${description}`,
        userId,
        metadata: { jobId, assetId: asset.id },
      });
    } catch (err: any) {
      console.error('[WebhookController] Error processing Fashn webhook:', err.message);
      await CreditService.updateAIJob(jobId, AIJobStatus.FAILED, err.message).catch(() => {});
      SocketService.emitAIJobUpdate(userId, { jobId, status: 'failed', error: err.message });
    }
  }
}

export const webhookController = new WebhookController();
