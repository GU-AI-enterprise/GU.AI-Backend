# Thiết kế: Workflow Session & Bộ nhớ hội thoại

## Vấn đề hiện tại

1. **Mất lịch sử khi reload** — `history` chỉ tồn tại trong React state, refresh là mất.
2. **Không tiếp tục được sau workflow** — khi workflow xong, user không thể nói "chỉnh lại ảnh vừa tạo" vì AI không biết ảnh output là gì.
3. **Mỗi history item là dead data** — click vào lịch sử chỉ xem, không chat tiếp được.

---

## Giải pháp tổng quan: Session-based chat

Mỗi cuộc hội thoại (từ khi user gõ câu đầu tiên đến khi kết thúc) được gọi là **Session**. Một session có thể chứa nhiều workflow liên tiếp.

```
Session
├── messages[]          ← toàn bộ lịch sử chat (user + assistant + plan + result)
├── context_images{}    ← ảnh đang "active": input ban đầu + output các bước
└── workflows[]         ← danh sách workflow đã chạy trong session này
```

---

## Database Schema

### Bảng mới: `ai_workflow_sessions`

```sql
create table ai_workflow_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id),
  title       text,                          -- tự sinh từ tin nhắn đầu tiên
  messages    jsonb not null default '[]',   -- ChatMessage[] đã serialize
  context_images jsonb not null default '{}',-- { product_image, model_image, ..., output_0, output_1, ... }
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
```

### Thay đổi `ai_workflows`

Thêm cột `session_id`:
```sql
alter table ai_workflows
  add column session_id uuid references ai_workflow_sessions(id);
```

---

## Luồng hoạt động

### 1. Bắt đầu hội thoại mới

```
User gõ tin nhắn đầu tiên
  → Frontend: POST /api/workflow/sessions  { userInputUrls }
  → Backend: tạo session record, trả về sessionId
  → Frontend lưu sessionId, gắn vào mọi request tiếp theo
```

### 2. Chat trong session

```
User gõ tin nhắn
  → POST /api/workflow/chat { message, sessionId, model }
  → Backend:
      1. Load session → lấy messages + context_images
      2. Gửi Gemini với history đầy đủ
      3. Lưu turn mới vào session.messages
      4. Trả về { message, plan }
```

Backend tự quản lý history — frontend không cần gửi history nữa, chỉ cần gửi `sessionId`.

### 3. Sau khi workflow hoàn thành

```
Workflow executor hoàn thành
  → Lưu output URL vào session.context_images:
      { ..., "session_output_0": "https://..." }
  → Gemini được nhắc: "Workflow vừa tạo ra ảnh tại: $session_output_0"
  → User gõ "chỉnh lại ảnh vừa tạo thêm background xanh"
  → AI biết "$session_output_0" là ảnh cần chỉnh
  → Plan mới: edit_image(image=$session_output_0, prompt="thêm background xanh")
```

### 4. Mở lại hội thoại cũ từ History panel

```
User click vào history item
  → GET /api/workflow/sessions/:id
  → Frontend restore lại toàn bộ messages từ session
  → User có thể chat tiếp ngay
```

---

## Context Images — cách AI biết ảnh nào

`context_images` là một object key → URL, được update liên tục:

| Key | Ý nghĩa |
|-----|---------|
| `product_image` | Ảnh sản phẩm user upload ban đầu |
| `model_image` | Ảnh người mẫu user upload ban đầu |
| `face_image` | Ảnh khuôn mặt user upload ban đầu |
| `session_output_0` | Output của workflow đầu tiên trong session |
| `session_output_1` | Output của workflow thứ hai |
| ... | ... |

Khi Gemini cần lên kế hoạch, backend inject thêm vào system prompt:
```
## Ảnh từ lịch sử session này
- "session_output_0" — ảnh vừa được tạo từ workflow trước → dùng "$session_output_0"
```

`applyPostProcessingRules` cũng nhận `contextImages` để validate ref hợp lệ.

---

## Thay đổi cần làm

### Backend

**Mới:**
- `ai_workflow_sessions` table (migration)
- `src/services/session.service.ts` — CRUD cho session + append message
- `src/routes/session.routes.ts` — GET/POST endpoints

**Sửa:**
- `workflow.routes.ts` `/chat` — nhận `sessionId` thay vì `history`
- `workflow.rules.ts` `buildSystemPrompt` — nhận thêm `contextImages`
- `workflow.service.ts` executor — sau khi xong, ghi output vào `session.context_images`

### Frontend

**Sửa:**
- `page.tsx` — khi gửi tin đầu: tạo session, lưu `sessionId`
- `page.tsx` — mọi request `/chat` gửi `sessionId` (bỏ `history` trong state)
- `page.tsx` — khi workflow xong, KHÔNG reset hội thoại (vẫn ở session hiện tại)
- `page.tsx` — thêm nút "Workflow mới trong session" và "Session mới"
- `history-panel.tsx` — click item → load session → restore messages

**Mới:**
- `_components/session-context.tsx` (optional) — context để share sessionId

---

## UX sau khi workflow xong

**Hiện tại:**
```
[Workflow hoàn thành] → nút "Workflow mới" → reset toàn bộ
```

**Sau khi sửa:**
```
[Workflow hoàn thành]
  AI: "Ảnh đã xong! Bạn muốn chỉnh thêm gì không?"
  User: "Thêm nền trắng cho cái ảnh đó"
  AI: (plan mới với input = session_output_0)
  ---
  Nút "Session mới" → xoá session, về welcome screen
  Nút "Workflow mới" → vẫn trong session, xoá plan/result, chat tiếp
```

---

## Câu hỏi cần quyết định

1. **Lưu `messages` dạng nào trong DB?**
   - Option A: Toàn bộ `ChatMessage[]` (kể cả executing/result kind) → restore đầy đủ UI
   - Option B: Chỉ lưu `user` + `assistant` + `plan` turns → nhẹ hơn, đủ cho Gemini context
   - **Gợi ý: B cho Gemini history, A cho UI restore** (hai field riêng)

2. **Session title sinh tự động không?**
   - Dùng tin nhắn đầu tiên của user (truncate 60 chars) → đơn giản, đủ dùng

3. **Giới hạn history per session?**
   - Gemini context window lớn, nhưng nên cap ở 20 turns gần nhất để tránh token bloat

4. **User có thể rename/xoá session không?**
   - V1: chỉ xoá, không rename
   - V2: rename + pin

---

## Scope V1 (tối thiểu để hoạt động)

- [ ] Migration: `ai_workflow_sessions` + `session_id` trên `ai_workflows`
- [ ] `SessionService`: createSession, appendMessage, updateContextImages, getSession
- [ ] Route: `POST /api/workflow/sessions`, `GET /api/workflow/sessions/:id`
- [ ] Route `/chat`: nhận `sessionId`, tự load history từ DB
- [ ] Executor: sau khi xong ghi `session_output_N` vào session
- [ ] Frontend: tạo session khi gửi tin đầu, gửi sessionId mọi request
- [ ] History panel: click item → load và restore session
- [ ] Bỏ nút "Workflow mới" khi done → thay bằng "Tiếp tục chỉnh" + "Session mới"
