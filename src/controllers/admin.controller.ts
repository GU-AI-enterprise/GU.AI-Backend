import { Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { AuthRequest } from '../middlewares/auth.middleware';
import { CreditService } from '../services/credit.service';
import { NotificationService } from '../services/notification.service';
import { NotificationType, NotificationPriority } from '../constants/notification';
import { sendSuccess, sendError } from '../utils/response';

export class AdminController {
  public async listUsers(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!supabaseAdmin) {
        res.status(500).json({ success: false, error: 'Service role not configured' });
        return;
      }

      const {
        search,
        role,
        status,
        page = '1',
        limit = '20',
      } = req.query as Record<string, string>;

      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
      const offset = (pageNum - 1) * limitNum;

      let query = supabaseAdmin
        .from('users')
        .select(
          'id, email, name, avatar_url, role, status, provider, plan_type, current_credit, created_at, updated_at',
          { count: 'exact' }
        );

      if (search?.trim()) {
        query = query.or(
          `email.ilike.%${search.trim()}%,name.ilike.%${search.trim()}%`
        );
      }
      if (role && role !== 'all') {
        query = query.eq('role', role);
      }
      if (status && status !== 'all') {
        query = query.eq('status', status);
      }

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limitNum - 1);

      if (error) {
        res.status(500).json({ success: false, error: error.message });
        return;
      }

      res.json({
        success: true,
        data: {
          users: data || [],
          total: count || 0,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil((count || 0) / limitNum),
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public async getUserById(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!supabaseAdmin) { sendError(res, 500, 'Service role not configured'); return; }
      const { id } = req.params;

      const { data: user, error } = await supabaseAdmin
        .from('users')
        .select('id, email, name, avatar_url, role, status, provider, plan_type, current_credit, created_at, updated_at, last_login_at')
        .eq('id', id)
        .single();

      if (error || !user) { sendError(res, 404, 'User not found'); return; }

      // Recent AI jobs
      const { data: jobs } = await supabaseAdmin
        .from('ai_jobs')
        .select('id, type, status, credit_cost, created_at, completed_at')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .limit(5);

      // Credit ledger summary
      const { data: ledger } = await supabaseAdmin
        .from('credit_ledger')
        .select('type, amount, created_at')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .limit(10);

      sendSuccess(res, { data: { user, recentJobs: jobs ?? [], recentLedger: ledger ?? [] } });
    } catch (err: any) {
      sendError(res, 500, err.message);
    }
  }

  public async getJobById(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!supabaseAdmin) { sendError(res, 500, 'Service role not configured'); return; }
      const { id } = req.params;

      const { data: job, error } = await supabaseAdmin
        .from('ai_jobs')
        .select('id, type, status, credit_cost, input_params, prompt, error_message, created_at, started_at, completed_at, provider, user_id')
        .eq('id', id)
        .single();

      if (error || !job) { sendError(res, 404, 'Job not found'); return; }

      // Output assets
      const { data: assets } = await supabaseAdmin
        .from('ai_job_assets')
        .select('role, asset:assets(id, url, thumbnail_url, type)')
        .eq('job_id', id)
        .eq('role', 'output');

      sendSuccess(res, { data: { job, outputAssets: assets ?? [] } });
    } catch (err: any) {
      sendError(res, 500, err.message);
    }
  }

  public async getStats(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!supabaseAdmin) {
        res.status(500).json({ success: false, error: 'Service role not configured' });
        return;
      }

      const [
        { count: total, error: e1 },
        { count: active },
        { count: locked },
        { count: customer },
        { count: staff },
        { count: admin },
      ] = await Promise.all([
        supabaseAdmin.from('users').select('*', { count: 'exact', head: true }),
        supabaseAdmin.from('users').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabaseAdmin.from('users').select('*', { count: 'exact', head: true }).eq('status', 'locked'),
        supabaseAdmin.from('users').select('*', { count: 'exact', head: true }).eq('role', 'customer'),
        supabaseAdmin.from('users').select('*', { count: 'exact', head: true }).eq('role', 'staff'),
        supabaseAdmin.from('users').select('*', { count: 'exact', head: true }).eq('role', 'admin'),
      ]);

      if (e1) {
        res.status(500).json({ success: false, error: e1.message });
        return;
      }

      res.json({
        success: true,
        data: {
          total:  total  ?? 0,
          active: active ?? 0,
          locked: locked ?? 0,
          byRole: {
            customer: customer ?? 0,
            staff:    staff    ?? 0,
            admin:    admin    ?? 0,
          },
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public async updateRole(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!supabaseAdmin) {
        res.status(500).json({ success: false, error: 'Service role not configured' });
        return;
      }

      const { id } = req.params;
      const { role } = req.body;

      if (!['customer', 'staff', 'admin'].includes(role)) {
        res.status(400).json({ success: false, error: 'Vai trò không hợp lệ.' });
        return;
      }
      if (id === req.user?.id) {
        res.status(400).json({ success: false, error: 'Không thể thay đổi vai trò của chính mình.' });
        return;
      }

      const { data, error } = await supabaseAdmin
        .from('users')
        .update({ role, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('id, email, name, role, status')
        .single();

      if (error) {
        res.status(500).json({ success: false, error: error.message });
        return;
      }
      if (!data) {
        res.status(404).json({ success: false, error: 'Không tìm thấy người dùng.' });
        return;
      }

      res.json({ success: true, data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public async updateStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!supabaseAdmin) {
        res.status(500).json({ success: false, error: 'Service role not configured' });
        return;
      }

      const { id } = req.params;
      const { status } = req.body;

      if (!['active', 'locked'].includes(status)) {
        res.status(400).json({ success: false, error: 'Trạng thái không hợp lệ.' });
        return;
      }
      if (id === req.user?.id) {
        res.status(400).json({ success: false, error: 'Không thể thay đổi trạng thái của chính mình.' });
        return;
      }

      const { data, error } = await supabaseAdmin
        .from('users')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('id, email, name, role, status')
        .single();

      if (error) {
        res.status(500).json({ success: false, error: error.message });
        return;
      }
      if (!data) {
        res.status(404).json({ success: false, error: 'Không tìm thấy người dùng.' });
        return;
      }

      res.json({ success: true, data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public async deleteUser(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!supabaseAdmin) {
        res.status(500).json({ success: false, error: 'Service role not configured' });
        return;
      }

      const { id } = req.params;

      if (id === req.user?.id) {
        res.status(400).json({ success: false, error: 'Không thể xóa tài khoản của chính mình.' });
        return;
      }

      const { error: dbError } = await supabaseAdmin.from('users').delete().eq('id', id);
      if (dbError) {
        res.status(500).json({ success: false, error: `Lỗi xóa dữ liệu: ${dbError.message}` });
        return;
      }

      const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(id);
      if (authError) {
        console.error('[AdminController.deleteUser] Auth delete failed:', authError.message);
      }

      res.json({ success: true, message: 'Đã xóa tài khoản thành công.' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public async awardCredits(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!supabaseAdmin) { sendError(res, 500, 'Service role not configured'); return; }

      const { id } = req.params;
      const { amount, reason } = req.body;
      console.log(`[AdminController.awardCredits] REQUEST userId=${id} amount=${amount} by=${req.user?.email} at=${new Date().toISOString()}`);

      if (!Number.isInteger(amount) || amount <= 0) {
        sendError(res, 400, 'amount phải là số nguyên dương.'); return;
      }
      const { data: user, error: userErr } = await supabaseAdmin
        .from('users').select('id, email, name').eq('id', id).maybeSingle();
      if (userErr || !user) { sendError(res, 404, 'User không tồn tại.'); return; }

      const staffLabel = req.user?.email ?? 'Admin';
      const reasonText = reason?.trim() || '';
      const description = reasonText
        ? `Cộng credit bởi ${staffLabel}: ${reasonText}`
        : `Cộng credit bởi ${staffLabel}`;

      const { newBalance } = await CreditService.addCredit(id, amount, description, 'admin_adjust');

      const notifContent = reasonText
        ? `Tài khoản của bạn vừa được cộng ${amount.toLocaleString()} credits. Lý do: ${reasonText}.`
        : `Tài khoản của bạn vừa được cộng ${amount.toLocaleString()} credits.`;

      await NotificationService.create({
        userId: id,
        type: NotificationType.PROMOTION,
        title: `Bạn nhận được ${amount.toLocaleString()} Credits!`,
        content: notifContent,
        priority: NotificationPriority.HIGH,
        data: { amount, ...(reasonText && { reason: reasonText }), newBalance, awardedBy: staffLabel },
      });

      sendSuccess(res, {
        message: `Đã cộng ${amount} credits cho user thành công.`,
        data: { userId: id, amount, newBalance },
      });
    } catch (err: any) {
      sendError(res, 500, err.message);
    }
  }

  public async getJobAnalytics(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!supabaseAdmin) { sendError(res, 500, 'Service role not configured'); return; }
      const range = (req.query.range as string) || '7d';
      const { currentStart, previousStart, groupFormat } = getDateRanges(range);

      const { data, error } = await supabaseAdmin
        .from('ai_jobs')
        .select('created_at, status')
        .gte('created_at', previousStart.toISOString());

      if (error) { sendError(res, 500, error.message); return; }

      const groupMap = buildGroupMap(groupFormat, range, { success: 0, failed: 0 });
      let currentTotal = 0;
      let previousTotal = 0;

      (data || []).forEach((job) => {
        const dateObj = new Date(job.created_at);
        if (dateObj >= currentStart) {
          currentTotal++;
          const key = getGroupKey(job.created_at, groupFormat);
          if (groupMap[key]) {
            if (job.status === 'completed') groupMap[key].success++;
            else if (job.status === 'failed') groupMap[key].failed++;
          }
        } else if (dateObj >= previousStart && dateObj < currentStart) {
          previousTotal++;
        }
      });

      sendSuccess(res, {
        data: {
          currentTotal,
          previousTotal,
          percentChange: calculateGrowth(currentTotal, previousTotal),
          chartData: Object.values(groupMap)
        }
      });
    } catch (err: any) {
      sendError(res, 500, err.message);
    }
  }

  public async getRevenueAnalytics(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!supabaseAdmin) { sendError(res, 500, 'Service role not configured'); return; }
      const range = (req.query.range as string) || '7d';
      const { currentStart, previousStart, groupFormat } = getDateRanges(range);

      const { data, error } = await supabaseAdmin
        .from('transactions')
        .select('created_at, amount')
        .eq('status', 'success')
        .gte('created_at', previousStart.toISOString());

      if (error) { sendError(res, 500, error.message); return; }

      const groupMap = buildGroupMap(groupFormat, range, { revenue: 0 });
      let currentTotal = 0;
      let previousTotal = 0;

      (data || []).forEach((tx) => {
        const dateObj = new Date(tx.created_at);
        const amount = Number(tx.amount) || 0;
        if (dateObj >= currentStart) {
          currentTotal += amount;
          const key = getGroupKey(tx.created_at, groupFormat);
          if (groupMap[key]) groupMap[key].revenue += amount;
        } else if (dateObj >= previousStart && dateObj < currentStart) {
          previousTotal += amount;
        }
      });

      sendSuccess(res, {
        data: {
          currentTotal,
          previousTotal,
          percentChange: calculateGrowth(currentTotal, previousTotal),
          chartData: Object.values(groupMap)
        }
      });
    } catch (err: any) {
      sendError(res, 500, err.message);
    }
  }

  public async getUserAnalytics(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!supabaseAdmin) { sendError(res, 500, 'Service role not configured'); return; }
      const range = (req.query.range as string) || '7d';
      const { currentStart, previousStart, groupFormat } = getDateRanges(range);

      const { data, error } = await supabaseAdmin
        .from('users')
        .select('created_at')
        .gte('created_at', previousStart.toISOString());

      if (error) { sendError(res, 500, error.message); return; }

      const groupMap = buildGroupMap(groupFormat, range, { users: 0 });
      let currentTotal = 0;
      let previousTotal = 0;

      (data || []).forEach((user) => {
        const dateObj = new Date(user.created_at);
        if (dateObj >= currentStart) {
          currentTotal++;
          const key = getGroupKey(user.created_at, groupFormat);
          if (groupMap[key]) groupMap[key].users++;
        } else if (dateObj >= previousStart && dateObj < currentStart) {
          previousTotal++;
        }
      });

      sendSuccess(res, {
        data: {
          currentTotal,
          previousTotal,
          percentChange: calculateGrowth(currentTotal, previousTotal),
          chartData: Object.values(groupMap)
        }
      });
    } catch (err: any) {
      sendError(res, 500, err.message);
    }
  }

  public async getCreditAnalytics(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!supabaseAdmin) { sendError(res, 500, 'Service role not configured'); return; }
      const range = (req.query.range as string) || '7d';
      const { currentStart, previousStart, groupFormat } = getDateRanges(range);

      const { data, error } = await supabaseAdmin
        .from('ai_jobs')
        .select('created_at, credit_cost')
        .eq('status', 'completed')
        .gte('created_at', previousStart.toISOString());

      if (error) { sendError(res, 500, error.message); return; }

      const groupMap = buildGroupMap(groupFormat, range, { credits: 0 });
      let currentTotal = 0;
      let previousTotal = 0;

      (data || []).forEach((job) => {
        const dateObj = new Date(job.created_at);
        const cost = Number(job.credit_cost) || 0;
        if (dateObj >= currentStart) {
          currentTotal += cost;
          const key = getGroupKey(job.created_at, groupFormat);
          if (groupMap[key]) groupMap[key].credits += cost;
        } else if (dateObj >= previousStart && dateObj < currentStart) {
          previousTotal += cost;
        }
      });

      sendSuccess(res, {
        data: {
          currentTotal,
          previousTotal,
          percentChange: calculateGrowth(currentTotal, previousTotal),
          chartData: Object.values(groupMap)
        }
      });
    } catch (err: any) {
      sendError(res, 500, err.message);
    }
  }
}

