import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const PROMPTS = [
  {
    category: "prompt",
    title: "Chụp ảnh tạp chí (High Fashion Editorial)",
    description: "Phong cách chụp ảnh tạp chí cao cấp, sử dụng ánh sáng gắt (hard light) và góc chụp sáng tạo, phù hợp với thời trang avant-garde.",
    tags: ["editorial", "vogue", "high-fashion"],
    prompt_text: "High fashion editorial photography, full body shot of a model, wearing avant-garde couture clothing, dramatic hard lighting, distinct shadows, stark contrast, clean studio background, shot on 85mm lens, highly detailed, 8k resolution, Vogue magazine cover aesthetic",
    img_aspect: "portrait"
  },
  {
    category: "prompt",
    title: "Sản phẩm thương mại (E-Commerce Studio)",
    description: "Prompt tối ưu cho chụp ảnh sản phẩm trên nền trắng, ánh sáng mềm, làm nổi bật chất liệu vải.",
    tags: ["e-commerce", "studio", "clean"],
    prompt_text: "Commercial fashion photography, model wearing casual elegant clothing, pure white background, soft diffused studio lighting, sharp focus on clothing texture, natural relaxed pose, professional catalog shot, ultra-realistic",
    img_aspect: "portrait"
  },
  {
    category: "prompt",
    title: "Đường phố năng động (Urban Streetwear)",
    description: "Phong cách đường phố bụi bặm, chân thực với ánh sáng tự nhiên và bối cảnh thành phố hiện đại.",
    tags: ["streetwear", "urban", "candid"],
    prompt_text: "Urban streetwear fashion photography, model walking confidently down a busy Tokyo street, neon signs reflecting, candid dynamic pose, shallow depth of field, blurred city background, shot on 35mm lens, edgy street style, realistic cinematic lighting",
    img_aspect: "portrait"
  },
  {
    category: "prompt",
    title: "Chụp đêm điện ảnh (Cinematic Night)",
    description: "Mô phỏng ánh sáng điện ảnh ban đêm (neon, bokeh) tạo cảm giác huyền bí và cuốn hút.",
    tags: ["cinematic", "night", "neon"],
    prompt_text: "Cinematic night fashion photography, model illuminated by glowing neon lights and street lamps, rainy wet street, beautiful bokeh effect, moody atmosphere, rich colors, 8k, photorealistic, cinematic grading",
    img_aspect: "landscape"
  },
  {
    category: "prompt",
    title: "Màu phim cổ điển (Vintage 35mm Film)",
    description: "Giả lập nước ảnh máy phim 35mm với độ nhiễu hạt (grain) và màu sắc hoài cổ, tông ấm.",
    tags: ["vintage", "film", "retro"],
    prompt_text: "Analog 35mm film photography, vintage fashion style, warm nostalgic color palette, natural sunlight glare, light leaks, subtle film grain texture, soft focus, retro aesthetic, Kodak Portra 400",
    img_aspect: "portrait"
  },
  {
    category: "prompt",
    title: "Nhiếp ảnh tối giản (Minimalist Studio)",
    description: "Phong cách tối giản, nền màu pastel trơn, nhấn mạnh vào hình khối và sự tinh tế của trang phục.",
    tags: ["minimalist", "pastel", "clean"],
    prompt_text: "Minimalist fashion photography, model standing in a completely empty room with solid pastel beige background, wearing elegant modern minimalist clothing, soft even lighting, negative space, serene mood, high resolution",
    img_aspect: "square"
  },
  {
    category: "prompt",
    title: "Thời trang công nghệ (Cyberpunk Techwear)",
    description: "Dành cho các trang phục mang hơi hướng tương lai, techwear, bối cảnh viễn tưởng.",
    tags: ["cyberpunk", "techwear", "futuristic"],
    prompt_text: "Cyberpunk fashion photography, model wearing futuristic techwear and tactical gear, dark gritty alleyway background, glowing LED accents, dramatic rim lighting, sci-fi aesthetic, highly detailed fabric, Unreal Engine 5 render style",
    img_aspect: "portrait"
  },
  {
    category: "prompt",
    title: "Kỳ nghỉ mùa hè (Sun-kissed Resort)",
    description: "Ánh sáng rực rỡ của mùa hè, nắng vàng, phù hợp với thời trang đi biển, váy maxi.",
    tags: ["summer", "resort", "sunny"],
    prompt_text: "Summer resort fashion photography, model wearing a flowing summer dress, standing on a beautiful tropical beach, golden hour sunlight, sun-kissed skin, clear blue sky, bright and airy, luxury vacation lifestyle",
    img_aspect: "portrait"
  },
  {
    category: "prompt",
    title: "Truyền thống Châu Á (Asian Heritage)",
    description: "Tôn vinh trang phục truyền thống Á Đông (Áo dài, Hanbok) với bối cảnh cổ kính.",
    tags: ["traditional", "heritage", "asian"],
    prompt_text: "Traditional Asian fashion photography, model wearing elegant traditional silk clothing, posing in a serene ancient temple garden, soft morning mist, cultural heritage, graceful posture, tranquil atmosphere, cinematic lighting",
    img_aspect: "portrait"
  },
  {
    category: "prompt",
    title: "Cận cảnh trang sức (Beauty & Jewelry Close-up)",
    description: "Góc chụp cận mặt (close-up) tập trung vào trang sức, phụ kiện và lớp trang điểm.",
    tags: ["jewelry", "close-up", "beauty"],
    prompt_text: "Beauty and jewelry close-up photography, extreme detail on model's face and luxury necklace, flawless makeup, macro lens, dramatic studio lighting highlighting the jewelry sparkle, clean background, 8k resolution, commercial beauty shot",
    img_aspect: "square"
  }
];

async function main() {
  console.log("Đang chèn 10 Prompt mẫu vào Database...");
  
  const { data, error } = await supabase
    .from('library_items')
    .insert(PROMPTS);

  if (error) {
    console.error("Lỗi khi chèn prompt:", error);
  } else {
    console.log("✅ Đã chèn thành công 10 Prompt mẫu siêu xịn!");
  }
}

main().catch(console.error);
