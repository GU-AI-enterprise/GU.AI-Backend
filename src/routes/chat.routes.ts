import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middlewares/auth.middleware';

const router = Router();
router.use(requireAuth);

const SYSTEM_PROMPT = `Bạn là trợ lý AI của nền tảng GU.AI — nền tảng AI thời trang dành cho thị trường Việt Nam.
Bạn giúp người dùng với các tính năng: Virtual Try-On, Product to Model, Đổi Model, Ghép khuôn mặt, Chỉnh sửa ảnh, Tạo Model, Ảnh sang Video, Đóng khung, Nâng độ nét, Xóa nền.
Cũng hỗ trợ về quản lý credits, kho lưu trữ, bộ sưu tập, lịch sử tác vụ và thanh toán.
Trả lời ngắn gọn, thân thiện, bằng tiếng Việt. Nếu không biết câu trả lời, hãy nói thẳng.`;

router.post('/', async (req: AuthRequest, res: Response) => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    res.status(500).json({ success: false, error: 'Groq chưa được cấu hình trên server' });
    return;
  }

  const { messages } = req.body as { messages: { role: string; content: string }[] };
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ success: false, error: 'messages là bắt buộc' });
    return;
  }

  // Giữ tối đa 20 tin nhắn gần nhất để tránh overflow token
  const trimmed = messages.slice(-20);

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...trimmed],
        max_tokens: 1024,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const err = await response.json() as any;
      res.status(502).json({ success: false, error: err.error?.message ?? `Groq HTTP ${response.status}` });
      return;
    }

    const data = await response.json() as any;
    const reply: string = data.choices?.[0]?.message?.content ?? '';
    res.json({ success: true, data: { reply } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message ?? 'Lỗi không xác định' });
  }
});

export default router;