// ── Helpers cho Analytics ───────────────────────────────────────────────────

const getDateRanges = (range: string) => {
  const currentStart = new Date();
  const previousStart = new Date();
  let groupFormat = 'day';

  if (range === 'today') {
    currentStart.setHours(0, 0, 0, 0);
    previousStart.setDate(previousStart.getDate() - 1);
    previousStart.setHours(0, 0, 0, 0);
    groupFormat = 'hour';
  } else if (range === '30d') {
    currentStart.setDate(currentStart.getDate() - 30 + 1);
    currentStart.setHours(0, 0, 0, 0);
    previousStart.setDate(previousStart.getDate() - 60 + 1);
    previousStart.setHours(0, 0, 0, 0);
  } else if (range === '1y') {
    currentStart.setFullYear(currentStart.getFullYear() - 1);
    currentStart.setDate(1);
    currentStart.setHours(0, 0, 0, 0);
    previousStart.setFullYear(previousStart.getFullYear() - 2);
    previousStart.setDate(1);
    previousStart.setHours(0, 0, 0, 0);
    groupFormat = 'month';
  } else {
    // 7d default
    currentStart.setDate(currentStart.getDate() - 7 + 1);
    currentStart.setHours(0, 0, 0, 0);
    previousStart.setDate(previousStart.getDate() - 14 + 1);
    previousStart.setHours(0, 0, 0, 0);
  }
  return { currentStart, previousStart, groupFormat };
};

