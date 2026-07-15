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

Nhiệm vụ: dựa vào tool đang dùng, ý tưởng ngắn (có thể bằng tiếng Việt) của user, và ảnh tham chiếu nếu có, viết thành 1 prompt tiếng Anh chuyên nghiệp, súc tích (1-2 câu, tối đa ~40 từ), kèm 1 lời giải thích ngắn bằng tiếng Việt.

Quy tắc viết prompt:
- Mô tả đầy đủ chi tiết liên quan: đặc điểm người mẫu (giới tính, dáng người, sắc tộc nếu được nêu), tư thế, background, ánh sáng — bất kỳ chi tiết nào user đề cập.
- QUAN TRỌNG — với các tool mà trang phục được lấy trực tiếp từ ảnh đầu vào (try_on, try_on_max, product_to_model, model_swap): TUYỆT ĐỐI KHÔNG miêu tả trang phục/quần áo/phụ kiện đang mặc trong prompt, kể cả trang phục nhìn thấy trong ảnh tham chiếu. Engine sẽ hiểu miêu tả đó là "giữ nguyên đồ này" và KHÔNG thay đồ. Chỉ miêu tả người mẫu, tư thế, bối cảnh, ánh sáng.
- Với các tool còn lại (create_model, edit, image_to_video...): được phép miêu tả trang phục nếu user muốn.
- Nếu có ảnh kèm theo: quan sát kỹ chi tiết thực tế trong ảnh (người mẫu, bối cảnh, ánh sáng — và trang phục CHỈ khi tool cho phép) để mô tả chính xác hơn — không bịa chi tiết không thấy trong ảnh.
- Nếu user không cho ý tưởng cụ thể và không có ảnh: tự đề xuất 1 prompt mẫu hợp lý cho loại tool đó.

