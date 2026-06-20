import fs from 'fs';
import path from 'path';
import mime from 'mime-types';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;

const FOLDER_PATH = "D:\\Downloads\\poses"; 

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !GEMINI_API_KEY) {
  console.error("❌ Thiếu biến môi trường.");
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

function parseLLMJson(text: string) {
  try {
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```([\s\S]*?)```/);
    if (jsonMatch && jsonMatch[1]) {
      return JSON.parse(jsonMatch[1].trim());
    }
    return JSON.parse(text.trim());
  } catch (e) {
    console.error("Lỗi parse JSON từ LLM:", text);
    return null;
  }
}

async function processPose(filePath: string) {
  const fileName = path.basename(filePath);
  const mimeType = mime.lookup(filePath) || 'image/jpeg';
  const fileBuffer = fs.readFileSync(filePath);
  
  console.log(`\n===========================================`);
  console.log(`🖼 Đang xử lý dáng ảnh: ${fileName}`);

  try {
    console.log(`🤖 Đang nhờ Gemini phân tích...`);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const prompt = `Đây là một bức ảnh tham chiếu dáng đứng/ngồi (pose) của một người mẫu (ưu tiên phong cách Việt Nam).
    Hãy phân tích dáng điệu, tư thế tay chân của người mẫu.
    Trọng tâm là DÁNG ẢNH, chứ không phải bộ quần áo.
    
    Hãy trả về ĐÚNG VÀ CHỈ 1 OBJECT JSON với các trường:
    {
      "title": "Tên dáng ngắn gọn, hấp dẫn (Tiếng Việt, ví dụ: Góc nghiêng nàng thơ, Dáng đứng bắt chéo chân)",
      "description": "Mô tả tư thế, góc chụp, biểu cảm (Tiếng Việt, ngắn gọn 1-2 câu)",
      "tags": ["dáng đứng", "street style", "từ khóa 3"]
    }`;

    const result = await model.generateContent([
      {
        inlineData: {
          data: fileBuffer.toString("base64"),
          mimeType: mimeType
        }
      },
      prompt
    ]);

    const metadata = parseLLMJson(result.response.text());
    if (!metadata) {
      console.error(`❌ Không lấy được JSON cho ${fileName}.`);
      return;
    }

    console.log(`✅ Phân tích xong: ${metadata.title}`);

    console.log(`☁️ Đang upload lên Supabase Storage...`);
    const storagePath = `library/poses/${Date.now()}_${fileName}`;
    const { error: uploadError } = await supabaseAdmin
      .storage
      .from('assets')
      .upload(storagePath, fileBuffer, { contentType: mimeType });

    if (uploadError) {
      console.error(`❌ Lỗi upload ${fileName}:`, uploadError.message);
      return;
    }

    const { data: { publicUrl } } = supabaseAdmin.storage.from('assets').getPublicUrl(storagePath);

    console.log(`💾 Đang lưu dữ liệu vào bảng library_items...`);
    const { error: dbError } = await supabaseAdmin
      .from('library_items')
      .insert([{
        category: 'pose',
        title: metadata.title,
        description: metadata.description,
        tags: metadata.tags,
        image_url: publicUrl,
        prompt_text: null,
        img_aspect: 'tall'
      }]);

    if (dbError) {
      console.error(`❌ Lỗi insert DB ${fileName}:`, dbError.message);
      return;
    }

    console.log(`🎉 Thành công!`);

  } catch (error: any) {
    console.error(`❌ Lỗi trong quá trình xử lý ${fileName}:`, error.message);
  }
}

async function runSeeder() {
  console.log("🚀 Bắt đầu tiến trình làm mới thư viện Dáng ảnh...");

  // 1. Xóa toàn bộ row category = 'pose'
  console.log("🧹 Đang xóa các dữ liệu pose cũ trong DB...");
  const { error: deleteError } = await supabaseAdmin
    .from('library_items')
    .delete()
    .eq('category', 'pose');

  if (deleteError) {
    console.error("❌ Lỗi khi xóa dữ liệu cũ:", deleteError.message);
    process.exit(1);
  }
  console.log("✅ Đã dọn dẹp sạch sẽ.");

  // 2. Quét file mới
  if (!fs.existsSync(FOLDER_PATH)) {
    console.error(`❌ Không tìm thấy thư mục ${FOLDER_PATH}`);
    process.exit(1);
  }

  const files = fs.readdirSync(FOLDER_PATH);
  const imageFiles = files.filter(file => /\.(jpg|jpeg|png|webp)$/i.test(file));

  if (imageFiles.length === 0) {
    console.log(`⚠️ Không tìm thấy file ảnh nào trong ${FOLDER_PATH}`);
    return;
  }

  console.log(`📷 Tìm thấy ${imageFiles.length} ảnh. Bắt đầu phân tích...`);

  for (const file of imageFiles) {
    await processPose(path.join(FOLDER_PATH, file));
  }
  
  console.log(`\n===========================================`);
  console.log(`🏆 Quá trình cập nhật Dáng ảnh đã hoàn tất!`);
}

runSeeder();
