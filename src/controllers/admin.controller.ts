import { Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { AuthRequest } from '../middlewares/auth.middleware';

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

  public async getStats(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!supabaseAdmin) {
        res.status(500).json({ success: false, error: 'Service role not configured' });
        return;
      }

      const { data, error } = await supabaseAdmin.from('users').select('role, status');

      if (error) {
        res.status(500).json({ success: false, error: error.message });
        return;
      }

      const users = data || [];
      res.json({
        success: true,
        data: {
          total: users.length,
          active: users.filter((u) => u.status === 'active').length,
          locked: users.filter((u) => u.status === 'locked').length,
          byRole: {
            customer: users.filter((u) => u.role === 'customer').length,
            staff: users.filter((u) => u.role === 'staff').length,
            admin: users.filter((u) => u.role === 'admin').length,
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
}
