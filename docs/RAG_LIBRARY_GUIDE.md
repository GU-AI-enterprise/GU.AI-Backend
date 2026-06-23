# RAG cho Thư viện (Library RAG)

## Vấn đề giải quyết

Workflow Planner (chat với Gemini ở trang `/workflow`) trước đây chỉ biết về **tools** (fashn.ai) và **ảnh user upload**, không biết gì về nội dung trong Thư viện nội bộ (`library_items` — các mục model/pose/prompt/background/example đã seed sẵn). Khi user mô tả 1 ý tưởng ("tạo dáng đứng ôm hoa kiểu nàng thơ"), AI không thể gợi ý/tham chiếu đúng pose hoặc prompt mẫu có sẵn trong thư viện vì không có ngữ cảnh đó.

RAG (Retrieval-Augmented Generation) giải quyết việc này: trước khi gọi Gemini, hệ thống tự tìm các mục thư viện **liên quan về ý nghĩa** với câu hỏi của user, rồi chèn chúng vào system prompt như "tài liệu tham khảo".

---

## Luồng hoạt động

```
User gửi message
  → workflow.routes.ts (/chat hoặc /chat/stream)
  → WorkflowPlannerService.chat() / chatStream()
      → getLibraryContext(userMessage, topK)
          → LibraryService.searchSimilar(userMessage, topK)
              1. embedText(userMessage)          → vector 768 chiều
              2. supabaseAdmin.rpc('match_library_items', { query_embedding, match_count, min_similarity })
              3. trả về tối đa topK mục, sắp theo độ tương đồng giảm dần
          → buildLibraryContextBlock(matches)     → format thành text, đánh dấu rõ "chỉ tham khảo"
      → finalSystemPrompt = systemPrompt + libraryContext
      → gọi Gemini generateContent / streamGenerateContent với finalSystemPrompt
```

Toàn bộ bước RAG là **best-effort**: nếu embedding lỗi, RPC lỗi, hoặc DB chưa có embedding nào — `getLibraryContext` bắt lỗi, log, và trả về chuỗi rỗng. Chat chính **không bao giờ bị crash** vì RAG.

---

## Database

### Cột mới trên `library_items`

```sql
ALTER TABLE public.library_items ADD COLUMN embedding vector(768);
```

Dùng extension `pgvector`, index HNSW (`vector_cosine_ops`) để tìm kiếm cosine similarity nhanh trên dataset lớn.

### Hàm RPC `match_library_items`

```sql
match_library_items(query_embedding vector(768), match_count integer, min_similarity float)
  → trả về tối đa match_count item có similarity >= min_similarity, sắp giảm dần
```

Chỉ gọi qua `supabaseAdmin` (service role) từ backend — không expose ra client.

File: [`database/migration_library_embeddings.sql`](../database/migration_library_embeddings.sql)

---

## Model embedding & quirk quan trọng: dimension bị ignore

Dùng model **`gemini-embedding-001`** qua REST endpoint `embedContent` (raw `fetch`, không dùng SDK — nhất quán với cách `workflow.service.ts` gọi Gemini).

```
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=...
body: { content: { parts: [{ text }] }, embedContentConfig: { outputDimensionality: 768 } }
response: { embedding: { values: number[] } }
```

**Quan trọng**: model này mặc định trả về vector **3072 chiều**, và trên thực tế đã test thì API **bỏ qua** tham số `embedContentConfig.outputDimensionality` — vẫn trả đủ 3072 chiều dù truyền 768. Vì cột DB là `vector(768)`, code phải **tự cắt vector về 768 chiều** sau khi nhận response:

```ts
return values.length > EMBEDDING_DIM ? values.slice(0, EMBEDDING_DIM) : values;
```

Việc cắt prefix này an toàn vì `gemini-embedding-001` là **Matryoshka embedding** — các chiều đầu mang nhiều thông tin nhất, cắt bớt các chiều sau không làm giảm nhiều chất lượng similarity search (đây là tính năng được Google chủ động thiết kế và khuyến nghị, không phải workaround tạm).

Logic này nằm ở 2 nơi (không share code, theo đúng convention các script seed hiện có trong repo — mỗi script tự đứng độc lập):
- [`src/services/library.service.ts`](../src/services/library.service.ts) → `embedText()`
- [`src/scripts/backfill-library-embeddings.ts`](../src/scripts/backfill-library-embeddings.ts) → `embedText()`

