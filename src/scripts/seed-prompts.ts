import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Thiếu biến môi trường.");
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const dataToSeed = [
  // ── DÁNG ẢNH (POSE) - THUẦN VIỆT ──
  {
    category: "pose",
    title: "Dáng đứng thướt tha áo dài",
    description: "Tư thế đứng thẳng, hai tay khép hờ ngang eo, mang lại nét duyên dáng chuẩn phụ nữ Việt.",
    tags: ["áo dài", "duyên dáng", "đứng thẳng"],
    image_url: "https://images.unsplash.com/photo-1595152772835-219674b2a8a6?w=600&q=80",
    prompt_text: null,
    img_aspect: "tall"
  },
  {
    category: "pose",
    title: "Dạo phố đi bộ Nguyễn Huệ",
    description: "Góc máy bắt khoảnh khắc đang bước đi tự nhiên, phù hợp với phong cách thời trang đường phố.",
    tags: ["bước đi", "street style", "năng động"],
    image_url: "https://images.unsplash.com/photo-1532453288672-3a27e9be9efd?w=600&q=80",
    prompt_text: null,
    img_aspect: "tall"
  },
  {
    category: "pose",
    title: "Góc nghiêng Cà phê Bệt",
    description: "Tư thế ngồi thoải mái, vắt chéo chân, nhìn nghiêng. Rất tôn dáng cho các bộ váy ngắn hoặc đồ casual.",
    tags: ["ngồi", "cà phê", "thư giãn"],
    image_url: "https://images.unsplash.com/photo-1492633423870-43d1cd2775eb?w=600&q=80",
    prompt_text: null,
    img_aspect: "portrait"
  },
  {
    category: "pose",
    title: "Cận cảnh sắc sảo Á Đông",
    description: "Chụp góc cận (close-up) khoe đường nét khuôn mặt Á Đông, phù hợp thử nghiệm trang sức hoặc cổ áo.",
    tags: ["cận mặt", "beauty", "Á Đông"],
    image_url: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=600&q=80",
    prompt_text: null,
    img_aspect: "square"
  },
  {
    category: "pose",
    title: "Xoay người đón nắng",
    description: "Tạo dáng quay lưng và ngoái đầu nhìn lại, làm nổi bật phần lưng áo và phom dáng của tà váy.",
    tags: ["quay lưng", "nghệ thuật", "nàng thơ"],
    image_url: "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=600&q=80",
    prompt_text: null,
    img_aspect: "portrait"
  },

  // ── PROMPT MẪU - THUẦN VIỆT ──
  {
    category: "prompt",
    title: "Nữ sinh áo dài trắng",
    description: "Gợi ý tạo hình nữ sinh thướt tha trong tà áo dài trắng dưới sân trường ngập nắng.",
    tags: ["áo dài", "nữ sinh", "thanh xuân"],
    image_url: null,
    prompt_text: "A beautiful Vietnamese high school girl wearing a traditional pure white Ao Dai, standing gracefully under the shade of a flamboyant tree in a sunny school yard, soft morning sunlight, photorealistic, 8k resolution, highly detailed face.",
    img_aspect: "portrait"
  },
  {
    category: "prompt",
    title: "Chàng trai Hà Nội mùa thu",
    description: "Tạo hình một nam thanh niên mang phong cách hoài cổ, dạo bước dưới hàng cây rụng lá.",
    tags: ["Hà Nội", "mùa thu", "lịch lãm"],
    image_url: null,
    prompt_text: "A handsome Vietnamese young man wearing a vintage brown trench coat and scarf, walking casually on a street in Hanoi during autumn, golden yellow leaves falling, cinematic lighting, nostalgic mood, 35mm photography.",
    img_aspect: "portrait"
  },
  {
    category: "prompt",
    title: "Nét đẹp Cổ phục Nhật Bình",
    description: "Prompt tối ưu để tạo hình người mẫu diện trang phục truyền thống hoàng cung Việt Nam.",
    tags: ["cổ phục", "Nhật Bình", "hoàng cung"],
    image_url: null,
    prompt_text: "An elegant Vietnamese woman wearing a traditional royal Nhat Binh dress with intricate embroidered patterns, standing inside the ancient Hue Imperial City, rich vibrant colors, royal aesthetic, masterpiece, highly detailed.",
    img_aspect: "portrait"
  },
  {
    category: "prompt",
    title: "Streetwear Dân chơi Sài Gòn",
    description: "Phong cách đường phố đậm chất GenZ Sài Gòn, kết hợp ánh sáng neon ban đêm.",
    tags: ["Sài Gòn", "streetwear", "GenZ"],
    image_url: null,
    prompt_text: "A trendy Vietnamese GenZ boy wearing an oversized graphic t-shirt, cargo pants, and chunky sneakers, posing confidently in a Saigon alleyway at night, neon signs reflecting on the wet street, cyberpunk vibe, 8k, ultra realistic.",
    img_aspect: "tall"
  },
  {
    category: "prompt",
    title: "Nàng thơ đồng lúa",
    description: "Concept chụp ảnh ngoại cảnh đồng quê yên bình, mộc mạc và trong trẻo.",
    tags: ["đồng quê", "yên bình", "nàng thơ"],
    image_url: null,
    prompt_text: "A pure Vietnamese girl in a simple white linen summer dress, standing in the middle of a golden ripe rice field at sunset in Ninh Binh, soft warm lighting, gentle breeze blowing her hair, peaceful atmosphere, photorealistic.",
    img_aspect: "landscape"
  }
];

async function runSeed() {
  console.log("🚀 Bắt đầu thêm dữ liệu Pose & Prompt Thuần Việt...");

  for (const item of dataToSeed) {
    const { error } = await supabaseAdmin
      .from('library_items')
      .insert([item]);
    
    if (error) {
      console.error(`❌ Lỗi khi thêm [${item.category}] ${item.title}:`, error.message);
    } else {
      console.log(`✅ Đã thêm: ${item.title}`);
    }
  }

  console.log("🎉 Hoàn tất nạp dữ liệu!");
}

runSeed();
