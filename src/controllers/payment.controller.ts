import { randomInt } from 'crypto';
import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import { PayOSService } from '../services/payos.service';
import { NotificationService } from '../services/notification.service';
import { EmailService } from '../services/email.service';
import { NotificationType, NotificationPriority } from '../constants/notification';
import { supabaseAdmin } from '../config/supabase';
import { AdminEventService } from '../services/adminEvent.service';
import { UserRole } from '../types/role';
import { computePlanRenewal } from '../utils/planExpiry.util';

const TOPUP_BASE_RATE = 1580; // đ / credit (no plan)
const PLAN_DISCOUNTS: Record<string, number> = { free: 0, basic: 5, pro: 10 };

/** Nâng cấp/gia hạn plan_type + plan_expires_at — never downgrade (xem computePlanRenewal). */
async function upgradePlanType(userId: string, grantsPlanType: string | null): Promise<void> {
  if (!grantsPlanType) return;
  const { data: user } = await supabaseAdmin!.from('users').select('plan_type, plan_expires_at').eq('id', userId).single();
  const renewal = computePlanRenewal(user?.plan_type ?? null, user?.plan_expires_at ?? null, grantsPlanType);
  if (!renewal) return;
  const { error } = await supabaseAdmin!.from('users')
    .update({ plan_type: renewal.plan_type, plan_expires_at: renewal.plan_expires_at, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) console.error(`[PaymentController] upgradePlanType lỗi cho user=${userId}:`, error.message);
}

/** Shared PayOS link creation — returns controller response data */
async function buildPaymentLink(params: {
  userId: string;
  packageId: string | null;
  amount: number;
  pkgName: string;
  pkgCreditAmount: number;
  pkgBonusCredit: number;
}): Promise<{
  checkoutUrl: string; qrCode: string; paymentLinkId: string;
  orderCode: number; transactionId: string;
}> {
  const { userId, packageId, amount, pkgName, pkgCreditAmount, pkgBonusCredit } = params;
  const orderCode = randomInt(100_000_000, 999_999_999);

  const { data: tx, error: txErr } = await supabaseAdmin!
    .from('transactions')
    .insert({
      user_id: userId, package_id: packageId, provider: 'payos',
      amount, status: 'pending', provider_transaction_id: String(orderCode),
      credit_amount: pkgCreditAmount, bonus_credit: pkgBonusCredit,
    })
    .select('id').single();
  if (txErr || !tx) throw new Error('Lỗi tạo giao dịch');

  const baseUrl   = (process.env.CLIENT_URL ?? 'http://localhost:3000').split(',')[0].trim();
  const returnUrl = `${baseUrl}/payment/success?orderCode=${orderCode}`;
  const cancelUrl = `${baseUrl}/payment/cancel?orderCode=${orderCode}`;
  const description = `GUAI${String(orderCode).slice(-5)}`;

  const result = await PayOSService.createPaymentLink({
    orderCode, amount: Math.round(amount), description, returnUrl, cancelUrl,
    items: [{ name: pkgName, quantity: 1, price: Math.round(amount) }],
  });

  if (result.code !== '00' || !result.data) {
    await supabaseAdmin!.from('transactions')
      .update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', tx.id);
    throw new Error(result.desc ?? 'Lỗi tạo link thanh toán PayOS');
  }

  await supabaseAdmin!.from('transactions')
    .update({ payment_url: result.data.checkoutUrl, updated_at: new Date().toISOString() })
    .eq('id', tx.id);

  const { data: userRow } = await supabaseAdmin!.from('users')
    .select('id, email, name, avatar_url, current_credit').eq('id', userId).single();

  AdminEventService.emit({
    type: 'payment_created',
    message: `Giao dịch mới: ${pkgName} — ${amount.toLocaleString('vi-VN')}đ`,
    userId,
    metadata: {
      transaction: {
        id: tx.id, amount, status: 'pending', provider: 'payos',
        provider_transaction_id: String(orderCode),
        payment_url: result.data.checkoutUrl, paid_at: null,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        user: userRow ?? null,
        package: { name: pkgName, credit_amount: pkgCreditAmount, bonus_credit: pkgBonusCredit },
      },
    },
  });

  return {
    checkoutUrl: result.data.checkoutUrl,
    qrCode: result.data.qrCode,
    paymentLinkId: result.data.paymentLinkId,
    orderCode,
    transactionId: tx.id,
  };
}

export class PaymentController {

  // GET /api/payments/packages
  async getPackages(_req: AuthRequest, res: Response): Promise<void> {
    try {
      const { data, error } = await supabaseAdmin!
        .from('credit_packages')
        .select('id, name, price, credit_amount, bonus_credit, sort_order, grants_plan_type')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      res.json({ success: true, data: data ?? [] });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // GET /api/payments/topup-info
  // Returns user's current plan tier, discount %, and computed top-up rate
  async getTopupInfo(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { data: user } = await supabaseAdmin!
        .from('users').select('plan_type, plan_expires_at').eq('id', userId).single();
      const planType   = user?.plan_type ?? 'free';
      const discountPct = PLAN_DISCOUNTS[planType] ?? 0;
      const ratePerCredit = Math.round(TOPUP_BASE_RATE * (1 - discountPct / 100));

      res.json({
        success: true,
        data: {
          plan_type: planType,
          plan_expires_at: user?.plan_expires_at ?? null,
          discount_pct: discountPct,
          base_rate: TOPUP_BASE_RATE,
          rate: ratePerCredit,
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // POST /api/payments/topup  { creditAmount: number }
  // Creates a PayOS payment for a custom credit amount at the user's discounted rate.
  // Inserts a one-off credit_packages row (is_active=false) so the DB trigger can credit correctly.
  async createTopupPayment(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const creditAmount = parseInt(String(req.body.creditAmount ?? ''));

      if (!creditAmount || creditAmount < 10 || creditAmount > 5000) {
        res.status(400).json({ success: false, error: 'Số lượng credits phải từ 10 đến 5000.' });
        return;
      }

      // Determine discount from user's plan_type
      const { data: user } = await supabaseAdmin!
        .from('users').select('plan_type').eq('id', userId).single();
      const planType    = user?.plan_type ?? 'free';
      const discountPct = PLAN_DISCOUNTS[planType] ?? 0;
      const ratePerCredit = Math.round(TOPUP_BASE_RATE * (1 - discountPct / 100));
      const totalAmount   = ratePerCredit * creditAmount;

      const data = await buildPaymentLink({
        userId, packageId: null, amount: totalAmount,
        pkgName: `Top-up ${creditAmount} credits`,
        pkgCreditAmount: creditAmount, pkgBonusCredit: 0,
      });

      res.json({ success: true, data });
    } catch (err: any) {
      console.error('[PaymentController] createTopupPayment:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // POST /api/payments/create
  async createPaymentLink(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { packageId } = req.body;

      if (!packageId) {
        res.status(400).json({ success: false, error: 'packageId là bắt buộc' });
        return;
      }

      const { data: pkg, error: pkgErr } = await supabaseAdmin!
        .from('credit_packages')
        .select('id, name, price, credit_amount, bonus_credit, grants_plan_type')
        .eq('id', packageId).eq('is_active', true).single();

      if (pkgErr || !pkg) {
        res.status(404).json({ success: false, error: 'Gói không tồn tại hoặc đã ngừng hoạt động' });
        return;
      }

      const data = await buildPaymentLink({
        userId, packageId, amount: Math.round(Number(pkg.price)),
        pkgName: pkg.name, pkgCreditAmount: pkg.credit_amount, pkgBonusCredit: pkg.bonus_credit,
      });

      res.json({ success: true, data });
    } catch (err: any) {
      console.error('[PaymentController] createPaymentLink:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // GET /api/payments/:orderCode
  async getPaymentInfo(req: AuthRequest, res: Response): Promise<void> {
    try {
      const result = await PayOSService.getPaymentInfo(req.params.orderCode);
      if (result.code !== '00') { res.status(404).json({ success: false, error: result.desc }); return; }
      res.json({ success: true, data: result.data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // POST /api/payments/:orderCode/cancel
  async cancelPayment(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { orderCode } = req.params;
      const { reason } = req.body;

      const { data: tx, error } = await supabaseAdmin!
        .from('transactions').select('id, status')
        .eq('provider_transaction_id', orderCode).eq('user_id', userId).single();

      if (error || !tx) { res.status(404).json({ success: false, error: 'Không tìm thấy giao dịch' }); return; }
      if (tx.status !== 'pending') { res.status(400).json({ success: false, error: 'Giao dịch không thể hủy' }); return; }

      await PayOSService.cancelPaymentLink(orderCode, reason);
      await supabaseAdmin!.from('transactions')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', tx.id);

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // POST /api/payments/:orderCode/process
  async processPayment(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { orderCode } = req.params;

      const { data: tx, error: txErr } = await supabaseAdmin!
        .from('transactions').select('id, status, user_id, package_id, amount, credit_amount, bonus_credit')
        .eq('provider_transaction_id', orderCode).eq('user_id', userId).single();

      if (txErr || !tx) { res.status(404).json({ success: false, error: 'Không tìm thấy giao dịch' }); return; }

      if (tx.status === 'success') {
        const { data: user } = await supabaseAdmin!.from('users').select('current_credit').eq('id', userId).single();
        res.json({ success: true, alreadyProcessed: true, newBalance: user?.current_credit ?? 0 });
        return;
      }

      const payosResult = await PayOSService.getPaymentInfo(orderCode);
      if (payosResult.data?.status !== 'PAID') {
        res.json({ success: false, payosStatus: payosResult.data?.status, error: 'Giao dịch chưa được thanh toán' });
        return;
      }

      const totalCredits = (tx.credit_amount ?? 0) + (tx.bonus_credit ?? 0);

      let packageName    = `Top-up ${totalCredits} credits`;
      let grantsPlanType: string | null = null;
      if (tx.package_id) {
        const { data: pkg } = await supabaseAdmin!
          .from('credit_packages').select('name, grants_plan_type')
          .eq('id', tx.package_id).single();
        packageName    = pkg?.name ?? packageName;
        grantsPlanType = pkg?.grants_plan_type ?? null;
      }

      const { data: claimed } = await supabaseAdmin!.from('transactions')
        .update({ status: 'success', paid_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', tx.id).eq('status', 'pending').select('id');

      if (!claimed || claimed.length === 0) {
        const { data: user } = await supabaseAdmin!.from('users').select('current_credit').eq('id', userId).single();
        res.json({ success: true, alreadyProcessed: true, newBalance: user?.current_credit ?? 0 });
        return;
      }

      await upgradePlanType(userId, grantsPlanType);

      const { data: updatedUser } = await supabaseAdmin!.from('users').select('current_credit, email, name').eq('id', userId).single();
      const newBalance = updatedUser?.current_credit ?? 0;

      const creditBreakdown = tx.bonus_credit
        ? `${(tx.credit_amount ?? 0).toLocaleString()} + ${tx.bonus_credit.toLocaleString()} bonus`
        : `${totalCredits.toLocaleString()}`;
      await NotificationService.create({
        userId, type: NotificationType.PAYMENT, priority: NotificationPriority.HIGH,
        title: 'Nạp tiền thành công',
        content: `${packageName}: +${creditBreakdown} credits. Số dư: ${newBalance.toLocaleString()} credits.`,
        data: { transactionId: tx.id, credits: totalCredits, newBalance, packageName },
      });

      AdminEventService.emit({
        type: 'payment_updated',
        message: `Thanh toán thành công: ${packageName} (+${totalCredits} credits)`,
        userId,
        metadata: { transactionId: tx.id, status: 'success', paid_at: new Date().toISOString(), amount: tx.amount, credits: totalCredits },
      });

      // Send bill email — non-blocking (webhook may already have sent it, but atomic claim guarantees only one path runs)
      if (updatedUser?.email) {
        EmailService.sendPaymentBillEmail({
          to: updatedUser.email,
          name: updatedUser.name || '',
          orderCode: req.params.orderCode,
          packageName,
          amount: tx.amount ?? 0,
          creditAmount: tx.credit_amount ?? totalCredits,
          bonusCredit: tx.bonus_credit ?? 0,
          newBalance,
          paidAt: new Date().toISOString(),
        });
      }

      const { data: freshUser } = await supabaseAdmin!.from('users').select('plan_type, plan_expires_at').eq('id', userId).single();
      res.json({
        success: true, newBalance, credits: totalCredits,
        planType: freshUser?.plan_type ?? null,
        planExpiresAt: freshUser?.plan_expires_at ?? null,
      });
    } catch (err: any) {
      console.error('[PaymentController] processPayment:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // POST /api/payments/confirm-webhook  (admin only)
  async confirmWebhook(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (req.user?.role !== UserRole.ADMIN) { res.status(403).json({ success: false, error: 'Admin only' }); return; }
      const { webhookUrl } = req.body;
      if (!webhookUrl) { res.status(400).json({ success: false, error: 'webhookUrl là bắt buộc' }); return; }
      const result = await PayOSService.confirmWebhookUrl(webhookUrl);
      res.json({ success: result.code === '00', data: result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

export const paymentController = new PaymentController();
