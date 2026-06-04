import { Request, Response } from 'express';
import { CreditService } from '../services/credit.service';
import { StorageService } from '../services/storage.service';
import { SocketService } from '../services/socket.service';
import { AdminEventService } from '../services/adminEvent.service';
import { PayOSService } from '../services/payos.service';
import { supabaseAdmin } from '../config/supabase';
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



  public async payos(req: Request, res: Response): Promise<void> {
    // Acknowledge immediately so PayOS doesn't retry on slow processing
    res.status(200).json({ success: true });

    const body = req.body as { data?: Record<string, unknown>; signature?: string; success?: boolean };

    if (!PayOSService.verifyWebhookSignature(body)) {
      console.warn('[WebhookController] PayOS webhook: invalid signature');
      return;
    }

    const { data } = body;
    if (!data || !body.success) return;

    const orderCode = String(data.orderCode);

    try {
      const { data: tx, error: txErr } = await supabaseAdmin!
        .from('transactions')
        .select('id, status, user_id, package_id, amount')
        .eq('provider_transaction_id', orderCode)
        .single();

      if (txErr || !tx) {
        console.warn(`[WebhookController] PayOS: no transaction for orderCode=${orderCode}`);
        return;
      }

      // Atomic status claim — only one of webhook/processPayment wins this UPDATE.
      // If 0 rows returned, another process already claimed it → stop here.
      const { data: claimed } = await supabaseAdmin!
        .from('transactions')
        .update({ status: 'success', paid_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', tx.id)
        .eq('status', 'pending')   // guard: only update if still pending
        .select('id');

      if (!claimed || claimed.length === 0) {
        console.log(`[WebhookController] PayOS: order=${orderCode} already processed — skipping`);
        return;
      }

      // Get package credit info
      const { data: pkg } = await supabaseAdmin!
        .from('credit_packages')
        .select('name, credit_amount, bonus_credit')
        .eq('id', tx.package_id)
        .single();

      const totalCredits = (pkg?.credit_amount ?? 0) + (pkg?.bonus_credit ?? 0);
      const packageName = pkg?.name ?? 'Credit Package';

      // Read current balance to compute balance_after
      const { data: user } = await supabaseAdmin!
        .from('users')
        .select('current_credit')
        .eq('id', tx.user_id)
        .single();

      const balanceAfter = (user?.current_credit ?? 0) + totalCredits;

      // Insert into credit_ledger with type 'purchase' — trigger updates users.current_credit
      await supabaseAdmin!
        .from('credit_ledger')
        .insert({
          user_id: tx.user_id,
          transaction_id: tx.id,
          type: 'purchase',
          amount: totalCredits,
          balance_after: balanceAfter,
          description: `Mua gói ${packageName}`,
        });

      // Notify user via socket
      SocketService.sendNotification({
        userId: tx.user_id,
        type: 'success',
        title: 'Thanh toán thành công',
        message: `Bạn đã nhận được ${totalCredits} credits từ gói ${packageName}`,
        data: { transactionId: tx.id, credits: totalCredits, newBalance: balanceAfter },
      });

      AdminEventService.emit({
        type: 'user_action',
        message: `Thanh toán thành công: ${packageName} (+${totalCredits} credits)`,
        userId: tx.user_id,
        metadata: { transactionId: tx.id, amount: tx.amount, credits: totalCredits },
      });

      console.log(`[WebhookController] PayOS: user=${tx.user_id} +${totalCredits} credits (order=${orderCode})`);
    } catch (err: any) {
      console.error('[WebhookController] PayOS processing error:', err.message);
    }
  }
}

export const webhookController = new WebhookController();
