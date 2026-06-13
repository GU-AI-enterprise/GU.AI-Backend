import { supabaseAdmin } from '../config/supabase';
import { fashnService } from './fashn.service';
import { CreditService } from './credit.service';
import { AssetCategory, AssetType } from '../constants/asset';
import { TryOnCategory } from '../constants/ai';
import { getIO } from '../config/socket';

// ── Tool Registry ──────────────────────────────────────────────────────────────

export const WORKFLOW_TOOLS = {
  remove_background: {
    inputKeys: ['image'] as string[],
    outputType: 'image' as const,
    estimatedCredit: 2,
    description: 'Xóa nền ảnh, output PNG trong suốt',
  },
  product_to_model: {
    inputKeys: ['product_image'] as string[],
    outputType: 'image' as const,
    estimatedCredit: 4,
    description: 'Đặt sản phẩm lên người mẫu AI (thêm: face_reference, background_reference)',
  },
  try_on: {
    inputKeys: ['model_image', 'garment_image'] as string[],
    outputType: 'image' as const,
    estimatedCredit: 2,
    description: 'Mặc thử trang phục lên người mẫu',
  },
  try_on_max: {
    inputKeys: ['product_image', 'model_image'] as string[],
    outputType: 'image' as const,
    estimatedCredit: 10,
    description: 'Try-On chất lượng cao',
  },
  edit_image: {
    inputKeys: ['image'] as string[],
    outputType: 'image' as const,
    estimatedCredit: 4,
    description: 'Chỉnh sửa ảnh theo mô tả (yêu cầu params.prompt)',
  },
  reframe: {
    inputKeys: ['image'] as string[],
    outputType: 'image' as const,
    estimatedCredit: 4,
    description: 'Đổi tỷ lệ khung hình (params.aspect_ratio: "1:1", "4:3", "16:9"...)',
  },
  face_to_model: {
    inputKeys: ['face_image'] as string[],
    outputType: 'image' as const,
    estimatedCredit: 4,
    description: 'Tạo người mẫu từ khuôn mặt',
  },
  model_create: {
    inputKeys: [] as string[],
    outputType: 'image' as const,
    estimatedCredit: 4,
    description: 'Tạo người mẫu từ mô tả (yêu cầu params.prompt; tuỳ chọn: image_reference)',
  },
  model_swap: {
    inputKeys: ['model_image'] as string[],
    outputType: 'image' as const,
    estimatedCredit: 4,
    description: 'Đổi người mẫu trong ảnh (tuỳ chọn: face_reference)',
  },
  image_to_video: {
    inputKeys: ['image'] as string[],
    outputType: 'video' as const,
    estimatedCredit: 12,
    description: 'Chuyển ảnh thành video ngắn',
  },
} as const;

export type WorkflowToolName = keyof typeof WORKFLOW_TOOLS;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface WorkflowStep {
  tool: string;
  inputs: Record<string, string>;
  params?: Record<string, any>;
  reason?: string;
}

export interface WorkflowPlan {
  goal: string;
  steps: WorkflowStep[];
  estimatedNote?: string;
  totalEstimatedCredit: number;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export interface PlannerResponse {
  message: string;
  plan: WorkflowPlan | null;
}

export interface ConversationTurn {
  role: 'user' | 'assistant';
  text: string;
}

// ── Planner ────────────────────────────────────────────────────────────────────

// ── Supported planning models ──────────────────────────────────────────────────

export const PLANNING_MODELS = {
  'gemini-2.5-flash': { label: 'Gemini 2.5 Flash', provider: 'gemini' as const },
  'gemini-2.5-pro':   { label: 'Gemini 2.5 Pro',   provider: 'gemini' as const },
  'gemini-2.0-flash': { label: 'Gemini 2.0 Flash',  provider: 'gemini' as const },
} as const;

export type PlanningModelId = keyof typeof PLANNING_MODELS;
export const DEFAULT_PLANNING_MODEL: PlanningModelId = 'gemini-2.5-flash';

// ── Planner ────────────────────────────────────────────────────────────────────

export class WorkflowPlannerService {
  static async chat(
    userMessage: string,
    userInputKeys: string[],
    history: ConversationTurn[] = [],
    modelId: PlanningModelId = DEFAULT_PLANNING_MODEL,
  ): Promise<PlannerResponse> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY chưa được cấu hình');

    const toolList = Object.entries(WORKFLOW_TOOLS).map(([name, meta]) => ({
      name,
      requiredImageInputs: meta.inputKeys,
      estimatedCredit: meta.estimatedCredit,
      description: meta.description,
    }));

