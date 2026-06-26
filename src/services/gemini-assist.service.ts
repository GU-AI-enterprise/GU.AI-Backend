// Tác vụ phụ dùng Gemini trong Studio: gợi ý prompt tiếng Anh + verify ảnh đầu vào.
// Thay cho "Trợ lý ảo" (workflow chat) đã bị bỏ — xem docs/09-tro-ly-ao-danh-gia-va-de-xuat.md.
// Model cố định ở backend (không cho user chọn) vì đây là tác vụ hỗ trợ, không phải tính năng chính.

import { createHash } from 'crypto';

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

const hash = (buf: Buffer | string) => createHash('sha1').update(buf).digest('hex');

function inlineImagePart(image: { buffer: Buffer; mimeType: string }) {
  return { inlineData: { mimeType: image.mimeType, data: image.buffer.toString('base64') } };
}

// ── Gợi ý prompt (text + multimodal tuỳ chọn) ────────────────────────────────
// Tái sử dụng tinh thần "Quy tắc điền params.prompt" từng có trong workflow.rules.ts.
// Dedupe in-flight: nhiều request giống nhau cùng lúc (vd. double-click) dùng chung 1 lần gọi Gemini
// thay vì bắn trùng — không cache kết quả lâu dài vì user có thể chủ ý bấm lại để có gợi ý khác.

const SUGGEST_PROMPT_SYSTEM = `Bạn là chuyên gia viết prompt tiếng Anh cho công cụ AI tạo/chỉnh ảnh thời trang.

Nhiệm vụ: dựa vào tool đang dùng, ý tưởng ngắn (có thể bằng tiếng Việt) của user, và ảnh tham chiếu nếu có, viết lại thành 1 prompt tiếng Anh chuyên nghiệp, súc tích (1-2 câu, tối đa ~40 từ).

Quy tắc:
- Mô tả đầy đủ chi tiết liên quan: đặc điểm người mẫu (giới tính, dáng người, sắc tộc nếu được nêu), trang phục, tư thế, background, ánh sáng — bất kỳ chi tiết nào user đề cập.
- Nếu có ảnh kèm theo: quan sát kỹ màu sắc, kiểu dáng, chi tiết thực tế trong ảnh (trang phục, bối cảnh, người mẫu) và đưa vào prompt để mô tả chính xác hơn — không bịa chi tiết không thấy trong ảnh.
- Nếu user không cho ý tưởng cụ thể và không có ảnh: tự đề xuất 1 prompt mẫu hợp lý cho loại tool đó.
- CHỈ trả về đúng nội dung prompt tiếng Anh, KHÔNG giải thích, KHÔNG markdown, KHÔNG đặt trong dấu ngoặc kép.`;

export interface SuggestPromptInput {
  tool: string;
  userHint: string;
  image?: { buffer: Buffer; mimeType: string };
}

const suggestPromptInFlight = new Map<string, Promise<string>>();

