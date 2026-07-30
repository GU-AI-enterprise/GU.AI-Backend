import { Request, Response } from 'express';
import { PackageService, CreditPackageInput, VALID_GRANTS_PLAN_TYPES } from '../services/package.service';
import { sendSuccess, sendError } from '../utils/response';

function parseDescription(raw: unknown): CreditPackageInput['description'] | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  if (typeof raw === 'object') return raw as any;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export class PackageController {
  // GET /api/admin/packages
  async adminList(_req: Request, res: Response) {
    try {
      const packages = await PackageService.getAllAdmin();
      sendSuccess(res, { data: packages });
    } catch (err: any) {
      sendError(res, 500, 'Lỗi lấy danh sách gói', err.message);
    }
  }

  // POST /api/admin/packages
  async adminCreate(req: Request, res: Response) {
    try {
      const { name, price, credit_amount, bonus_credit, is_active, sort_order, grants_plan_type } = req.body;

      if (!name) return sendError(res, 400, 'Thiếu tên gói');
      if (price === undefined || Number(price) < 0) return sendError(res, 400, 'Giá gói không hợp lệ');
      if (credit_amount === undefined || Number(credit_amount) < 0) return sendError(res, 400, 'Số credit không hợp lệ');
      if (grants_plan_type && !VALID_GRANTS_PLAN_TYPES.includes(grants_plan_type)) {
        return sendError(res, 400, `grants_plan_type phải là một trong: ${VALID_GRANTS_PLAN_TYPES.join(', ')}`);
      }

      const input: CreditPackageInput = {
        name,
        price: Number(price),
        credit_amount: Number(credit_amount),
        bonus_credit: bonus_credit !== undefined ? Number(bonus_credit) : 0,
        is_active: is_active !== undefined ? is_active === 'true' || is_active === true : true,
        sort_order: sort_order !== undefined ? Number(sort_order) : 0,
        grants_plan_type: grants_plan_type || null,
        description: parseDescription(req.body.description) ?? null,
      };

      const created = await PackageService.create(input);
      sendSuccess(res, { statusCode: 201, data: created });
    } catch (err: any) {
      sendError(res, 500, 'Lỗi tạo gói', err.message);
    }
  }

  // PUT /api/admin/packages/:id
  async adminUpdate(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { name, price, credit_amount, bonus_credit, is_active, sort_order, grants_plan_type } = req.body;

      if (grants_plan_type && !VALID_GRANTS_PLAN_TYPES.includes(grants_plan_type)) {
        return sendError(res, 400, `grants_plan_type phải là một trong: ${VALID_GRANTS_PLAN_TYPES.join(', ')}`);
      }

      const input: Partial<CreditPackageInput> = {};
      if (name !== undefined) input.name = name;
      if (price !== undefined) input.price = Number(price);
      if (credit_amount !== undefined) input.credit_amount = Number(credit_amount);
      if (bonus_credit !== undefined) input.bonus_credit = Number(bonus_credit);
      if (is_active !== undefined) input.is_active = is_active === 'true' || is_active === true;
      if (sort_order !== undefined) input.sort_order = Number(sort_order);
      if (grants_plan_type !== undefined) input.grants_plan_type = grants_plan_type || null;
      const description = parseDescription(req.body.description);
      if (description !== undefined) input.description = description;

      const updated = await PackageService.update(String(id), input);
      sendSuccess(res, { data: updated });
    } catch (err: any) {
      sendError(res, 500, 'Lỗi cập nhật gói', err.message);
    }
  }

  // DELETE /api/admin/packages/:id
  async adminDelete(req: Request, res: Response) {
    try {
      await PackageService.remove(String(req.params.id));
      sendSuccess(res, { message: 'Đã xoá gói' });
    } catch (err: any) {
      sendError(res, 500, 'Lỗi xoá gói', err.message);
    }
  }
}