    const hasUserInputs = userInputKeys.length > 0;

    const inputLines = userInputKeys.map(k => {
      const hints: Record<string, string> = {
        product_image: '"product_image" — ảnh sản phẩm/trang phục → dùng "$product_image"',
        model_image:   '"model_image" — ảnh người mẫu thật do user cung cấp → dùng "$model_image"',
        face_image:    '"face_image" — ảnh khuôn mặt tham chiếu → dùng "$face_image"',
      };
      return `- ${hints[k] ?? `"${k}" → dùng "$${k}"`}`;
    });

    const inputSection = hasUserInputs
      ? `Ảnh user đã đính kèm:\n${inputLines.join('\n')}`
      : 'User chưa đính kèm ảnh.';

    const imageRules: string[] = [];
    if (userInputKeys.includes('model_image')) {
      imageRules.push('- Có model_image: CHỈ dùng try_on/try_on_max/model_swap. KHÔNG dùng product_to_model.');
    }
    if (userInputKeys.includes('product_image') && !userInputKeys.includes('model_image')) {
      imageRules.push('- Có product_image, không có model_image: dùng product_to_model.');
    }
    if (userInputKeys.includes('product_image') && userInputKeys.includes('model_image')) {
      imageRules.push('- Có cả product_image và model_image: dùng try_on hoặc try_on_max.');
    }
    if (userInputKeys.includes('face_image') && !userInputKeys.includes('model_image')) {
      imageRules.push('- Có face_image, không có model_image: dùng face_to_model trước.');
    }

    const imageRulesSection = imageRules.length > 0
      ? `\n## Ràng buộc tool theo ảnh đính kèm\n${imageRules.join('\n')}`
      : '';

    const systemPrompt = `Bạn là GU.AI Assistant — trợ lý AI xử lý ảnh thời trang thông minh, thân thiện, nói tiếng Việt.

Nhiệm vụ: hỗ trợ user lên kế hoạch workflow xử lý ảnh. Hãy trò chuyện tự nhiên, hỏi làm rõ nếu cần.

## ${inputSection}
${imageRulesSection}

## Khi đã đủ thông tin để lên kế hoạch
Trả lời ngắn (1-2 câu) xác nhận bạn hiểu yêu cầu, rồi đặt kế hoạch trong một khối JSON duy nhất như sau:

\`\`\`json
{"goal":"...","steps":[{"tool":"...","inputs":{},"params":{},"reason":"..."}],"estimatedNote":"..."}
\`\`\`

Output của bước N (0-indexed) là "$step_N_output".

## Danh sách tool
${JSON.stringify(toolList, null, 2)}

## Lưu ý quan trọng
- inputs chứa tham chiếu ảnh: "$<user_key>" hoặc "$step_N_output"
- params chứa text (prompt, aspect_ratio, category...)
- Tối đa 3 bước
- "xóa nền" → bước đầu PHẢI là remove_background
- Nếu chưa rõ yêu cầu hoặc muốn xác nhận: hỏi tự nhiên, KHÔNG tạo JSON`;

