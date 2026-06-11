import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middlewares/auth.middleware';
import {
  WorkflowPlannerService,
  WorkflowValidatorService,
  WorkflowExecutorService,
} from '../services/workflow.service';
import { CreditService } from '../services/credit.service';
import { supabaseAdmin } from '../config/supabase';

const router = Router();
router.use(requireAuth);

/**
 * POST /api/workflow/plan
 * Planner: gọi Groq để lên kế hoạch → validate → trả về plan để user confirm.
 */
router.post('/plan', async (req: AuthRequest, res: Response) => {
  const { prompt, userInputUrls } = req.body as {
    prompt: string;
    userInputUrls?: Record<string, string>;
  };

  if (!prompt?.trim()) {
    res.status(400).json({ success: false, error: 'prompt là bắt buộc' });
    return;
  }

  const inputUrls = userInputUrls ?? {};
  const userInputKeys = Object.keys(inputUrls);

  try {
    const plan = await WorkflowPlannerService.plan(prompt.trim(), userInputKeys);
    const validation = WorkflowValidatorService.validate(plan, userInputKeys);

    if (!validation.ok) {
      res.status(422).json({
        success: false,
        error: 'Kế hoạch không hợp lệ: ' + validation.errors[0],
        details: validation.errors,
      });
      return;
    }

    res.json({ success: true, data: { plan } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/workflow/execute
 * User đã confirm → tạo workflow record → chạy async → trả về workflowId ngay.
 */
router.post('/execute', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { prompt, plan, userInputUrls } = req.body as {
    prompt: string;
    plan: any;
    userInputUrls?: Record<string, string>;
  };

  if (!plan || !prompt) {
    res.status(400).json({ success: false, error: 'plan và prompt là bắt buộc' });
    return;
  }

  const totalCredit: number = plan.totalEstimatedCredit ?? 0;

  // Credit pre-check trước khi chạy
  const creditCheck = await CreditService.checkCredit(userId, totalCredit);
  if (!creditCheck.ok) {
    res.status(402).json({
      success: false,
      error: `Không đủ credits. Cần ${totalCredit}, hiện có ${creditCheck.userCredit}.`,
    });
    return;
  }

  try {
    const workflowId = await WorkflowExecutorService.createWorkflow({
      userId,
      prompt,
      plan,
      userInputUrls: userInputUrls ?? {},
    });

    // Chạy async — không await, trả về ngay
    WorkflowExecutorService.execute(workflowId, userId).catch((err) => {
      console.error(`[WorkflowExecutor] Workflow ${workflowId} crashed:`, err.message);
    });

    res.json({ success: true, data: { workflowId } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/workflow
 * Lấy danh sách workflow gần đây của user (cho history panel).
 */
router.get('/', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  if (!supabaseAdmin) { res.status(500).json({ success: false, error: 'DB không sẵn sàng' }); return; }

  const { data, error } = await supabaseAdmin
    .from('ai_workflows')
    .select('id, prompt, status, estimated_credit, actual_credit, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  res.json({ success: true, data: data ?? [] });
});

/**
 * GET /api/workflow/:id
 * Lấy trạng thái workflow + danh sách bước (dùng cho polling).
 */
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  if (!supabaseAdmin) {
    res.status(500).json({ success: false, error: 'DB không sẵn sàng' });
    return;
  }

  const { data: workflow, error } = await supabaseAdmin
    .from('ai_workflows')
    .select('id, prompt, status, plan_json, estimated_credit, actual_credit, error_message, created_at, final_asset_id')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (error || !workflow) {
    res.status(404).json({ success: false, error: 'Workflow không tìm thấy' });
    return;
  }

  const { data: steps } = await supabaseAdmin
    .from('ai_workflow_steps')
    .select('id, step_index, tool_name, status, output_url, output_asset_id, credit_cost, error_message, started_at, completed_at')
    .eq('workflow_id', id)
    .order('step_index');

  res.json({ success: true, data: { workflow, steps: steps ?? [] } });
});

/**
 * POST /api/workflow/:id/cancel
 * Hủy workflow đang ở trạng thái pending_confirm.
 */
router.post('/:id/cancel', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  if (!supabaseAdmin) {
    res.status(500).json({ success: false, error: 'DB không sẵn sàng' });
    return;
  }

  const { data: workflow } = await supabaseAdmin
    .from('ai_workflows')
    .select('status')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (!workflow) {
    res.status(404).json({ success: false, error: 'Workflow không tìm thấy' });
    return;
  }

  if (workflow.status !== 'pending_confirm') {
    res.status(400).json({ success: false, error: 'Chỉ hủy được workflow đang chờ xác nhận.' });
    return;
  }

  await supabaseAdmin.from('ai_workflows').update({
    status: 'cancelled',
    updated_at: new Date().toISOString(),
  }).eq('id', id);

  res.json({ success: true });
});

export default router;
