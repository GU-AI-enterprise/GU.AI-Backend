import { supabaseAdmin } from '../config/supabase';

const EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_DIM = 768;
const DEFAULT_MIN_SIMILARITY = Number(process.env.LIBRARY_RAG_MIN_SIMILARITY ?? 0.72);

export interface LibraryItemRow {
  id: string;
  category: string;
  title: string;
  description: string | null;
  tags: string[] | null;
  image_url: string | null;
  prompt_text: string | null;
  img_aspect: string | null;
}

export interface LibraryMatch extends LibraryItemRow {
  similarity: number;
}

export class LibraryService {
  static async getAll() {
    const { data, error } = await supabaseAdmin!
      .from('library_items')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data ?? [];
  }

  // TODO: khi có route create/update cho library_items, gọi embedAndSaveItem()
  // ngay sau insert/update để embedding luôn khớp với nội dung mới nhất.

  /** Ghép các field text dùng để đại diện 1 mục thư viện khi tạo embedding. */
  static buildEmbeddingText(item: Pick<LibraryItemRow, 'title' | 'description' | 'tags' | 'prompt_text'>): string {
    return [
      item.title,
      item.description,
      item.tags?.join(', '),
      item.prompt_text,
    ].filter(Boolean).join('\n');
  }

  /** Gọi Gemini embedContent REST API, trả về vector 768 chiều. */
  static async embedText(text: string): Promise<number[]> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY chưa được cấu hình');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    if (!values.length) throw new Error('Gemini không trả về embedding hợp lệ');

    // API hiện tại bỏ qua embedContentConfig.outputDimensionality và luôn trả 3072 chiều —
    // gemini-embedding-001 là Matryoshka embedding nên cắt prefix vẫn giữ chất lượng tốt.
    return values.length > EMBEDDING_DIM ? values.slice(0, EMBEDDING_DIM) : values;
  }

  /** Embed 1 item và lưu lại vào cột embedding. */
  static async embedAndSaveItem(item: Pick<LibraryItemRow, 'id' | 'title' | 'description' | 'tags' | 'prompt_text'>): Promise<void> {
    const text = this.buildEmbeddingText(item);
    if (!text.trim()) return;

    const vector = await this.embedText(text);

    const { error } = await supabaseAdmin!
      .from('library_items')
      .update({ embedding: vector })
      .eq('id', item.id);

    if (error) throw error;
  }

  /**
   * Similarity search trên library_items qua RPC `match_library_items`.
   * Trả về tối đa topK item có cosine similarity >= minSimilarity.
   */
  static async searchSimilar(
    queryText: string,
    topK: number,
    minSimilarity: number = DEFAULT_MIN_SIMILARITY,
  ): Promise<LibraryMatch[]> {
    if (!queryText.trim() || topK <= 0) return [];

    const queryEmbedding = await this.embedText(queryText);

    const { data, error } = await supabaseAdmin!.rpc('match_library_items', {
      query_embedding: queryEmbedding,
      match_count: topK,
      min_similarity: minSimilarity,
    });

    if (error) throw error;
    return (data ?? []) as LibraryMatch[];
  }
}