    // Build conversation contents for Gemini
    const contents = [
      ...history.map(turn => ({
        role: turn.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: turn.text }],
      })),
      { role: 'user', parts: [{ text: userMessage }] },
    ];

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

    const res = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1500,
        },
      }),
    });

    if (!res.ok) {
      const err = await res.json() as any;
      throw new Error(`Gemini API lỗi: ${err.error?.message ?? res.status}`);
    }

    const data = await res.json() as any;
    const rawText: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    // Extract JSON plan from code block if present
    const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const messageText = rawText.replace(/```(?:json)?[\s\S]*?```/g, '').trim();

    if (!jsonMatch) {
      return { message: rawText.trim(), plan: null };
    }

    let planRaw: any;
    try {
      planRaw = JSON.parse(jsonMatch[1].trim());
    } catch {
      // Gemini returned something in a code block that wasn't valid JSON — treat as message
      return { message: rawText.trim(), plan: null };
    }

    if (!Array.isArray(planRaw.steps) || planRaw.steps.length === 0) {
      return { message: messageText || rawText.trim(), plan: null };
    }

    // ── Post-processing: deterministic overrides ───────────────────────────────
    const hasModelImage   = userInputKeys.includes('model_image');
    const hasProductImage = userInputKeys.includes('product_image');
    const msgLower        = userMessage.toLowerCase();
    const wantsRemoveBg   = msgLower.includes('xóa nền') || msgLower.includes('remove background');

    if (hasModelImage) {
      planRaw.steps = (planRaw.steps as WorkflowStep[]).map(step => {
        if (step.tool !== 'product_to_model') return step;
        const garmentRef = step.inputs?.product_image
          ?? step.inputs?.image
          ?? (hasProductImage ? '$product_image' : '$step_0_output');
        return {
          tool: 'try_on',
          inputs: { model_image: '$model_image', garment_image: garmentRef },
          params: step.params ?? {},
          reason: (step.reason ?? 'Mặc thử trang phục') + ' (người mẫu đã cung cấp)',
        } as WorkflowStep;
      });
    }

    if (wantsRemoveBg && hasProductImage) {
      const alreadyHas = (planRaw.steps as WorkflowStep[]).some(s => s.tool === 'remove_background');
      if (!alreadyHas) {
        const removeBgStep: WorkflowStep = {
          tool: 'remove_background',
          inputs: { image: '$product_image' },
          params: {},
          reason: 'Xóa nền ảnh sản phẩm trước khi xử lý',
        };
        const shifted = (planRaw.steps as WorkflowStep[]).map(step => ({
          ...step,
          inputs: Object.fromEntries(
            Object.entries(step.inputs ?? {}).map(([k, v]) =>
              [k, v === '$product_image' ? '$step_0_output' : v]
            )
          ),
        }));
        planRaw.steps = [removeBgStep, ...shifted];
      }
    }
    // ── End post-processing ────────────────────────────────────────────────────

    const totalEstimatedCredit = (planRaw.steps as any[]).reduce((sum: number, s: any) => {
      const tool = WORKFLOW_TOOLS[s.tool as WorkflowToolName];
      return sum + (tool?.estimatedCredit ?? 0);
    }, 0);

    const plan: WorkflowPlan = {
      goal: String(planRaw.goal ?? ''),
      steps: planRaw.steps,
      estimatedNote: planRaw.estimatedNote,
      totalEstimatedCredit,
    };

    return { message: messageText, plan };
  }
}

// ── Validator ──────────────────────────────────────────────────────────────────

export class WorkflowValidatorService {
  static validate(plan: WorkflowPlan, userInputKeys: string[]): ValidationResult {
    const errors: string[] = [];

    if (!Array.isArray(plan.steps) || plan.steps.length === 0) {
      return { ok: false, errors: ['Workflow phải có ít nhất 1 bước.'] };
    }
    if (plan.steps.length > 3) {
      errors.push('Workflow tối đa 3 bước.');
    }

    const validTools = new Set(Object.keys(WORKFLOW_TOOLS));

    plan.steps.forEach((step, i) => {
      if (!validTools.has(step.tool)) {
        errors.push(`Bước ${i + 1}: tool "${step.tool}" không tồn tại.`);
        return;
      }

      const toolDef = WORKFLOW_TOOLS[step.tool as WorkflowToolName];

      for (const req of toolDef.inputKeys) {
        if (!(req in (step.inputs ?? {}))) {
          errors.push(`Bước ${i + 1} (${step.tool}): thiếu image input "${req}".`);
          continue;
        }
        const err = this.validateRef(step.inputs[req], i, userInputKeys);
        if (err) errors.push(`Bước ${i + 1} (${step.tool}): input "${req}" — ${err}`);
      }

      for (const [key, ref] of Object.entries(step.inputs ?? {})) {
        if (!toolDef.inputKeys.includes(key)) continue;
        const err = this.validateRef(ref, i, userInputKeys);
        if (err) errors.push(`Bước ${i + 1} (${step.tool}): input "${key}" — ${err}`);
      }
    });

    if (plan.totalEstimatedCredit > 100) {
      errors.push('Workflow ước tính vượt 100 credits. Hãy giảm số bước.');
    }

    return { ok: errors.length === 0, errors };
  }

  private static validateRef(ref: string, stepIndex: number, userInputKeys: string[]): string | null {
    if (!ref) return 'không được để trống.';
    if (!ref.startsWith('$')) return null; // literal string — OK for optional inputs

    const stripped = ref.slice(1);
    if (userInputKeys.includes(stripped)) return null;

    const m = stripped.match(/^step_(\d+)_output$/);
    if (m) {
      const refStep = parseInt(m[1], 10);
      if (refStep >= stepIndex) return `"${ref}" chưa có (bước ${refStep + 1} chưa chạy).`;
      return null;
    }

    return `"${ref}" không phải ảnh người dùng hay output bước trước.`;
  }
}

