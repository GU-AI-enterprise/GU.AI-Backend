import { Request, Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import { AppModelService, AppModelInput, PlanType } from '../services/app-model.service';
import { StorageService } from '../services/storage.service';
import { supabaseAdmin } from '../config/supabase';
import { sendSuccess, sendError } from '../utils/response';

const VALID_TIERS: PlanType[] = ['free', 'basic', 'pro', 'agency'];

function parseTags(raw: unknown): string[] | undefined {
  if (raw === undefined) return undefined;
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      // not JSON — treat as comma-separated
    }
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return undefined;
}

export class AppModelController {
  // GET /api/models — user-facing, gated theo plan_type của user hiện tại
  async list(req: AuthRequest, res: Response) {
    try {
      const { data: user, error } = await supabaseAdmin!
        .from('users')
        .select('plan_type')
        .eq('id', req.user!.id)
        .single();
      if (error) throw error;

      const tier = (user?.plan_type ?? 'free') as PlanType;
      const models = await AppModelService.getForUser(tier);
      sendSuccess(res, { data: models });
    } catch (err: any) {
      sendError(res, 500, 'Lỗi lấy danh sách người mẫu', err.message);
    }
  }

  // GET /api/admin/models
  async adminList(_req: Request, res: Response) {
    try {
      const models = await AppModelService.getAllAdmin();
      sendSuccess(res, { data: models });
    } catch (err: any) {
      sendError(res, 500, 'Lỗi lấy danh sách người mẫu', err.message);
    }
  }

  // POST /api/admin/models (multipart: image + fields)
  async adminCreate(req: Request, res: Response) {
    try {
      const { name, gender, required_tier, display_order, is_active } = req.body;
      const file = (req.files as any)?.image?.[0];

      if (!name) return sendError(res, 400, 'Thiếu tên người mẫu');
      if (!file) return sendError(res, 400, 'Thiếu ảnh người mẫu');
      if (required_tier && !VALID_TIERS.includes(required_tier)) {
        return sendError(res, 400, `required_tier phải là một trong: ${VALID_TIERS.join(', ')}`);
      }

      const imageUrl = await StorageService.uploadAppModelImage(file.buffer, file.originalname, file.mimetype);

      const input: AppModelInput = {
        name,
        image_url: imageUrl,
        gender: gender || null,
        tags: parseTags(req.body.tags),
        required_tier: required_tier || 'free',
        display_order: display_order !== undefined ? Number(display_order) : 0,
        is_active: is_active !== undefined ? is_active === 'true' || is_active === true : true,
      };

      const created = await AppModelService.create(input);
      sendSuccess(res, { statusCode: 201, data: created });
    } catch (err: any) {
      sendError(res, 500, 'Lỗi tạo người mẫu', err.message);
    }
  }

  // PUT /api/admin/models/:id (multipart, ảnh optional)
  async adminUpdate(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { name, gender, required_tier, display_order, is_active } = req.body;
      const file = (req.files as any)?.image?.[0];

      if (required_tier && !VALID_TIERS.includes(required_tier)) {
        return sendError(res, 400, `required_tier phải là một trong: ${VALID_TIERS.join(', ')}`);
      }

      const input: Partial<AppModelInput> = {};
      if (name !== undefined) input.name = name;
      if (gender !== undefined) input.gender = gender || null;
      if (req.body.tags !== undefined) input.tags = parseTags(req.body.tags);
      if (required_tier !== undefined) input.required_tier = required_tier;
      if (display_order !== undefined) input.display_order = Number(display_order);
      if (is_active !== undefined) input.is_active = is_active === 'true' || is_active === true;
      if (file) input.image_url = await StorageService.uploadAppModelImage(file.buffer, file.originalname, file.mimetype);

      const updated = await AppModelService.update(String(id), input);
      sendSuccess(res, { data: updated });
    } catch (err: any) {
      sendError(res, 500, 'Lỗi cập nhật người mẫu', err.message);
    }
  }

  // DELETE /api/admin/models/:id
  async adminDelete(req: Request, res: Response) {
    try {
      await AppModelService.remove(String(req.params.id));
      sendSuccess(res, { message: 'Đã xoá người mẫu' });
    } catch (err: any) {
      sendError(res, 500, 'Lỗi xoá người mẫu', err.message);
    }
  }

  // PATCH /api/admin/models/reorder — body: { items: [{ id, display_order }] }
  async adminReorder(req: Request, res: Response) {
    try {
      const items = req.body.items;
      if (!Array.isArray(items)) return sendError(res, 400, 'items phải là một mảng');
      await AppModelService.reorder(items);
      sendSuccess(res, { message: 'Đã cập nhật thứ tự' });
    } catch (err: any) {
      sendError(res, 500, 'Lỗi cập nhật thứ tự', err.message);
    }
  }
}
