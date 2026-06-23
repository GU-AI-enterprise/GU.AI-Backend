-- RAG cho Thư viện: bật pgvector, thêm cột embedding cho library_items,
-- và hàm similarity search dùng cosine distance.
-- Chạy thủ công trong Supabase SQL Editor.

CREATE EXTENSION IF NOT EXISTS vector;

-- 768 chiều: Gemini model "gemini-embedding-001" trả mặc định 3072 chiều,
-- nhưng ta rút về 768 qua embedContentConfig.outputDimensionality khi gọi API
-- (768 là 1 trong các mức truncate được Google khuyến nghị, đỡ tốn lưu trữ/index hơn 3072).
ALTER TABLE public.library_items
  ADD COLUMN IF NOT EXISTS embedding vector(768);

CREATE INDEX IF NOT EXISTS library_items_embedding_hnsw_idx
  ON public.library_items
  USING hnsw (embedding vector_cosine_ops);

-- Trả về tối đa match_count item có cosine similarity >= min_similarity, sắp giảm dần.
-- Chỉ gọi qua supabaseAdmin (service role) từ backend — không expose ra anon/authenticated.
CREATE OR REPLACE FUNCTION public.match_library_items(
  query_embedding vector(768),
  match_count integer,
  min_similarity float
)
RETURNS TABLE (
  id uuid,
  category text,
  title text,
  description text,
  tags text[],
  image_url text,
  prompt_text text,
  img_aspect text,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    li.id, li.category, li.title, li.description, li.tags,
    li.image_url, li.prompt_text, li.img_aspect,
    1 - (li.embedding <=> query_embedding) AS similarity
  FROM public.library_items li
  WHERE li.embedding IS NOT NULL
    AND 1 - (li.embedding <=> query_embedding) >= min_similarity
  ORDER BY li.embedding <=> query_embedding ASC
  LIMIT match_count;
$$;