// ── DB helper ──────────────────────────────────────────────────────────────────

function db() {
  if (!supabaseAdmin) throw new Error('Supabase chưa được cấu hình');
  return supabaseAdmin;
}

// ── Executor ───────────────────────────────────────────────────────────────────

export class WorkflowExecutorService {
  static async createWorkflow(params: {
    userId: string;
    prompt: string;
    plan: WorkflowPlan;
    userInputUrls: Record<string, string>;
  }): Promise<string> {
    const { data: workflow, error: wErr } = await db()
      .from('ai_workflows')
      .insert({
        user_id: params.userId,
        prompt: params.prompt,
        status: 'pending_confirm',
        plan_json: params.plan,
        estimated_credit: params.plan.totalEstimatedCredit,
        user_input_urls_json: params.userInputUrls,
      })
      .select('id')
      .single();

    if (wErr || !workflow) throw new Error(`Lỗi tạo workflow: ${wErr?.message}`);

    const steps = params.plan.steps.map((step, i) => ({
      workflow_id: workflow.id,
      step_index: i,
      tool_name: step.tool,
      status: 'pending',
      params_json: { inputs: step.inputs ?? {}, params: step.params ?? {} },
      credit_cost: WORKFLOW_TOOLS[step.tool as WorkflowToolName]?.estimatedCredit ?? 0,
    }));

    const { error: stepsErr } = await db().from('ai_workflow_steps').insert(steps);
    if (stepsErr) throw new Error(`Lỗi tạo workflow steps: ${stepsErr.message}`);

    return workflow.id;
  }

  static async execute(workflowId: string, userId: string): Promise<void> {
    const { data: workflow } = await db()
      .from('ai_workflows')
      .select('*')
      .eq('id', workflowId)
      .single();

    if (!workflow) throw new Error('Workflow không tồn tại');

    const { data: steps } = await db()
      .from('ai_workflow_steps')
      .select('*')
      .eq('workflow_id', workflowId)
      .order('step_index');

    if (!steps?.length) throw new Error('Workflow không có bước nào');

    await db().from('ai_workflows').update({
      status: 'processing',
      updated_at: new Date().toISOString(),
    }).eq('id', workflowId);

    this.emit(userId, { workflowId, status: 'processing' });

    const userInputUrls: Record<string, string> = workflow.user_input_urls_json ?? {};
    const outputs: Record<string, string> = {};
    let actualCredit = 0;

    for (const step of steps) {
      const planInputs: Record<string, string> = step.params_json?.inputs ?? {};
      const planParams: Record<string, any> = step.params_json?.params ?? {};

      // Resolve placeholder → actual URL
      const resolvedInputs: Record<string, string> = {};
      for (const [key, ref] of Object.entries(planInputs)) {
        if (typeof ref !== 'string') continue;
        if (!ref.startsWith('$')) {
          resolvedInputs[key] = ref;
          continue;
        }
        const stripped = ref.slice(1);
        if (userInputUrls[stripped]) {
          resolvedInputs[key] = userInputUrls[stripped];
        } else if (outputs[ref]) {
          resolvedInputs[key] = outputs[ref];
        } else {
          await this.failWorkflow(workflowId, userId, step.id,
            `Không tìm thấy input "${ref}" cho bước ${step.step_index + 1}`);
          return;
        }
      }

      await db().from('ai_workflow_steps').update({
        status: 'processing',
        started_at: new Date().toISOString(),
      }).eq('id', step.id);

      this.emit(userId, {
        workflowId,
        stepId: step.id,
        stepIndex: step.step_index,
        stepStatus: 'processing',
      });

      try {
        const outputUrl = await this.callTool(step.tool_name as WorkflowToolName, resolvedInputs, planParams);

        const isVideo = step.tool_name === 'image_to_video';
        const asset = await CreditService.saveOutputAsset({
          userId,
          url: outputUrl,
          category: AssetCategory.OUTPUT,
          mimeType: isVideo ? 'video/mp4' : 'image/png',
          assetType: isVideo ? AssetType.VIDEO : AssetType.IMAGE,
        });

        await CreditService.deductCredit(
          userId,
          step.credit_cost,
          `Workflow ${workflowId} bước ${step.step_index + 1}: ${step.tool_name}`
        );
        actualCredit += step.credit_cost;

        await db().from('ai_workflow_steps').update({
          status: 'completed',
          output_url: outputUrl,
          output_asset_id: asset.id,
          completed_at: new Date().toISOString(),
        }).eq('id', step.id);

        await db().from('ai_workflows').update({
          actual_credit: actualCredit,
          updated_at: new Date().toISOString(),
        }).eq('id', workflowId);

        outputs[`$step_${step.step_index}_output`] = outputUrl;

        this.emit(userId, {
          workflowId,
          stepId: step.id,
          stepIndex: step.step_index,
          stepStatus: 'completed',
          outputUrl,
          assetId: asset.id,
        });

      } catch (err: any) {
        await this.failWorkflow(workflowId, userId, step.id, err.message ?? 'Lỗi không xác định');
        return;
      }
    }

    const lastStep = steps[steps.length - 1];
    const { data: lastData } = await db()
      .from('ai_workflow_steps')
      .select('output_asset_id, output_url')
      .eq('id', lastStep.id)
      .single();

    await db().from('ai_workflows').update({
      status: 'completed',
      final_asset_id: lastData?.output_asset_id ?? null,
      updated_at: new Date().toISOString(),
    }).eq('id', workflowId);

    this.emit(userId, {
      workflowId,
      status: 'completed',
      finalUrl: lastData?.output_url ?? null,
    });
  }

