import { supabaseAdmin } from '../config/supabase';
import { fashnService } from './fashn.service';
import { CreditService } from './credit.service';
import { AssetCategory, AssetType } from '../constants/asset';
import { TryOnCategory } from '../constants/ai';
import { getIO } from '../config/socket';
import { buildSystemPrompt, applyPostProcessingRules } from './workflow.rules';
import { FashnToolsService } from './fashn-tools.service';

export type WorkflowToolName =
  | 'remove_background' | 'product_to_model' | 'try_on' | 'try_on_max'
  | 'edit_image' | 'reframe' | 'face_to_model' | 'model_create'
  | 'model_swap' | 'image_to_video';

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

    const dbTools = await FashnToolsService.getAll();
    const toolList = dbTools.map(t => ({
      name: t.tool_key,
      requiredImageInputs: t.required_inputs,
      estimatedCredit: t.base_credit,
      description: t.use_case ?? t.purpose ?? '',
    }));

    const systemPrompt = buildSystemPrompt(userInputKeys, toolList);

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

    planRaw.steps = applyPostProcessingRules(planRaw.steps as WorkflowStep[], userInputKeys, userMessage);

    const toolMap = Object.fromEntries(dbTools.map(t => [t.tool_key, t]));
    const totalEstimatedCredit = (planRaw.steps as any[]).reduce((sum: number, s: any) => {
      return sum + (toolMap[s.tool]?.base_credit ?? 0);
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
  static async validate(plan: WorkflowPlan, userInputKeys: string[]): Promise<ValidationResult> {
    const errors: string[] = [];

    if (!Array.isArray(plan.steps) || plan.steps.length === 0) {
      return { ok: false, errors: ['Workflow phải có ít nhất 1 bước.'] };
    }
    if (plan.steps.length > 3) {
      errors.push('Workflow tối đa 3 bước.');
    }

    const toolMap = await FashnToolsService.getByToolKey();
    const validTools = new Set(Object.keys(toolMap));

    plan.steps.forEach((step, i) => {
      if (!validTools.has(step.tool)) {
        errors.push(`Bước ${i + 1}: tool "${step.tool}" không tồn tại.`);
        return;
      }

      const toolDef = toolMap[step.tool];

      for (const req of toolDef.required_inputs) {
        if (!(req in (step.inputs ?? {}))) {
          errors.push(`Bước ${i + 1} (${step.tool}): thiếu image input "${req}".`);
          continue;
        }
        const err = this.validateRef(step.inputs[req], i, userInputKeys);
        if (err) errors.push(`Bước ${i + 1} (${step.tool}): input "${req}" — ${err}`);
      }

      for (const [key, ref] of Object.entries(step.inputs ?? {})) {
        if (!toolDef.required_inputs.includes(key)) continue;
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

    const toolMap = await FashnToolsService.getByToolKey();
    const steps = params.plan.steps.map((step, i) => ({
      workflow_id: workflow.id,
      step_index: i,
      tool_name: step.tool,
      status: 'pending',
      params_json: { inputs: step.inputs ?? {}, params: step.params ?? {} },
      credit_cost: toolMap[step.tool]?.base_credit ?? 0,
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
