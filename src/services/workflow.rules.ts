import type { WorkflowStep } from './workflow.service';

// ── System Prompt ──────────────────────────────────────────────────────────────

interface ToolMeta {
  name: string;
  requiredImageInputs: readonly string[];
  estimatedCredit: number;
  description: string;
}

function buildInputSection(userInputKeys: string[]): string {
  if (userInputKeys.length === 0) return 'User chưa đính kèm ảnh.';

  const hints: Record<string, string> = {
    product_image: '"product_image" — ảnh sản phẩm/trang phục → dùng "$product_image"',
    model_image:   '"model_image" — ảnh người mẫu thật do user cung cấp → dùng "$model_image"',
    face_image:    '"face_image" — ảnh khuôn mặt tham chiếu → dùng "$face_image"',
  };

  const lines = userInputKeys.map(k => `- ${hints[k] ?? `"${k}" → dùng "$${k}"`}`);
  return `Ảnh user đã đính kèm:\n${lines.join('\n')}`;
}

function buildImageRulesSection(userInputKeys: string[]): string {
  const rules: string[] = [];

  if (userInputKeys.includes('model_image')) {
    rules.push('- Có model_image: CHỈ dùng try_on/try_on_max/model_swap. KHÔNG dùng product_to_model.');
  }
  if (userInputKeys.includes('product_image') && !userInputKeys.includes('model_image')) {
    rules.push('- Có product_image, không có model_image: dùng product_to_model.');
  }
  if (userInputKeys.includes('product_image') && userInputKeys.includes('model_image')) {
    rules.push('- Có cả product_image và model_image: dùng try_on hoặc try_on_max.');
  }
  if (userInputKeys.includes('face_image') && !userInputKeys.includes('model_image')) {
    rules.push('- Có face_image, không có model_image: dùng face_to_model trước.');
  }
  if (userInputKeys.includes('face_image') && userInputKeys.includes('model_image')) {
    rules.push('- Có cả face_image và model_image: dùng model_swap với face_reference="$face_image".');
  }

  return rules.length > 0
    ? `\n## Ràng buộc tool theo ảnh đính kèm\n${rules.join('\n')}`
    : '';
}

export function buildSystemPrompt(userInputKeys: string[], toolList: ToolMeta[]): string {
  const inputSection     = buildInputSection(userInputKeys);
  const imageRulesSection = buildImageRulesSection(userInputKeys);

  return `Bạn là GU.AI Assistant — trợ lý AI xử lý ảnh thời trang thông minh, thân thiện, nói tiếng Việt.

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
}

// ── Post-Processing Rules ──────────────────────────────────────────────────────
// Deterministic overrides applied after LLM output — these always win.

export function applyPostProcessingRules(
  steps: WorkflowStep[],
  userInputKeys: string[],
  userMessage: string,
): WorkflowStep[] {
  const hasModelImage   = userInputKeys.includes('model_image');
  const hasProductImage = userInputKeys.includes('product_image');
  const msgLower        = userMessage.toLowerCase();
  const wantsRemoveBg   = msgLower.includes('xóa nền') || msgLower.includes('remove background');

  let result = [...steps];

  // Rule A: model_image cung cấp → không bao giờ dùng product_to_model
  if (hasModelImage) {
    result = result.map(step => {
      if (step.tool !== 'product_to_model') return step;
      const garmentRef = step.inputs?.product_image
        ?? step.inputs?.image
        ?? (hasProductImage ? '$product_image' : '$step_0_output');
      return {
        tool: 'try_on',
        inputs: { model_image: '$model_image', garment_image: garmentRef },
        params: step.params ?? {},
        reason: (step.reason ?? 'Mặc thử trang phục') + ' (người mẫu đã cung cấp)',
      };
    });
  }

  // Rule B: "xóa nền" + product_image → bước đầu phải là remove_background
  if (wantsRemoveBg && hasProductImage) {
    const alreadyHas = result.some(s => s.tool === 'remove_background');
    if (!alreadyHas) {
      const removeBgStep: WorkflowStep = {
        tool: 'remove_background',
        inputs: { image: '$product_image' },
        params: {},
        reason: 'Xóa nền ảnh sản phẩm trước khi xử lý',
      };
      const shifted = result.map(step => ({
        ...step,
        inputs: Object.fromEntries(
          Object.entries(step.inputs ?? {}).map(([k, v]) =>
            [k, v === '$product_image' ? '$step_0_output' : v]
          )
        ),
      }));
      result = [removeBgStep, ...shifted];
    }
  }

  return result;
}
