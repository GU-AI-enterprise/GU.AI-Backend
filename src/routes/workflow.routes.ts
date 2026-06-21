import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middlewares/auth.middleware';
import {
  WorkflowPlannerService,
  WorkflowValidatorService,
  WorkflowExecutorService,
  PLANNING_MODELS,
  DEFAULT_PLANNING_MODEL,
  type PlanningModelId,
  type ConversationTurn,
} from '../services/workflow.service';
import { FashnToolsService } from '../services/fashn-tools.service';
import { CreditService } from '../services/credit.service';
import { supabaseAdmin } from '../config/supabase';

const router = Router();
router.use(requireAuth);

/**
 * GET /api/workflow/tools
 * Danh sách fashn tools từ DB — dùng cho frontend hiển thị label/credit.
 */
router.get('/tools', async (_req, res: Response) => {
  try {
    const tools = await FashnToolsService.getAll();
    res.json({ success: true, data: tools });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/workflow/models
 * Danh sách model AI có thể chọn để lên kế hoạch.
 */
router.get('/models', (_req, res: Response) => {
  const models = Object.entries(PLANNING_MODELS).map(([id, meta]) => ({
    id,
    label: meta.label,
    default: id === DEFAULT_PLANNING_MODEL,
  }));
  res.json({ success: true, data: models });
});

/**
 * POST /api/workflow/chat
 * Gửi tin nhắn đến Gemini. Trả về { message, plan } — plan là null nếu AI chỉ chat.
 */
router.post('/chat', async (req: AuthRequest, res: Response) => {
  const { message, userInputUrls, model, history } = req.body as {
    message: string;
    userInputUrls?: Record<string, string>;
    model?: string;
    history?: ConversationTurn[];
  };

  if (!message?.trim()) {
    res.status(400).json({ success: false, error: 'message là bắt buộc' });
    return;
  }

  const modelId: PlanningModelId = (model && model in PLANNING_MODELS)
    ? (model as PlanningModelId)
    : DEFAULT_PLANNING_MODEL;

  const inputUrls = userInputUrls ?? {};
  const userInputKeys = Object.keys(inputUrls);

  try {
    const result = await WorkflowPlannerService.chat(
      message.trim(),
      userInputKeys,
      history ?? [],
      modelId,
    );

    // If a plan was produced, validate it
    if (result.plan) {
      const validation = await WorkflowValidatorService.validate(result.plan, userInputKeys);
      if (!validation.ok) {
        // Return the message but drop the invalid plan; let the user retry
        return res.json({
          success: true,
          data: {
            message: result.message
              + `\n\n⚠️ Kế hoạch vừa tạo có lỗi: ${validation.errors[0]}. Hãy mô tả lại yêu cầu.`,
            plan: null,
            model: modelId,
          },
        });
      }
    }

    res.json({ success: true, data: { message: result.message, plan: result.plan, model: modelId } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/workflow/chat/stream
 * Như /chat nhưng trả lời dạng SSE — stream từng đoạn text khi Gemini sinh ra,
 * thay vì chờ toàn bộ response rồi mới trả về một lần.
 */
router.post('/chat/stream', async (req: AuthRequest, res: Response) => {
  const { message, userInputUrls, model, history } = req.body as {
    message: string;
    userInputUrls?: Record<string, string>;
    model?: string;
    history?: ConversationTurn[];
  };

  if (!message?.trim()) {
    res.status(400).json({ success: false, error: 'message là bắt buộc' });
    return;
  }

  const modelId: PlanningModelId = (model && model in PLANNING_MODELS)
    ? (model as PlanningModelId)
    : DEFAULT_PLANNING_MODEL;

  const inputUrls = userInputUrls ?? {};
  const userInputKeys = Object.keys(inputUrls);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (event: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    const result = await WorkflowPlannerService.chatStream(
      message.trim(),
      userInputKeys,
      history ?? [],
      modelId,
      send,
    );

    let finalMessage = result.message;
    let finalPlan = result.plan;

    if (finalPlan) {
      const validation = await WorkflowValidatorService.validate(finalPlan, userInputKeys);
      if (!validation.ok) {
        finalMessage += `\n\n⚠️ Kế hoạch vừa tạo có lỗi: ${validation.errors[0]}. Hãy mô tả lại yêu cầu.`;
        finalPlan = null;
      }
    }

    send({ type: 'done', message: finalMessage, plan: finalPlan, model: modelId });
  } catch (err: any) {
    send({ type: 'error', error: err.message });
  } finally {
    res.end();
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
