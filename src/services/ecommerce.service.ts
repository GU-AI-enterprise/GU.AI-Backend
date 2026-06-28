import sharp from 'sharp';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export const generateEcommerceSeo = async (imageUrl: string): Promise<any> => {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error('Không thể tải ảnh từ URL');
  const arrayBuffer = await response.arrayBuffer();
  const imageBuffer = Buffer.from(arrayBuffer);

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const prompt = `Bạn là chuyên gia Marketing cho các nhãn hàng thời trang trên Shopee, TikTok Shop.
Hãy xem bức ảnh sản phẩm này và viết:
1. [TIÊU ĐỀ SẢN PHẨM] Chuẩn SEO, giật tít, có từ khóa thu hút.
2. [MÔ TẢ SẢN PHẨM] Hấp dẫn, sáng tạo, kêu gọi mua hàng (Call to Action).
3. [HASHTAGS] 10 hashtag thịnh hành nhất.

BẮT BUỘC trả về kết quả ở định dạng JSON thô (không có block code \`\`\`json).
Cấu trúc JSON yêu cầu:
{
  "title": "string",
  "description": "string",
  "hashtags": "string"
}`;
    // Compress image slightly to save API payload limits if it's too big, but usually it's fine.
    const jpegBuffer = await sharp(imageBuffer).resize(800).jpeg().toBuffer();
    const aiResult = await model.generateContent([prompt, { inlineData: { data: jpegBuffer.toString('base64'), mimeType: 'image/jpeg' } }]);
    
    let text = aiResult.response.text().trim();
    // Clean up potential markdown formatting from Gemini
    if (text.startsWith('\`\`\`json')) {
      text = text.replace(/^\`\`\`json/, '').replace(/\`\`\`$/, '').trim();
    }
    
    return JSON.parse(text);
  } catch (err: any) {
    console.error("Gemini SEO Error:", err.message);
    throw new Error("Không thể phân tích ảnh bằng AI: " + err.message);
  }
};