  private static async failWorkflow(
    workflowId: string,
    userId: string,
    stepId: string,
    error: string
  ): Promise<void> {
    await db().from('ai_workflow_steps').update({
      status: 'failed',
      error_message: error,
    }).eq('id', stepId);

    await db().from('ai_workflows').update({
      status: 'failed',
      error_message: error,
      updated_at: new Date().toISOString(),
    }).eq('id', workflowId);

    this.emit(userId, { workflowId, status: 'failed', error });
  }

  private static emit(userId: string, payload: Record<string, any>): void {
    try {
      getIO().to(`user:${userId}`).emit('workflow_update', payload);
    } catch { /* Socket.IO not ready */ }
  }

  private static async callTool(
    tool: WorkflowToolName,
    inputs: Record<string, string>,
    params: Record<string, any>
  ): Promise<string> {
    switch (tool) {
      case 'remove_background':
        return (await fashnService.removeBackground(inputs.image)).outputUrl;

      case 'product_to_model':
        return (await fashnService.productToModel({
          productImage: inputs.product_image,
          prompt: params.prompt,
          faceReference: inputs.face_reference,
          backgroundReference: inputs.background_reference,
          aspectRatio: params.aspect_ratio,
          generationMode: params.generation_mode,
          resolution: params.resolution,
        })).outputUrl;

      case 'try_on':
        return (await fashnService.tryOn({
          modelImage: inputs.model_image,
          garmentImage: inputs.garment_image,
          category: (params.category as TryOnCategory) ?? TryOnCategory.AUTO,
        })).outputUrl;

      case 'try_on_max':
        return (await fashnService.tryOnMax({
          productImage: inputs.product_image,
          modelImage: inputs.model_image,
          prompt: params.prompt,
          generationMode: params.generation_mode,
          resolution: params.resolution,
        })).outputUrl;

      case 'edit_image':
        return (await fashnService.editImage({
          image: inputs.image,
          prompt: params.prompt ?? '',
          generationMode: params.generation_mode,
          resolution: params.resolution,
        })).outputUrl;

      case 'reframe':
        return (await fashnService.reframe({
          image: inputs.image,
          aspectRatio: params.aspect_ratio ?? '1:1',
          generationMode: params.generation_mode,
          resolution: params.resolution,
        })).outputUrl;

      case 'face_to_model':
        return (await fashnService.faceToModel({
          faceImage: inputs.face_image,
          prompt: params.prompt,
          aspectRatio: params.aspect_ratio,
          generationMode: params.generation_mode,
          resolution: params.resolution,
        })).outputUrl;

      case 'model_create':
        return (await fashnService.modelCreate({
          prompt: params.prompt ?? '',
          imageReference: inputs.image_reference,
          aspectRatio: params.aspect_ratio,
          generationMode: params.generation_mode,
          resolution: params.resolution,
        })).outputUrl;

      case 'model_swap':
        return (await fashnService.modelSwap({
          modelImage: inputs.model_image,
          faceReference: inputs.face_reference,
          prompt: params.prompt,
          generationMode: params.generation_mode,
          resolution: params.resolution,
        })).outputUrl;

      case 'image_to_video':
        return (await fashnService.imageToVideo({
          image: inputs.image,
          prompt: params.prompt,
          duration: params.duration,
          resolution: params.resolution,
        })).outputUrl;

      default:
        throw new Error(`Tool "${tool}" không được hỗ trợ.`);
    }
  }
}
