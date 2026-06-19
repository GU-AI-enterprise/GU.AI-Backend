import fs from 'fs';
import path from 'path';
import mime from 'mime-types';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Load biến môi trường
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const USER_ID = "21db86d2-3de3-40f9-a35d-639a67a505f0"; // ID mẫu của user admin để gán quyền sở hữu, hoặc lấy từ params

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !GEMINI_API_KEY) {
  console.error("❌ Thiếu biến môi trường. Vui lòng kiểm tra file .env");
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const FOLDER_PATH = "D:\\Downloads\\imgs"; // Thư mục chứa ảnh do User cung cấp

// Dùng regex để bóc tách JSON an toàn từ kết quả trả về của LLM
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

async function processImage(filePath: string) {
  const fileName = path.basename(filePath);
  const ext = path.extname(filePath);
  const mimeType = mime.lookup(filePath) || 'image/jpeg';
  const fileBuffer = fs.readFileSync(filePath);
  
  console.log(`\n===========================================`);
  console.log(`🖼 Đang xử lý: ${fileName}`);

  try {
    // 1. Nhờ Gemini đánh giá ảnh
    console.log(`🤖 Đang nhờ Gemini Vision phân tích...`);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const prompt = `Bạn là một trợ lý cho ứng dụng Virtual Try-On thời trang. Hãy phân tích hình ảnh này.
    Nếu là ảnh người mẫu mặc đồ bình thường -> category: "model".
    Nếu là ảnh người mẫu tạo dáng pose đặc thù để làm form dáng -> category: "reference" hoặc "pose".
    Nếu là cảnh đường phố, quán cafe, studio không có người -> category: "background".
    Nếu là ảnh áo/quần rời -> category: "product".
    
    Hãy trả về ĐÚNG VÀ CHỈ 1 OBJECT JSON với các trường:
    {
      "category": "model" | "pose" | "background" | "product",
      "title": "Tiêu đề hấp dẫn, ngắn gọn gọn (Tiếng Việt)",
      "description": "Mô tả ngắn gọn khoảng 1-2 câu (Tiếng Việt)",
      "tags": ["từ khóa 1", "từ khóa 2", "từ khóa 3"]
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

    const llmResponseText = result.response.text();
    const metadata = parseLLMJson(llmResponseText);

    if (!metadata) {
      console.error(`❌ Không lấy được JSON cho ${fileName}. Bỏ qua.`);
      return;
    }

    console.log(`✅ Gemini phân tích xong: [${metadata.category}] ${metadata.title}`);

    // 2. Upload lên Supabase Storage
    console.log(`☁️ Đang upload lên Supabase Storage...`);
    const storagePath = `library/${Date.now()}_${fileName}`;
    const { data: uploadData, error: uploadError } = await supabaseAdmin
      .storage
      .from('assets') // bucket assets
      .upload(storagePath, fileBuffer, {
        contentType: mimeType,
        upsert: false
      });

    if (uploadError) {
      console.error(`❌ Lỗi upload ${fileName}:`, uploadError.message);
      return;
    }

    // 3. Lấy Public URL
    const { data: { publicUrl } } = supabaseAdmin.storage.from('assets').getPublicUrl(storagePath);
    console.log(`🔗 URL: ${publicUrl}`);

    // 4. Lưu metadata vào DB (Bảng library_items)
    console.log(`💾 Đang lưu dữ liệu vào Database (bảng library_items)...`);
    
    // Phân tích tỷ lệ khung hình (đơn giản hóa)
    const imgAspect = metadata.category === 'pose' || metadata.category === 'model' ? 'tall' : 'landscape';

    const { data: assetData, error: dbError } = await supabaseAdmin
      .from('library_items')
      .insert([{
        category: metadata.category,
        title: metadata.title,
        description: metadata.description,
        tags: metadata.tags,
        image_url: publicUrl,
        prompt_text: null,
        img_aspect: imgAspect
      }])
      .select()
      .single();

    if (dbError) {
      console.error(`❌ Lỗi insert DB ${fileName}:`, dbError.message);
      return;
    }

    console.log(`🎉 Thành công! Asset ID: ${assetData.id}`);

  } catch (error: any) {
    console.error(`❌ Lỗi trong quá trình xử lý ${fileName}:`, error.message);
  }
}

async function runSeeder() {
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

  console.log(`🚀 Tìm thấy ${imageFiles.length} file ảnh. Bắt đầu quá trình Auto-Seeding...`);

  for (const file of imageFiles) {
    const filePath = path.join(FOLDER_PATH, file);
    await processImage(filePath);
  }
  
  console.log(`\n===========================================`);
  console.log(`🏆 Hoàn tất! Quá trình quét thư viện đã xong.`);
}

runSeeder();
