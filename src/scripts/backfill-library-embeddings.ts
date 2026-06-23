import dotenv from "dotenv";
dotenv.config();

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Thiếu biến môi trường Supabase.");
  process.exit(1);
}
if (!GEMINI_API_KEY) {
  console.error("❌ Thiếu GEMINI_API_KEY.");
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_DIM = 768;

interface LibraryItemRow {
  id: string;
  title: string;
  description: string | null;
  tags: string[] | null;
  prompt_text: string | null;
}

function buildEmbeddingText(item: Pick<LibraryItemRow, "title" | "description" | "tags" | "prompt_text">): string {
  return [
    item.title,
    item.description,
    item.tags?.join(", "),
    item.prompt_text,
  ].filter(Boolean).join("\n");
}

async function embedText(text: string): Promise<number[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: { parts: [{ text }] },
      embedContentConfig: { outputDimensionality: EMBEDDING_DIM },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any;
    throw new Error(`Gemini embedding API lỗi: ${err.error?.message ?? res.status}`);
  }

  const data = await res.json() as any;
  const values: number[] = data.embedding?.values ?? [];
  if (!values.length) throw new Error("Gemini không trả về embedding hợp lệ");

  // API hiện tại bỏ qua embedContentConfig.outputDimensionality và luôn trả 3072 chiều —
  // gemini-embedding-001 là Matryoshka embedding nên cắt prefix vẫn giữ chất lượng tốt.
  return values.length > EMBEDDING_DIM ? values.slice(0, EMBEDDING_DIM) : values;
}

async function runBackfill() {
  console.log("🚀 Bắt đầu backfill embedding cho library_items...");

  const { data, error } = await supabaseAdmin
    .from("library_items")
    .select("id, title, description, tags, prompt_text")
    .is("embedding", null);

  if (error) {
    console.error("❌ Lỗi đọc library_items:", error.message);
    return;
  }

  const items = (data ?? []) as LibraryItemRow[];
  console.log(`Tìm thấy ${items.length} mục chưa có embedding.`);

  let done = 0;
  for (const item of items) {
    const text = buildEmbeddingText(item);
    if (!text.trim()) {
      console.log(`⏭️  Bỏ qua "${item.title}" (không có text để embed).`);
      continue;
    }

    try {
      const vector = await embedText(text);
      const { error: updateError } = await supabaseAdmin
        .from("library_items")
        .update({ embedding: vector })
        .eq("id", item.id);

      if (updateError) throw updateError;
      done++;
      console.log(`✅ [${done}/${items.length}] ${item.title}`);
    } catch (err: any) {
      console.error(`❌ Lỗi "${item.title}":`, err.message);
    }

    // throttle nhẹ để tránh chạm rate limit của Gemini embedding API
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log("🎉 Hoàn tất backfill embeddings.");
}

runBackfill();
