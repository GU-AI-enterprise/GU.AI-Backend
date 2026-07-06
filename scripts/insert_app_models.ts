import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const MODELS_DIR = path.resolve(__dirname, '../../models');

type PlanTier = 'free' | 'basic' | 'pro' | 'agency';

interface AnalyzedModel {
  filename: string;
  buffer: Buffer;
  mimeType: string;
  name: string;
  gender: 'male' | 'female' | 'unisex';
  tags: string[];
  score: number;
}

function getMimeType(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

async function uploadToStorage(buffer: Buffer, filename: string, mimeType: string): Promise<string> {
  const ext = filename.split('.').pop();
  const safeFilename = `${Date.now()}_img_${Math.random().toString(36).substring(7)}.${ext}`;
  const path = `app-models/${safeFilename}`;
  const { error } = await supabase.storage
    .from('models')
    .upload(path, buffer, { contentType: mimeType, upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  const { data } = supabase.storage.from('models').getPublicUrl(path);
  return data.publicUrl;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function analyzeImage(filename: string, buffer: Buffer, mimeType: string, forcedGender: 'female' | 'male'): Promise<Omit<AnalyzedModel, 'filename' | 'buffer' | 'mimeType'>> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  
  const prompt = `You are an expert AI fashion curator. Analyze this image of a virtual fashion model.
IMPORTANT CONTEXT: This model is strictly a ${forcedGender.toUpperCase()}.
Provide a JSON response with the following format (no markdown):
{
  "name": "A suitable Vietnamese name for this model (e.g., 'Minh', 'Linh', 'Hoàng', 'Hương')",
  "gender": "${forcedGender}",
  "tags": ["tag1", "tag2", "tag3"],
  "score": a number from 1 to 100 assessing the aesthetic quality, realism, lighting, and fashion appeal of the image.
}`;

  const imagePart = {
    inlineData: {
      data: buffer.toString("base64"),
      mimeType
    },
  };

  try {
    const result = await model.generateContent([prompt, imagePart]);
    const responseText = result.response.text();
    let cleanedText = responseText.trim();
    if (cleanedText.startsWith('\`\`\`json')) cleanedText = cleanedText.slice(7);
    if (cleanedText.startsWith('\`\`\`')) cleanedText = cleanedText.slice(3);
    if (cleanedText.endsWith('\`\`\`')) cleanedText = cleanedText.slice(0, -3);
    
    const parsed = JSON.parse(cleanedText);
    return {
      name: parsed.name || 'Người mẫu AI',
      gender: forcedGender,
      tags: parsed.tags || [],
      score: parsed.score || 50
    };
  } catch (error: any) {
    console.error(`Error analyzing ${filename}:`, error.message);
    return { name: 'Người mẫu AI', gender: forcedGender, tags: ['AI Model'], score: 50 };
  }
}

async function run() {
  console.log('1. Đang quét thư mục:', MODELS_DIR);
  const files = fs.readdirSync(MODELS_DIR).filter(f => !f.startsWith('.'));
  console.log(`=> Tìm thấy ${files.length} ảnh.`);

  const analyzedModels: AnalyzedModel[] = [];

  console.log('\n2. Đang phân tích hình ảnh bằng AI...');
  for (let i = 0; i < files.length; i++) {
    const filename = files[i];
    console.log(`   [${i + 1}/${files.length}] Phân tích ${filename}...`);
    const filepath = path.join(MODELS_DIR, filename);
    const buffer = fs.readFileSync(filepath);
    const mimeType = getMimeType(filename);
    
    const baseName = filename.split('.')[0];
    const isNamed = !baseName.includes('Gemini') && !baseName.includes('-');
    const forcedGender = isNamed ? 'female' : 'male';
    
    const analysis = await analyzeImage(filename, buffer, mimeType, forcedGender);
    if (isNamed) {
      analysis.name = baseName;
    }
    
    analyzedModels.push({
      filename,
      buffer,
      mimeType,
      ...analysis
    });
    
    await sleep(2500);
  }

  console.log('\n3. Sắp xếp và phân bổ tier...');
  analyzedModels.sort((a, b) => b.score - a.score);

  const total = analyzedModels.length;
  const qAgency = Math.max(1, Math.floor(total * 0.40));
  const qPro = Math.max(1, Math.floor(total * 0.30));
  const qBasic = Math.max(1, Math.floor(total * 0.20));

  for (let i = 0; i < total; i++) {
    const item = analyzedModels[i];
    let tier: PlanTier = 'free';
    if (i < qAgency) tier = 'agency';
    else if (i < qAgency + qPro) tier = 'pro';
    else if (i < qAgency + qPro + qBasic) tier = 'basic';
    else tier = 'free';
    
    console.log(`   - [${item.score}đ] ${item.name} -> ${tier.toUpperCase()}`);
    
    console.log(`     Uploading...`);
    const imageUrl = await uploadToStorage(item.buffer, item.filename, item.mimeType);
    
    console.log(`     Inserting to DB...`);
    const { error } = await supabase.from('app_models').insert({
      name: item.name,
      image_url: imageUrl,
      gender: item.gender,
      tags: item.tags,
      required_tier: tier,
      display_order: i,
      is_active: true
    });
    if (error) {
      console.error(`     ! Lỗi insert: ${error.message}`);
    } else {
      console.log(`     -> OK.`);
    }
  }

  console.log('\nHoàn tất quá trình quét, phân tích và upload!');
}

run().catch(console.error);
