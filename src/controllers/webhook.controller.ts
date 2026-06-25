import { Request, Response } from 'express';
import { CreditService } from '../services/credit.service';
import { StorageService } from '../services/storage.service';
import { SocketService } from '../services/socket.service';
import { AdminEventService } from '../services/adminEvent.service';
import { PayOSService } from '../services/payos.service';
import { NotificationService } from '../services/notification.service';
import { EmailService } from '../services/email.service';
import { NotificationType, NotificationPriority } from '../constants/notification';
import { supabaseAdmin } from '../config/supabase';
import { AIJobStatus } from '../constants/ai';
import { AssetCategory, AssetRole, AssetType } from '../constants/asset';
import { computePlanRenewal } from '../utils/planExpiry.util';

export interface PendingWebhookJob {
  userId: string;
  jobId: string;
  cost: number;
  description: string;
  filePrefix: string;
  isVideo?: boolean;
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
    // Verify shared secret to reject forged webhook calls
    const secret = process.env.FASHN_WEBHOOK_SECRET;
    if (secret && req.query.token !== secret) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

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
      const isVideo = context.isVideo ?? false;

      const ext  = isVideo ? 'mp4'       : 'png';
      const mime = isVideo ? 'video/mp4' : 'image/png';
      const aType = isVideo ? AssetType.VIDEO : AssetType.IMAGE;

      const fileName = `${filePrefix}_${Date.now()}.${ext}`;

      const dlRes = await fetch(outputUrl);
      if (!dlRes.ok) throw new Error('Không tải được output từ Fashn (webhook).');
      const buffer = Buffer.from(await dlRes.arrayBuffer());
      const publicUrl = await StorageService.uploadBuffer(buffer, fileName, mime, userId, isVideo ? 'videos' : 'assets');

      const asset = await CreditService.saveOutputAsset({
        userId,
        url: publicUrl,
        category: AssetCategory.OUTPUT,
        mimeType: mime,
        fileName,
        assetType: aType,
      });

      await CreditService.linkAssetToJob(jobId, asset.id, AssetRole.OUTPUT);
      await CreditService.deductCredit(userId, cost, description, jobId);
      await CreditService.updateAIJob(jobId, AIJobStatus.COMPLETED);

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
        .select('name, credit_amount, bonus_credit, grants_plan_type')
        .eq('id', tx.package_id)
        .single();

      const totalCredits = (pkg?.credit_amount ?? 0) + (pkg?.bonus_credit ?? 0);
      const packageName = pkg?.name ?? 'Credit Package';

      // Nâng cấp/gia hạn plan_type + plan_expires_at nếu package có grants_plan_type (never downgrade)
      if (pkg?.grants_plan_type) {
        const { data: userRow } = await supabaseAdmin!.from('users').select('plan_type, plan_expires_at').eq('id', tx.user_id).single();
        const renewal = computePlanRenewal(userRow?.plan_type ?? null, userRow?.plan_expires_at ?? null, pkg.grants_plan_type);
        if (renewal) {
          const { error: planErr } = await supabaseAdmin!.from('users')
            .update({ plan_type: renewal.plan_type, plan_expires_at: renewal.plan_expires_at, updated_at: new Date().toISOString() })
            .eq('id', tx.user_id);
          if (planErr) console.error(`[WebhookController] Lỗi nâng cấp plan cho user=${tx.user_id}:`, planErr.message);
        }
      }

      // The DB trigger (trg_transactions_before_insert_update → create_ledger_for_success_transaction)
      // already inserted credit_ledger and incremented users.current_credit via apply_credit_ledger.
      // DO NOT insert credit_ledger manually — that would double the credit.
      const { data: updatedUser } = await supabaseAdmin!
        .from('users')
        .select('current_credit, email, name')
        .eq('id', tx.user_id)
        .single();
      const newBalance = updatedUser?.current_credit ?? 0;

      // Persist notification and push to user via socket
      const creditBreakdown = pkg?.bonus_credit
        ? `${pkg.credit_amount.toLocaleString()} credits + ${pkg.bonus_credit.toLocaleString()} bonus`
        : `${totalCredits.toLocaleString()} credits`;
      await NotificationService.create({
        userId: tx.user_id,
        type: NotificationType.PAYMENT,
        priority: NotificationPriority.HIGH,
        title: 'Nạp tiền thành công',
        content: `Gói ${packageName}: +${creditBreakdown}. Số dư mới: ${newBalance.toLocaleString()} credits.`,
        data: { transactionId: tx.id, credits: totalCredits, newBalance, packageName },
      });

      AdminEventService.emit({
        type: 'payment_updated',
        message: `Thanh toán thành công: ${packageName} (+${totalCredits} credits)`,
        userId: tx.user_id,
        metadata: {
          transactionId: tx.id,
          status: 'success',
          paid_at: new Date().toISOString(),
          amount: tx.amount,
          credits: totalCredits,
        },
      });

      // Send bill email — non-blocking
      if (updatedUser?.email) {
        EmailService.sendPaymentBillEmail({
          to: updatedUser.email,
          name: updatedUser.name || '',
          orderCode,
          packageName,
          amount: tx.amount ?? 0,
          creditAmount: pkg?.credit_amount ?? totalCredits,
          bonusCredit: pkg?.bonus_credit ?? 0,
          newBalance,
          paidAt: new Date().toISOString(),
        });
      }

      console.log(`[WebhookController] PayOS: user=${tx.user_id} +${totalCredits} credits (order=${orderCode})`);
    } catch (err: any) {
      console.error('[WebhookController] PayOS processing error:', err.message);
    }
  }
}

export const webhookController = new WebhookController();