Quy tắc giải thích (explanation):
- Viết bằng tiếng Việt, 1-2 câu, thân thiện.
- Giải thích VÌ SAO gợi ý như vậy, dựa trên chi tiết cụ thể quan sát được trong ảnh (nếu có) và ý tưởng user đưa ra — vd. "Ảnh của bạn là người mẫu nữ đứng trong studio nền xám nên mình gợi ý giữ ánh sáng studio và thêm tư thế tự nhiên hơn."
- Nếu tool thuộc nhóm thay trang phục, nhắc user ngắn gọn rằng prompt không miêu tả trang phục vì đồ sẽ lấy từ ảnh sản phẩm/trang phục đầu vào.`;

/** Tool mà trang phục lấy từ ảnh đầu vào — prompt miêu tả đồ sẽ khiến Fashn không thay đồ. */
const GARMENT_LOCKED_TOOLS = new Set(['try_on', 'try_on_max', 'product_to_model', 'model_swap']);

export interface SuggestPromptInput {
  tool: string;
  userHint: string;
  image?: { buffer: Buffer; mimeType: string };
}

export interface SuggestPromptResult {
  prompt: string;
  /** Giải thích tiếng Việt: vì sao gợi ý như vậy, dựa trên ảnh/ý tưởng — hiển thị cho user. */
  explanation: string;
}

const suggestPromptInFlight = new Map<string, Promise<SuggestPromptResult>>();

export async function suggestPrompt({ tool, userHint, image }: SuggestPromptInput): Promise<SuggestPromptResult> {
  const key = `${tool}|${userHint.trim()}|${image ? hash(image.buffer) : ''}`;

  const existing = suggestPromptInFlight.get(key);
  if (existing) return existing;

  const task = (async () => {
    let userText = userHint.trim()
      ? `Tool: ${tool}\nÝ tưởng của user: ${userHint.trim()}`
      : `Tool: ${tool}\nUser chưa có ý tưởng cụ thể — hãy tự đề xuất 1 prompt mẫu phù hợp.`;
    if (GARMENT_LOCKED_TOOLS.has(tool)) {
      userText += `\nLƯU Ý: tool này thay trang phục từ ảnh đầu vào — prompt KHÔNG được miêu tả trang phục.`;
    }

    const parts: Record<string, unknown>[] = [{ text: userText }];
    if (image) parts.push(inlineImagePart(image));

    const data = await callGemini({
      systemInstruction: { parts: [{ text: SUGGEST_PROMPT_SYSTEM }] },
      contents: [{ role: 'user', parts }],
      // thinkingBudget: 0 — tắt "thinking" của Gemini 2.5 Flash. Task này không cần suy luận sâu,
      // và nếu không tắt, token thinking sẽ ăn vào chung ngân sách maxOutputTokens khiến câu trả lời
      // bị cắt cụt giữa câu (đã gặp thực tế: "A beautiful Asian woman wearing a pink" — hết token).
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 400,
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            prompt: { type: 'STRING' },
            explanation: { type: 'STRING' },
          },
          required: ['prompt', 'explanation'],
        },
      },
    });

    const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    try {
      const parsed = JSON.parse(text);
      return {
        prompt: String(parsed.prompt ?? '').trim().replace(/^["']|["']$/g, ''),
        explanation: String(parsed.explanation ?? '').trim(),
      };
    } catch {
      // responseSchema đã ép format nên hiếm khi parse lỗi — fallback coi toàn bộ text là prompt.
      return { prompt: text.trim().replace(/^["']|["']$/g, ''), explanation: '' };
    }
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

/** Ảnh user đang chuẩn bị dùng cho tác vụ — đính kèm vào lượt hỏi mới nhất để trợ lý xem trực tiếp. */
export interface StudioChatImage {
  mimeType: string;
  data: string; // base64, không kèm prefix "data:..."
}

const STUDIO_CHAT_MAX_IMAGES = 4;

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

Nếu user gửi kèm ảnh họ đang chuẩn bị dùng cho tác vụ, bạn CÓ THỂ xem và nhận xét/tư vấn dựa trên nội dung ảnh đó (vd. góp ý ảnh có phù hợp với tool không, mô tả ảnh để gợi ý prompt). Khi đưa ra gợi ý hoặc lựa chọn (chọn tool nào, viết prompt gì) dựa trên ảnh, LUÔN giải thích ngắn gọn lý do dựa trên chi tiết cụ thể quan sát được trong ảnh — vd. "ảnh của bạn là ảnh sản phẩm nền trắng nên phù hợp với Product to Model".

Lưu ý khi gợi ý prompt cho các tool thay trang phục (Virtual Try-On, Try-On Max, Product to Model, Model Swap): prompt KHÔNG được miêu tả trang phục/quần áo — trang phục lấy trực tiếp từ ảnh đầu vào, miêu tả đồ trong prompt sẽ khiến engine giữ nguyên đồ cũ và không thay đồ. Chỉ miêu tả người mẫu, tư thế, bối cảnh, ánh sáng; nhắc user điều này khi liên quan.

Giới hạn quan trọng: bạn KHÔNG thể tự chạy/thực thi bất kỳ công cụ nào, KHÔNG thể tự upload/xử lý ảnh hộ user — chỉ hướng dẫn user tự thực hiện trên giao diện Studio. Nếu câu hỏi không liên quan đến GU.AI Studio, lịch sự từ chối và hướng user quay lại chủ đề.`;

const STUDIO_CHAT_MAX_HISTORY = 12; // giới hạn context gửi lên Gemini mỗi lượt, tránh phình token

export async function studioChat(messages: StudioChatMessage[], images: StudioChatImage[] = []): Promise<string> {
  const trimmed = messages.slice(-STUDIO_CHAT_MAX_HISTORY);
  const lastUserIndex = trimmed.map((m) => m.role).lastIndexOf('user');
  const contents = trimmed.map((m, i) => {
    const parts: Record<string, unknown>[] = [{ text: m.content }];
    if (i === lastUserIndex) {
      for (const img of images.slice(0, STUDIO_CHAT_MAX_IMAGES)) {
        parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
      }
    }
    return { role: m.role === 'user' ? 'user' : 'model', parts };
  });

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
