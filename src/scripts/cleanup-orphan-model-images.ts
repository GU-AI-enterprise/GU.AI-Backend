import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUCKET = 'models';
const FOLDER = 'app-models';
const CONFIRM = process.argv.includes('--confirm');

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong .env');
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function extractPath(imageUrl: string): string | null {
  const marker = `/${BUCKET}/`;
  const idx = imageUrl.indexOf(marker);
  if (idx === -1) return null;
  return imageUrl.slice(idx + marker.length);
}

async function listAllObjects(folder: string): Promise<{ name: string; size: number }[]> {
  const all: { name: string; size: number }[] = [];
  const limit = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await supabaseAdmin.storage.from(BUCKET).list(folder, { limit, offset });
    if (error) throw new Error(`List lỗi: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const obj of data) {
      if (obj.id) all.push({ name: `${folder}/${obj.name}`, size: Number((obj.metadata as any)?.size ?? 0) });
    }
    if (data.length < limit) break;
    offset += limit;
  }
  return all;
}

async function main() {
  const { data: rows, error } = await supabaseAdmin.from('app_models').select('id, name, image_url');
  if (error) throw new Error(`Query app_models lỗi: ${error.message}`);

  const referenced = new Set(
    (rows ?? []).map((r) => extractPath(r.image_url)).filter((p): p is string => !!p)
  );
  console.log(`Đang tham chiếu ${referenced.size} ảnh từ ${rows?.length ?? 0} dòng app_models (kể cả is_active=false).`);

  const objects = await listAllObjects(FOLDER);
  console.log(`Tìm thấy ${objects.length} file trong bucket '${BUCKET}/${FOLDER}'.`);

  const orphans = objects.filter((o) => !referenced.has(o.name));
  const orphanSize = orphans.reduce((s, o) => s + o.size, 0);

  console.log(`\n=== ${orphans.length} ảnh THỪA (không thuộc dòng app_models nào) ===`);
  orphans.forEach((o) => console.log(`  ${o.name}  (${(o.size / 1024).toFixed(1)} KB)`));
  console.log(`\nTổng dung lượng thừa: ${(orphanSize / 1024 / 1024).toFixed(2)} MB`);

  if (!CONFIRM) {
    console.log(`\n(Dry-run) Không có gì bị xóa. Chạy lại với flag --confirm để XÓA THẬT các file trên.`);
    return;
  }

  if (orphans.length === 0) {
    console.log('Không có gì để xóa.');
    return;
  }

  const paths = orphans.map((o) => o.name);
  const { data: removed, error: removeError } = await supabaseAdmin.storage.from(BUCKET).remove(paths);
  if (removeError) throw new Error(`Xóa lỗi: ${removeError.message}`);
  console.log(`✅ Đã xóa ${removed?.length ?? 0} file.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
