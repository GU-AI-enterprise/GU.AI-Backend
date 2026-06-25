// Tác vụ phụ dùng Gemini trong Studio: gợi ý prompt tiếng Anh + verify ảnh đầu vào.
// Thay cho "Trợ lý ảo" (workflow chat) đã bị bỏ — xem docs/09-tro-ly-ao-danh-gia-va-de-xuat.md.
// Model cố định ở backend (không cho user chọn) vì đây là tác vụ hỗ trợ, không phải tính năng chính.

const GEMINI_MODEL = 'gemini-2.5-flash';

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY chưa được cấu hình');
  return key;
}

async function callGemini(body: Record<string, unknown>): Promise<any> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${getApiKey()}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any;
    throw new Error(`Gemini API lỗi: ${err.error?.message ?? res.status}`);
  }
  return res.json();
}

// ── Gợi ý prompt (text-only) ─────────────────────────────────────────────────
// Tái sử dụng tinh thần "Quy tắc điền params.prompt" từng có trong workflow.rules.ts.

const SUGGEST_PROMPT_SYSTEM = `Bạn là chuyên gia viết prompt tiếng Anh cho công cụ AI tạo/chỉnh ảnh thời trang.

Nhiệm vụ: dựa vào tool đang dùng và ý tưởng ngắn (có thể bằng tiếng Việt) của user, viết lại thành 1 prompt tiếng Anh chuyên nghiệp, súc tích (1-2 câu, tối đa ~40 từ).

Quy tắc:
- Mô tả đầy đủ chi tiết liên quan: đặc điểm người mẫu (giới tính, dáng người, sắc tộc nếu được nêu), trang phục, tư thế, background, ánh sáng — bất kỳ chi tiết nào user đề cập.
- Nếu user không cho ý tưởng cụ thể: tự đề xuất 1 prompt mẫu hợp lý cho loại tool đó.
- CHỈ trả về đúng nội dung prompt tiếng Anh, KHÔNG giải thích, KHÔNG markdown, KHÔNG đặt trong dấu ngoặc kép.`;

export interface SuggestPromptInput {
  tool: string;
  userHint: string;
}

export async function suggestPrompt({ tool, userHint }: SuggestPromptInput): Promise<string> {
  const userText = userHint.trim()
    ? `Tool: ${tool}\nÝ tưởng của user: ${userHint.trim()}`
    : `Tool: ${tool}\nUser chưa có ý tưởng cụ thể — hãy tự đề xuất 1 prompt mẫu phù hợp.`;

  const data = await callGemini({
    systemInstruction: { parts: [{ text: SUGGEST_PROMPT_SYSTEM }] },
    contents: [{ role: 'user', parts: [{ text: userText }] }],
    generationConfig: { temperature: 0.6, maxOutputTokens: 200 },
  });

  const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return text.trim().replace(/^["']|["']$/g, '');
}

// ── Verify ảnh đầu vào (multimodal + structured output) ──────────────────────
// Dùng responseSchema chính thức của Gemini — không parse text bằng regex như planner cũ.

export type ExpectedImageType = 'face' | 'product' | 'model' | 'background';

export const VALID_EXPECTED_TYPES: ExpectedImageType[] = ['face', 'product', 'model', 'background'];

export interface VerifyImageResult {
  ok: boolean;
  issues: string[];
}

const EXPECTED_TYPE_HINTS: Record<ExpectedImageType, string> = {
  face: 'ảnh khuôn mặt/chân dung (selfie hoặc headshot) — cần nhìn rõ mặt người, đủ sáng',
  product: 'ảnh sản phẩm/trang phục — không bị cắt thiếu phần chính, không quá mờ/tối',
  model: 'ảnh người mẫu/người đang mặc trang phục — nhìn thấy toàn bộ hoặc phần lớn cơ thể',
  background: 'ảnh bối cảnh/nền — không bắt buộc có người',
};

export async function verifyImage(
  imageBuffer: Buffer,
  mimeType: string,
  expectedType: ExpectedImageType,
): Promise<VerifyImageResult> {
  const prompt = `Đánh giá ảnh này có dùng được làm "${EXPECTED_TYPE_HINTS[expectedType]}" không.
Chỉ báo lỗi (ok=false) nếu ảnh THỰC SỰ không dùng được — vd: không có mặt người khi cần ảnh mặt, ảnh quá mờ/tối/nhỏ không nhìn rõ nội dung chính, hoặc nội dung không phù hợp.
Bỏ qua lỗi nhỏ/chủ quan (góc chụp, ánh sáng hơi yếu, bố cục) — những trường hợp đó vẫn ok=true.`;

  const data = await callGemini({
    contents: [{
      role: 'user',
      parts: [
        { text: prompt },
        { inlineData: { mimeType, data: imageBuffer.toString('base64') } },
      ],
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 300,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          ok: { type: 'BOOLEAN' },
          issues: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['ok', 'issues'],
      },
    },
  });

  const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  try {
    const parsed = JSON.parse(text);
    return { ok: parsed.ok !== false, issues: Array.isArray(parsed.issues) ? parsed.issues : [] };
  } catch {
    // responseSchema đã ép format nên hiếm khi parse lỗi — fail-open để không chặn UX khi có trục trặc.
    return { ok: true, issues: [] };
  }
}
