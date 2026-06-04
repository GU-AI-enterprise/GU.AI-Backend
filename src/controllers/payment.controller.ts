import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import { PayOSService } from '../services/payos.service';
import { supabaseAdmin } from '../config/supabase';
import { AdminEventService } from '../services/adminEvent.service';
import { UserRole } from '../types/role';

export class PaymentController {
  // GET /api/payments/packages
  async getPackages(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { data, error } = await supabaseAdmin!
        .from('credit_packages')
        .select('id, name, price, credit_amount, bonus_credit, sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      res.json({ success: true, data: data ?? [] });
    } catch (err: any) {
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
        .select('id, name, price, credit_amount, bonus_credit')
        .eq('id', packageId)
        .eq('is_active', true)
        .single();

      if (pkgErr || !pkg) {
        res.status(404).json({ success: false, error: 'Gói không tồn tại hoặc đã ngừng hoạt động' });
        return;
      }

      // Unique int32-safe order code based on current timestamp
      const orderCode = parseInt(Date.now().toString().slice(-9));

      const { data: tx, error: txErr } = await supabaseAdmin!
        .from('transactions')
        .insert({
          user_id: userId,
          package_id: packageId,
          provider: 'payos',
          amount: pkg.price,
          status: 'pending',
          provider_transaction_id: String(orderCode),
        })
        .select('id')
        .single();

      if (txErr || !tx) {
        console.error('[PaymentController] insert transaction:', txErr?.message);
        res.status(500).json({ success: false, error: 'Lỗi tạo giao dịch' });
        return;
      }

      const baseUrl = (process.env.CLIENT_URL ?? 'http://localhost:3000').split(',')[0].trim();
      const returnUrl = `${baseUrl}/payment/success?orderCode=${orderCode}`;
      const cancelUrl  = `${baseUrl}/payment/cancel?orderCode=${orderCode}`;
      // PayOS description ≤ 9 chars for non-linked accounts
      const description = `GUAI${String(orderCode).slice(-5)}`;

      const result = await PayOSService.createPaymentLink({
        orderCode,
        amount: Math.round(Number(pkg.price)),
        description,
        returnUrl,
        cancelUrl,
        items: [{ name: pkg.name, quantity: 1, price: Math.round(Number(pkg.price)) }],
      });

      if (result.code !== '00' || !result.data) {
        await supabaseAdmin!
          .from('transactions')
          .update({ status: 'failed', updated_at: new Date().toISOString() })
          .eq('id', tx.id);
        res.status(502).json({ success: false, error: result.desc ?? 'Lỗi tạo link thanh toán PayOS' });
        return;
      }

      const now = new Date().toISOString();
      await supabaseAdmin!
        .from('transactions')
        .update({ payment_url: result.data.checkoutUrl, updated_at: now })
        .eq('id', tx.id);

      // Fetch user info for admin real-time event
      const { data: userRow } = await supabaseAdmin!
        .from('users')
        .select('id, email, name, avatar_url, current_credit')
        .eq('id', userId)
        .single();

      AdminEventService.emit({
        type: 'payment_created',
        message: `Giao dịch mới: ${pkg.name} — ${Number(pkg.price).toLocaleString('vi-VN')}đ`,
        userId,
        metadata: {
          transaction: {
            id: tx.id,
            amount: pkg.price,
            status: 'pending',
            provider: 'payos',
            provider_transaction_id: String(orderCode),
            payment_url: result.data.checkoutUrl,
            paid_at: null,
            created_at: now,
            updated_at: now,
            user: userRow
              ? { id: userRow.id, email: userRow.email, name: userRow.name, avatar_url: userRow.avatar_url, current_credit: userRow.current_credit }
              : null,
            package: { name: pkg.name, credit_amount: pkg.credit_amount, bonus_credit: pkg.bonus_credit },
          },
        },
      });

      res.json({
        success: true,
        data: {
          checkoutUrl: result.data.checkoutUrl,
          qrCode: result.data.qrCode,
          paymentLinkId: result.data.paymentLinkId,
          orderCode,
          transactionId: tx.id,
        },
      });
    } catch (err: any) {
      console.error('[PaymentController] createPaymentLink:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // GET /api/payments/:orderCode
  async getPaymentInfo(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { orderCode } = req.params;
      const result = await PayOSService.getPaymentInfo(orderCode);

      if (result.code !== '00') {
        res.status(404).json({ success: false, error: result.desc });
        return;
      }

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
        .from('transactions')
        .select('id, status')
        .eq('provider_transaction_id', orderCode)
        .eq('user_id', userId)
        .single();

      if (error || !tx) {
        res.status(404).json({ success: false, error: 'Không tìm thấy giao dịch' });
        return;
      }
      if (tx.status !== 'pending') {
        res.status(400).json({ success: false, error: 'Giao dịch không thể hủy' });
        return;
      }

      await PayOSService.cancelPaymentLink(orderCode, reason);
      await supabaseAdmin!
        .from('transactions')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', tx.id);

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // POST /api/payments/:orderCode/process
  // Called from the return URL page — verifies payment with PayOS and credits the user.
  // Idempotent: safe to call multiple times. Works even if webhook didn't fire (e.g. localhost dev).
  async processPayment(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { orderCode } = req.params;

      // Fetch local transaction
      const { data: tx, error: txErr } = await supabaseAdmin!
        .from('transactions')
        .select('id, status, user_id, package_id, amount')
        .eq('provider_transaction_id', orderCode)
        .eq('user_id', userId)
        .single();

      if (txErr || !tx) {
        res.status(404).json({ success: false, error: 'Không tìm thấy giao dịch' });
        return;
      }

      // If already success, just return current balance (webhook may have processed it)
      if (tx.status === 'success') {
        const { data: user } = await supabaseAdmin!.from('users').select('current_credit').eq('id', userId).single();
        res.json({ success: true, alreadyProcessed: true, newBalance: user?.current_credit ?? 0 });
        return;
      }

      // Ask PayOS for authoritative status
      const payosResult = await PayOSService.getPaymentInfo(orderCode);
      const payosStatus = payosResult.data?.status;

      if (payosStatus !== 'PAID') {
        res.json({ success: false, payosStatus, error: 'Giao dịch chưa được thanh toán' });
        return;
      }

      // PAID — get package info
      const { data: pkg } = await supabaseAdmin!
        .from('credit_packages')
        .select('name, credit_amount, bonus_credit')
        .eq('id', tx.package_id)
        .single();

      const totalCredits = (pkg?.credit_amount ?? 0) + (pkg?.bonus_credit ?? 0);
      const packageName  = pkg?.name ?? 'Credit Package';

      // Atomic claim — prevents race with the webhook handler.
      // Only one of the two will get rows back; the loser returns alreadyProcessed.
      const { data: claimed } = await supabaseAdmin!
        .from('transactions')
        .update({ status: 'success', paid_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', tx.id)
        .eq('status', 'pending')   // guard: skip if webhook already claimed it
        .select('id');

      if (!claimed || claimed.length === 0) {
        // Webhook won the race — just return updated balance
        const { data: user } = await supabaseAdmin!.from('users').select('current_credit').eq('id', userId).single();
        res.json({ success: true, alreadyProcessed: true, newBalance: user?.current_credit ?? 0 });
        return;
      }

      // The DB trigger (trg_transactions_before_insert_update → create_ledger_for_success_transaction)
      // already inserted credit_ledger and incremented users.current_credit via apply_credit_ledger.
      // DO NOT insert credit_ledger manually — that would double the credit.
      const { data: updatedUser } = await supabaseAdmin!
        .from('users').select('current_credit').eq('id', userId).single();
      const newBalance = updatedUser?.current_credit ?? 0;

      AdminEventService.emit({
        type: 'payment_updated',
        message: `Thanh toán thành công: ${packageName} (+${totalCredits} credits)`,
        userId,
        metadata: {
          transactionId: tx.id,
          status: 'success',
          paid_at: new Date().toISOString(),
          amount: tx.amount,
          credits: totalCredits,
        },
      });

      console.log(`[PaymentController] processPayment: user=${userId} +${totalCredits} credits (order=${orderCode})`);
      res.json({ success: true, newBalance, credits: totalCredits });
    } catch (err: any) {
      console.error('[PaymentController] processPayment:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // POST /api/payments/confirm-webhook  (admin only)
  async confirmWebhook(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (req.user?.role !== UserRole.ADMIN) {
        res.status(403).json({ success: false, error: 'Admin only' });
        return;
      }

      const { webhookUrl } = req.body;
      if (!webhookUrl) {
        res.status(400).json({ success: false, error: 'webhookUrl là bắt buộc' });
        return;
      }

      const result = await PayOSService.confirmWebhookUrl(webhookUrl);
      res.json({ success: result.code === '00', data: result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

export const paymentController = new PaymentController();