export async function suggestPrompt({ tool, userHint, image }: SuggestPromptInput): Promise<string> {
  const key = `${tool}|${userHint.trim()}|${image ? hash(image.buffer) : ''}`;

  const existing = suggestPromptInFlight.get(key);
  if (existing) return existing;

  const task = (async () => {
    const userText = userHint.trim()
      ? `Tool: ${tool}\nÝ tưởng của user: ${userHint.trim()}`
      : `Tool: ${tool}\nUser chưa có ý tưởng cụ thể — hãy tự đề xuất 1 prompt mẫu phù hợp.`;

    const parts: Record<string, unknown>[] = [{ text: userText }];
    if (image) parts.push(inlineImagePart(image));

    const data = await callGemini({
      systemInstruction: { parts: [{ text: SUGGEST_PROMPT_SYSTEM }] },
      contents: [{ role: 'user', parts }],
      // thinkingBudget: 0 — tắt "thinking" của Gemini 2.5 Flash. Task này không cần suy luận sâu,
      // và nếu không tắt, token thinking sẽ ăn vào chung ngân sách maxOutputTokens khiến câu trả lời
      // bị cắt cụt giữa câu (đã gặp thực tế: "A beautiful Asian woman wearing a pink" — hết token).
      generationConfig: { temperature: 0.6, maxOutputTokens: 200, thinkingConfig: { thinkingBudget: 0 } },
    });

    const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    return text.trim().replace(/^["']|["']$/g, '');
  })();

  suggestPromptInFlight.set(key, task);
  try {
    return await task;
  } finally {
    suggestPromptInFlight.delete(key);
  }
}

// ── Verify ảnh đầu vào (multimodal + structured output) ──────────────────────
// Dùng responseSchema chính thức của Gemini — không parse text bằng regex như planner cũ.
// Cache theo hash ảnh + loại mong đợi: cùng 1 ảnh verify nhiều lần (re-render, chọn lại ảnh cũ)
// trả kết quả cũ trong TTL thay vì gọi lại Gemini.

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

const VERIFY_CACHE_TTL_MS = 10 * 60 * 1000; // 10 phút
const verifyImageCache = new Map<string, { result: VerifyImageResult; expiresAt: number }>();

function getCachedVerify(key: string): VerifyImageResult | null {
  const entry = verifyImageCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { verifyImageCache.delete(key); return null; }
  return entry.result;
}

function setCachedVerify(key: string, result: VerifyImageResult): void {
  // Dọn cache hết hạn định kỳ thay vì để Map phình vô hạn (không cần cron riêng cho 1 Map nhỏ).
  if (verifyImageCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of verifyImageCache) if (now > v.expiresAt) verifyImageCache.delete(k);
  }
  verifyImageCache.set(key, { result, expiresAt: Date.now() + VERIFY_CACHE_TTL_MS });
}

// ── Trợ lý AI Studio (chat hỏi-đáp) ───────────────────────────────────────────
// KHÔNG phải "Trợ lý ảo" cũ đã bị bỏ (xem docs/09-tro-ly-ao-danh-gia-va-de-xuat.md):
// đây chỉ trả lời text về cách dùng Studio, KHÔNG lập plan, KHÔNG tự chạy tool nào,
// KHÔNG lưu hội thoại ở server — client tự giữ history và gửi kèm mỗi lượt.

export interface StudioChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const STUDIO_CHAT_SYSTEM = `Bạn là trợ lý AI của GU.AI Studio — công cụ tạo/chỉnh ảnh & video thời trang bằng AI.

Các công cụ hiện có trong Studio:
- Virtual Try-On v1.6: thử trang phục lên ảnh người mẫu thực, nhanh, dùng cho e-commerce.
- Try-On Max: try-on chất lượng studio, hỗ trợ 4K, dùng cho catalog/marketing.
- Product to Model: biến ảnh sản phẩm thành ảnh người mẫu đang mặc sản phẩm, không cần ảnh người mẫu.
- Model Swap: đổi người mẫu trong ảnh, giữ nguyên trang phục/pose/bối cảnh.
- Face to Model: biến ảnh mặt/headshot thành avatar upper-body cho try-on.
- Edit Image: chỉnh sửa ảnh theo mô tả tự nhiên (đổi pose, thêm phụ kiện, ánh sáng...).
- Create Model: tạo ảnh người mẫu thời trang từ mô tả văn bản, không cần ảnh đầu vào.
- Image to Video: biến ảnh tĩnh thành video ngắn 5-10 giây.
- Reframe: đổi tỉ lệ khung hình ảnh bằng AI outpainting thông minh.
- Remove Background: xóa nền ảnh, xuất PNG trong suốt.
- Upscale: tăng độ phân giải ảnh, giữ chi tiết/texture.

Nhiệm vụ: trả lời ngắn gọn, đúng trọng tâm câu hỏi của user về cách dùng các công cụ trên, cách viết prompt, hoặc nên dùng tool nào cho nhu cầu của họ. Trả lời bằng tiếng Việt (trừ khi user hỏi bằng ngôn ngữ khác), giọng thân thiện, ngắn gọn (tối đa 4-5 câu).

Giới hạn quan trọng: bạn KHÔNG thể tự chạy/thực thi bất kỳ công cụ nào, KHÔNG thể upload/xử lý ảnh hộ user — chỉ hướng dẫn user tự thực hiện trên giao diện Studio. Nếu câu hỏi không liên quan đến GU.AI Studio, lịch sự từ chối và hướng user quay lại chủ đề.`;

const STUDIO_CHAT_MAX_HISTORY = 12; // giới hạn context gửi lên Gemini mỗi lượt, tránh phình token

export async function studioChat(messages: StudioChatMessage[]): Promise<string> {
  const trimmed = messages.slice(-STUDIO_CHAT_MAX_HISTORY);
  const contents = trimmed.map((m) => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content }],
  }));

  const data = await callGemini({
    systemInstruction: { parts: [{ text: STUDIO_CHAT_SYSTEM }] },
    contents,
    generationConfig: { temperature: 0.5, maxOutputTokens: 300, thinkingConfig: { thinkingBudget: 0 } },
  });

  const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return text.trim() || 'Xin lỗi, mình chưa có câu trả lời phù hợp. Bạn thử hỏi lại theo cách khác nhé.';
}

export async function verifyImage(
  imageBuffer: Buffer,
  mimeType: string,
  expectedType: ExpectedImageType,
): Promise<VerifyImageResult> {
  const cacheKey = `${hash(imageBuffer)}:${expectedType}`;
  const cached = getCachedVerify(cacheKey);
  if (cached) return cached;

  const prompt = `Đánh giá ảnh này có dùng được làm "${EXPECTED_TYPE_HINTS[expectedType]}" không.
Chỉ báo lỗi (ok=false) nếu ảnh THỰC SỰ không dùng được — vd: không có mặt người khi cần ảnh mặt, ảnh quá mờ/tối/nhỏ không nhìn rõ nội dung chính, hoặc nội dung không phù hợp.
Bỏ qua lỗi nhỏ/chủ quan (góc chụp, ánh sáng hơi yếu, bố cục) — những trường hợp đó vẫn ok=true.`;

  const data = await callGemini({
    contents: [{
      role: 'user',
      parts: [{ text: prompt }, inlineImagePart({ buffer: imageBuffer, mimeType })],
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 300,
      thinkingConfig: { thinkingBudget: 0 }, // tắt thinking — JSON ngắn, không cần suy luận sâu, tránh bị cắt cụt
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
  let result: VerifyImageResult;
  try {
    const parsed = JSON.parse(text);
    result = { ok: parsed.ok !== false, issues: Array.isArray(parsed.issues) ? parsed.issues : [] };
  } catch {
    // responseSchema đã ép format nên hiếm khi parse lỗi — fail-open để không chặn UX khi có trục trặc.
    result = { ok: true, issues: [] };
  }

  setCachedVerify(cacheKey, result);
  return result;
}