const calculateGrowth = (current: number, previous: number) => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Number((((current - previous) / previous) * 100).toFixed(1));
};

const buildGroupMap = (groupFormat: string, range: string, defaultProps: Record<string, number>) => {
  const groupMap: Record<string, any> = {};
  if (groupFormat === 'hour') {
    for (let i = 0; i < 24; i++) {
      const dStr = i.toString().padStart(2, '0') + ':00';
      groupMap[dStr] = { date: dStr, ...defaultProps };
    }
  } else if (groupFormat === 'month') {
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const dStr = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
      groupMap[dStr] = { date: dStr, ...defaultProps };
    }
  } else {
    const days = range === '30d' ? 30 : 7;
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dStr = d.toISOString().slice(0, 10);
      groupMap[dStr] = { date: dStr, ...defaultProps };
    }
  }
  return groupMap;
};

const getGroupKey = (dateStr: string, groupFormat: string) => {
  const dateObj = new Date(dateStr);
  if (groupFormat === 'hour') {
    return dateObj.getHours().toString().padStart(2, '0') + ':00';
  } else if (groupFormat === 'month') {
    return `${dateObj.getFullYear()}-${(dateObj.getMonth() + 1).toString().padStart(2, '0')}`;
  } else {
    return dateObj.toISOString().slice(0, 10);
  }
};