---

## Top-K + ngưỡng similarity

Hai tham số kiểm soát độ "rộng" của RAG:

| Tham số | Vai trò | Cấu hình |
|---|---|---|
| `topK` | Số mục tối đa được lấy | User chọn trên UI (3/5/8/10/15/20), gửi lên qua request body, clamp `[0, MAX_RAG_TOP_K=20]` ở backend |
| `min_similarity` | Ngưỡng tương đồng tối thiểu để 1 mục được coi là liên quan | Hằng số server-side, **không cho user chỉnh** — `LIBRARY_RAG_MIN_SIMILARITY` (mặc định `0.72`) |

Lý do tách 2 tham số: nếu chỉ có `topK`, tăng K sẽ kéo theo cả những mục không liên quan (vì RPC luôn cố trả đủ K mục gần nhất, dù không thực sự "gần"). `min_similarity` đảm bảo dù user chọn K=20, mục không đủ liên quan vẫn bị loại.

`topK = 0` tắt hẳn RAG cho lần chat đó (không gọi embedding/RPC).

---

## Files liên quan

**Backend:**
- `database/migration_library_embeddings.sql` — pgvector, cột `embedding`, hàm `match_library_items`
- `database/migration_workflow_chat_state.sql` — bảng lưu lịch sử chat (tính năng đi kèm, không phải RAG, xem phần dưới)
- `src/services/library.service.ts` — `embedText`, `buildEmbeddingText`, `embedAndSaveItem`, `searchSimilar`
- `src/scripts/backfill-library-embeddings.ts` — script chạy 1 lần để embed các item cũ
- `src/services/workflow.service.ts` — `getLibraryContext`, `buildLibraryContextBlock`, `DEFAULT_RAG_TOP_K`, `MAX_RAG_TOP_K`, dùng trong `chat()`/`chatStream()`
- `src/routes/workflow.routes.ts` — đọc `topK` từ request, clamp, truyền xuống service

**Frontend:**
- `features/workflow/constants.ts` — `RAG_TOP_K_DEFAULT`, `RAG_TOP_K_OPTIONS`
- `features/workflow/components/input-bar.tsx` — `TopKPicker` (dropdown "Thư viện: N")
- `app/(dashboard)/workflow/page.tsx` — state `topK`, gửi kèm mọi request chat

---

## Vận hành

### Lần đầu setup (hoặc sau khi thêm mục mới vào thư viện)

1. Chạy `database/migration_library_embeddings.sql` trong Supabase SQL Editor (chỉ cần 1 lần — `CREATE EXTENSION IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS` nên an toàn chạy lại).
2. Chạy backfill:
   ```bash
   npx ts-node src/scripts/backfill-library-embeddings.ts
   ```
   Script chỉ xử lý các item có `embedding IS NULL` — chạy lại bao nhiêu lần cũng chỉ tốn API call cho item mới, không re-embed item đã có.
3. (Optional) set `LIBRARY_RAG_MIN_SIMILARITY` trong `.env` nếu muốn ngưỡng khác `0.72`.

### Khi nào cần chạy lại backfill

Hiện tại **chưa có route tạo/sửa `library_items`** (chỉ có `GET /api/library`) — nội dung được seed bằng SQL/script trực tiếp (`seed-prompts.ts`, `seed-poses.ts`, ...). Mỗi khi seed thêm item mới, cần chạy lại `backfill-library-embeddings.ts` để các item mới có embedding, nếu không RPC `match_library_items` sẽ bỏ qua chúng (`WHERE embedding IS NOT NULL`).

Khi sau này có route create/update cho `library_items`, nên gọi `LibraryService.embedAndSaveItem()` ngay sau khi insert/update để không phải chạy backfill thủ công nữa (đã đánh dấu TODO trong `library.service.ts`).

---

## Tính năng đi kèm: lưu lịch sử chat

Không thuộc RAG nhưng được làm trong cùng đợt: lịch sử chat của workflow planner (1 luồng liên tục mỗi user, không phải multi-thread) được lưu vào bảng `workflow_chat_state` (1 row/user, cột `turns` dạng JSONB), ghi sau mỗi lượt trao đổi hoàn tất, và tự load lại khi user vào lại `/workflow`. Xem `database/migration_workflow_chat_state.sql` và `src/services/workflow-chat.service.ts`.
