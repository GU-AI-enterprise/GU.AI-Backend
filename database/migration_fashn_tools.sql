-- Migration: fashn_tools + fashn_tool_credit_tiers
-- Seeded from docs/fashn_models.json (compiled 2026-06-01)
-- Run in Supabase SQL Editor

-- ── 1. Tables ─────────────────────────────────────────────────────────────────

create table if not exists public.fashn_tools (
  id              uuid        primary key default gen_random_uuid(),
  model_name      text        not null unique,
  display_name    text        not null,
  lifecycle       text        not null check (lifecycle in ('experimental','preview','stable','utility')),
  is_active       boolean     not null default true,
  display_order   integer     not null default 99,
  purpose         text,
  use_case        text,
  notes           text,
  doc_url         text,
  output_type     text        not null default 'image' check (output_type in ('image','video')),
  -- image-typed inputs only; lets executor/AI know which param keys are image refs
  required_inputs text[]      not null default '{}',
  optional_inputs text[]      not null default '{}',
  -- full param schema (non-image params + required flag, type, enum/min/max)
  param_schema    jsonb       not null default '[]',
  base_credit     integer     not null default 1,
  raw_credit_cost jsonb,
  example_inputs  jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.fashn_tool_credit_tiers (
  id               uuid    primary key default gen_random_uuid(),
  tool_id          uuid    not null references public.fashn_tools(id) on delete cascade,
  generation_mode  text,            -- 'fast' | 'balanced' | 'quality' | null (video)
  resolution       text,            -- '1k' | '2k' | '4k' | '480p' | '720p' | '1080p'
  duration_seconds integer,         -- 5 | 10 for video; null for image models
  credit_cost      integer not null
);

-- Unique index tolerates NULLs via coalesce (works on PG 12+)
create unique index if not exists fashn_tool_credit_tiers_uniq
  on public.fashn_tool_credit_tiers (
    tool_id,
    coalesce(generation_mode, ''),
    coalesce(resolution, ''),
    coalesce(duration_seconds, -1)
  );

-- ── 2. Updated-at trigger ─────────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists fashn_tools_updated_at on public.fashn_tools;
create trigger fashn_tools_updated_at
  before update on public.fashn_tools
  for each row execute function public.set_updated_at();

-- ── 3. Seed: fashn_tools ──────────────────────────────────────────────────────

insert into public.fashn_tools
  (model_name, display_name, lifecycle, display_order,
   purpose, use_case, notes, doc_url,
   output_type, required_inputs, optional_inputs,
   param_schema, base_credit, raw_credit_cost, example_inputs)
values

-- 1. tryon-max ─────────────────────────────────────────────────────────────────
(
  'tryon-max', 'Try-On Max', 'experimental', 1,
  'Recommended virtual try-on endpoint cho AI fashion photoshoot và e-commerce publishable content. Hỗ trợ clothing, shoes, hats, jewelry, bags và wearable items.',
  'Đặt sản phẩm lên ảnh model/người thật với chất lượng cao.',
  'Chọn khi có ảnh người/model cụ thể và muốn đặt sản phẩm vào người đó với chất lượng cao.',
  'https://docs.fashn.ai/api-reference/tryon-max',
  'image',
  ARRAY['product_image','model_image'],
  ARRAY[]::text[],
  '[
    {"name":"prompt","type":"string","required":false},
    {"name":"resolution","type":"string","required":false,"enum":["1k","2k","4k"]},
    {"name":"generation_mode","type":"string","required":false,"enum":["balanced","quality"]},
    {"name":"seed","type":"integer","required":false},
    {"name":"num_images","type":"integer","required":false,"min":1,"max":4},
    {"name":"output_format","type":"string","required":false,"enum":["png","jpeg"]},
    {"name":"return_base64","type":"boolean","required":false}
  ]'::jsonb,
  2,
  '{"balanced":{"1k":2,"2k":3,"4k":4},"quality":{"1k":3,"2k":4,"4k":5},"note":"num_images nhân tổng chi phí."}'::jsonb,
  '{"product_image":"https://example.com/garment.jpg","model_image":"https://example.com/person.jpg","resolution":"1k","generation_mode":"balanced","output_format":"png"}'::jsonb
),

-- 2. product-to-model ──────────────────────────────────────────────────────────
(
  'product-to-model', 'Product to Model', 'preview', 2,
  'Biến ảnh sản phẩm-only thành hình người mẫu đang mặc/sử dụng sản phẩm. Có thể dùng inspiration image, background reference hoặc face reference.',
  'Tạo người mẫu đang mặc sản phẩm từ ảnh sản phẩm.',
  'Không nên dùng model_image (deprecated) để kết hợp với người cụ thể; hãy dùng tryon-max cho trường hợp đó.',
  'https://docs.fashn.ai/api-reference/product-to-model',
  'image',
  ARRAY['product_image'],
  ARRAY['image_prompt','face_reference','background_reference'],
  '[
    {"name":"face_reference_mode","type":"string","required":false},
    {"name":"prompt","type":"string","required":false},
    {"name":"aspect_ratio","type":"string","required":false},
    {"name":"resolution","type":"string","required":false},
    {"name":"generation_mode","type":"string","required":false,"enum":["fast","balanced","quality"]},
    {"name":"seed","type":"integer","required":false},
    {"name":"num_images","type":"integer","required":false},
    {"name":"output_format","type":"string","required":false,"enum":["png","jpeg"]},
    {"name":"return_base64","type":"boolean","required":false}
  ]'::jsonb,
  2,
  '{"fast":{"1k":1,"2k":2,"4k":3},"balanced":{"1k":2,"2k":3,"4k":4},"quality":{"1k":3,"2k":4,"4k":5},"face_reference_addon":"+3 credits/output"}'::jsonb,
  '{"product_image":"https://example.com/product.jpg","prompt":"professional office setting","aspect_ratio":"3:4","resolution":"1k"}'::jsonb
),

-- 3. face-to-model ─────────────────────────────────────────────────────────────
(
  'face-to-model', 'Face to Model', 'experimental', 3,
  'Biến ảnh mặt/headshot/selfie thành upper-body avatar sẵn sàng cho virtual try-on, giữ facial identity.',
  'Biến ảnh mặt/headshot thành avatar upper-body dùng cho try-on.',
  'Hữu ích khi user chỉ có ảnh mặt, không có ảnh toàn thân/upper-body.',
  'https://docs.fashn.ai/api-reference/face-to-model',
  'image',
  ARRAY['face_image'],
  ARRAY[]::text[],
  '[
    {"name":"prompt","type":"string","required":false},
    {"name":"aspect_ratio","type":"string","required":false,"enum":["1:1","4:5","3:4","2:3","9:16"]},
    {"name":"resolution","type":"string","required":false},
    {"name":"generation_mode","type":"string","required":false,"enum":["fast","balanced","quality"]},
    {"name":"seed","type":"integer","required":false},
    {"name":"num_images","type":"integer","required":false},
    {"name":"output_format","type":"string","required":false,"enum":["png","jpeg"]},
    {"name":"return_base64","type":"boolean","required":false}
  ]'::jsonb,
  2,
  '{"fast":{"1k":1,"2k":2,"4k":3},"balanced":{"1k":2,"2k":3,"4k":4},"quality":{"1k":3,"2k":4,"4k":5}}'::jsonb,
  '{"face_image":"https://example.com/headshot.jpg","prompt":"athletic build","aspect_ratio":"2:3","output_format":"jpeg"}'::jsonb
),

-- 4. model-create ──────────────────────────────────────────────────────────────
(
  'model-create', 'Model Create', 'experimental', 4,
  'Tạo model thời trang từ prompt, có thể dùng image_reference để hướng composition/pose và face_reference để giữ identity.',
  'Tạo model thời trang bằng prompt và ảnh tham chiếu.',
  'Nếu dùng face_reference, output bị giới hạn tối đa 2K và thường cộng thêm 20-30 giây xử lý.',
  'https://docs.fashn.ai/api-reference/model-create',
  'image',
  ARRAY[]::text[],
  ARRAY['image_reference','face_reference'],
  '[
    {"name":"prompt","type":"string","required":true},
    {"name":"face_reference_mode","type":"string","required":false},
    {"name":"aspect_ratio","type":"string","required":false},
    {"name":"resolution","type":"string","required":false},
    {"name":"generation_mode","type":"string","required":false,"enum":["fast","balanced","quality"]},
    {"name":"seed","type":"integer","required":false},
    {"name":"num_images","type":"integer","required":false},
    {"name":"output_format","type":"string","required":false,"enum":["png","jpeg"]},
    {"name":"return_base64","type":"boolean","required":false}
  ]'::jsonb,
  2,
  '{"fast":{"1k":1,"2k":2,"4k":3},"balanced":{"1k":2,"2k":3,"4k":4},"quality":{"1k":3,"2k":4,"4k":5},"face_reference_addon":"+3 credits/output"}'::jsonb,
  '{"prompt":"Full body shot, woman wearing a white t-shirt and dark blue biker shorts","aspect_ratio":"3:4","resolution":"1k"}'::jsonb
),

-- 5. model-swap ────────────────────────────────────────────────────────────────
(
  'model-swap', 'Model Swap', 'experimental', 5,
  'Đổi danh tính model trong ảnh thời trang nhưng giữ nguyên quần áo, pose và styling.',
  'Đổi danh tính model nhưng giữ quần áo, pose, styling.',
  'Dùng cho campaign cần đổi người mẫu nhưng vẫn giữ sản phẩm như ảnh gốc.',
  'https://docs.fashn.ai/api-reference/model-swap',
  'image',
  ARRAY['model_image'],
  ARRAY['face_reference'],
  '[
    {"name":"prompt","type":"string","required":false},
    {"name":"face_reference_mode","type":"string","required":false},
    {"name":"resolution","type":"string","required":false},
    {"name":"generation_mode","type":"string","required":false,"enum":["fast","balanced","quality"]},
    {"name":"seed","type":"integer","required":false},
    {"name":"num_images","type":"integer","required":false},
    {"name":"output_format","type":"string","required":false,"enum":["png","jpeg"]},
    {"name":"return_base64","type":"boolean","required":false}
  ]'::jsonb,
  2,
  '{"fast":{"1k":1,"2k":2,"4k":3},"balanced":{"1k":2,"2k":3,"4k":4},"quality":{"1k":3,"2k":4,"4k":5},"face_reference_addon":"+3 credits/output"}'::jsonb,
  '{"model_image":"https://example.com/fashion-model.jpg","prompt":"Asian woman with blue hair"}'::jsonb
),

-- 6. edit ──────────────────────────────────────────────────────────────────────
(
  'edit', 'Edit', 'experimental', 6,
  'Post-processing endpoint để chỉnh pose, góc nhìn, phụ kiện, ánh sáng, môi trường hoặc fix lỗi nhỏ trong output.',
  'Chỉnh ảnh theo prompt, giữ identity và product fidelity.',
  'Mask dùng pixel trắng để ưu tiên chỉnh, pixel đen để giữ; mask phải cùng kích thước với ảnh nguồn.',
  'https://docs.fashn.ai/api-reference/edit',
  'image',
  ARRAY['image'],
  ARRAY['mask','image_context'],
  '[
    {"name":"prompt","type":"string","required":true},
    {"name":"resolution","type":"string","required":false},
    {"name":"generation_mode","type":"string","required":false,"enum":["fast","balanced","quality"]},
    {"name":"seed","type":"integer","required":false},
    {"name":"num_images","type":"integer","required":false},
    {"name":"output_format","type":"string","required":false,"enum":["png","jpeg"]},
    {"name":"return_base64","type":"boolean","required":false}
  ]'::jsonb,
  2,
  '{"fast":{"1k":1,"2k":2,"4k":3},"balanced":{"1k":2,"2k":3,"4k":4},"quality":{"1k":3,"2k":4,"4k":5}}'::jsonb,
  '{"image":"https://example.com/model.jpg","prompt":"turn the model slightly to the left, add a black leather crossbody bag"}'::jsonb
),

-- 7. reframe ───────────────────────────────────────────────────────────────────
(
  'reframe', 'Reframe', 'experimental', 7,
  'Đổi aspect ratio bằng phân tích nội dung, tự quyết định crop hoặc expand/outpaint để đạt khung hình mới.',
  'Đổi aspect ratio bằng crop/outpaint thông minh.',
  'Nếu ảnh đã đúng ratio, có thể báo InputValidationError.',
  'https://docs.fashn.ai/api-reference/reframe',
  'image',
  ARRAY['image'],
  ARRAY[]::text[],
  '[
    {"name":"aspect_ratio","type":"string","required":true,"enum":["21:9","1:1","4:3","3:2","2:3","5:4","4:5","3:4","16:9","9:16"]},
    {"name":"resolution","type":"string","required":false},
    {"name":"generation_mode","type":"string","required":false,"enum":["fast","balanced","quality"]},
    {"name":"num_images","type":"integer","required":false},
    {"name":"seed","type":"integer","required":false},
    {"name":"output_format","type":"string","required":false,"enum":["png","jpeg"]},
    {"name":"return_base64","type":"boolean","required":false}
  ]'::jsonb,
  2,
  '{"fast":{"1k":1,"2k":2,"4k":3},"balanced":{"1k":2,"2k":3,"4k":4},"quality":{"1k":3,"2k":4,"4k":5}}'::jsonb,
  '{"image":"https://example.com/portrait.jpg","aspect_ratio":"16:9","resolution":"1k"}'::jsonb
),

-- 8. image-to-video ────────────────────────────────────────────────────────────
(
  'image-to-video', 'Image to Video', 'experimental', 8,
  'Tạo video MP4 5-10 giây từ ảnh tĩnh, có chuyển động camera/model phù hợp thời trang.',
  'Tạo video MP4 5-10 giây từ một ảnh.',
  'end_image chỉ hỗ trợ với resolution 1080p. Prompt nên ngắn và cụ thể, hoặc để trống để hệ thống tự tạo motion.',
  'https://docs.fashn.ai/api-reference/image-to-video',
  'video',
  ARRAY['image'],
  ARRAY['end_image'],
  '[
    {"name":"prompt","type":"string","required":false},
    {"name":"duration","type":"integer","required":false,"enum":[5,10]},
    {"name":"resolution","type":"string","required":false,"enum":["480p","720p","1080p"]}
  ]'::jsonb,
  3,
  '{"5s":{"480p":1,"720p":3,"1080p":6},"10s":{"480p":2,"720p":6,"1080p":12}}'::jsonb,
  '{"image":"https://example.com/photo.jpg","duration":5,"resolution":"1080p"}'::jsonb
),

-- 9. background-remove ─────────────────────────────────────────────────────────
(
  'background-remove', 'Background Remove', 'experimental', 9,
  'Xóa nền ảnh và tạo transparent PNG cutout của foreground subject.',
  'Xóa nền và trả PNG nền trong suốt.',
  'Processing time khoảng 1-3 giây; hỗ trợ ảnh lên đến 4MP.',
  'https://docs.fashn.ai/api-reference/background-remove',
  'image',
  ARRAY['image'],
  ARRAY[]::text[],
  '[
    {"name":"return_base64","type":"boolean","required":false}
  ]'::jsonb,
  1,
  '{"flat":"1 credit/output image"}'::jsonb,
  '{"image":"https://example.com/portrait.jpg","return_base64":false}'::jsonb
),

-- 10. tryon-v1.6 ───────────────────────────────────────────────────────────────
(
  'tryon-v1.6', 'Virtual Try-On v1.6', 'stable', 10,
  'Virtual try-on nhanh, nhẹ, tối ưu realtime e-commerce. Ổn định hơn và rẻ hơn Try-On Max, nhưng ít tính năng/độ phân giải hơn.',
  'Try-on nhanh, nhẹ, phù hợp realtime e-commerce.',
  'Dùng Try-On Max nếu cần studio-grade realism, 4K hoặc accessories.',
  'https://docs.fashn.ai/api-reference/tryon-v1-6',
  'image',
  ARRAY['model_image','garment_image'],
  ARRAY[]::text[],
  '[
    {"name":"category","type":"string","required":false,"enum":["auto","tops","bottoms","one-pieces"]},
    {"name":"segmentation_free","type":"boolean","required":false},
    {"name":"moderation_level","type":"string","required":false},
    {"name":"garment_photo_type","type":"string","required":false},
    {"name":"mode","type":"string","required":false},
    {"name":"seed","type":"integer","required":false},
    {"name":"num_samples","type":"integer","required":false},
    {"name":"output_format","type":"string","required":false,"enum":["png","jpeg"]},
    {"name":"return_base64","type":"boolean","required":false}
  ]'::jsonb,
  1,
  '{"flat":"1 credit/output image"}'::jsonb,
  '{"model_image":"https://example.com/model.jpg","garment_image":"https://example.com/garment.jpg","category":"auto","mode":"balanced"}'::jsonb
)

on conflict (model_name) do update set
  display_name    = excluded.display_name,
  lifecycle       = excluded.lifecycle,
  display_order   = excluded.display_order,
  purpose         = excluded.purpose,
  use_case        = excluded.use_case,
  notes           = excluded.notes,
  doc_url         = excluded.doc_url,
  output_type     = excluded.output_type,
  required_inputs = excluded.required_inputs,
  optional_inputs = excluded.optional_inputs,
  param_schema    = excluded.param_schema,
  base_credit     = excluded.base_credit,
  raw_credit_cost = excluded.raw_credit_cost,
  example_inputs  = excluded.example_inputs,
  updated_at      = now();

-- ── 4. Seed: fashn_tool_credit_tiers ─────────────────────────────────────────
-- Flat-rate tools (background-remove, tryon-v1.6) use base_credit only — no tier rows.
-- image-to-video uses duration_seconds instead of generation_mode.

insert into public.fashn_tool_credit_tiers
  (tool_id, generation_mode, resolution, duration_seconds, credit_cost)

-- tryon-max (balanced + quality only, no fast tier)
select id, 'balanced', '1k',  null::integer, 2 from public.fashn_tools where model_name = 'tryon-max' union all
select id, 'balanced', '2k',  null, 3 from public.fashn_tools where model_name = 'tryon-max' union all
select id, 'balanced', '4k',  null, 4 from public.fashn_tools where model_name = 'tryon-max' union all
select id, 'quality',  '1k',  null, 3 from public.fashn_tools where model_name = 'tryon-max' union all
select id, 'quality',  '2k',  null, 4 from public.fashn_tools where model_name = 'tryon-max' union all
select id, 'quality',  '4k',  null, 5 from public.fashn_tools where model_name = 'tryon-max' union all

-- product-to-model
select id, 'fast',     '1k',  null, 1 from public.fashn_tools where model_name = 'product-to-model' union all
select id, 'fast',     '2k',  null, 2 from public.fashn_tools where model_name = 'product-to-model' union all
select id, 'fast',     '4k',  null, 3 from public.fashn_tools where model_name = 'product-to-model' union all
select id, 'balanced', '1k',  null, 2 from public.fashn_tools where model_name = 'product-to-model' union all
select id, 'balanced', '2k',  null, 3 from public.fashn_tools where model_name = 'product-to-model' union all
select id, 'balanced', '4k',  null, 4 from public.fashn_tools where model_name = 'product-to-model' union all
select id, 'quality',  '1k',  null, 3 from public.fashn_tools where model_name = 'product-to-model' union all
select id, 'quality',  '2k',  null, 4 from public.fashn_tools where model_name = 'product-to-model' union all
select id, 'quality',  '4k',  null, 5 from public.fashn_tools where model_name = 'product-to-model' union all

-- face-to-model
select id, 'fast',     '1k',  null, 1 from public.fashn_tools where model_name = 'face-to-model' union all
select id, 'fast',     '2k',  null, 2 from public.fashn_tools where model_name = 'face-to-model' union all
select id, 'fast',     '4k',  null, 3 from public.fashn_tools where model_name = 'face-to-model' union all
select id, 'balanced', '1k',  null, 2 from public.fashn_tools where model_name = 'face-to-model' union all
select id, 'balanced', '2k',  null, 3 from public.fashn_tools where model_name = 'face-to-model' union all
select id, 'balanced', '4k',  null, 4 from public.fashn_tools where model_name = 'face-to-model' union all
select id, 'quality',  '1k',  null, 3 from public.fashn_tools where model_name = 'face-to-model' union all
select id, 'quality',  '2k',  null, 4 from public.fashn_tools where model_name = 'face-to-model' union all
select id, 'quality',  '4k',  null, 5 from public.fashn_tools where model_name = 'face-to-model' union all

-- model-create
select id, 'fast',     '1k',  null, 1 from public.fashn_tools where model_name = 'model-create' union all
select id, 'fast',     '2k',  null, 2 from public.fashn_tools where model_name = 'model-create' union all
select id, 'fast',     '4k',  null, 3 from public.fashn_tools where model_name = 'model-create' union all
select id, 'balanced', '1k',  null, 2 from public.fashn_tools where model_name = 'model-create' union all
select id, 'balanced', '2k',  null, 3 from public.fashn_tools where model_name = 'model-create' union all
select id, 'balanced', '4k',  null, 4 from public.fashn_tools where model_name = 'model-create' union all
select id, 'quality',  '1k',  null, 3 from public.fashn_tools where model_name = 'model-create' union all
select id, 'quality',  '2k',  null, 4 from public.fashn_tools where model_name = 'model-create' union all
select id, 'quality',  '4k',  null, 5 from public.fashn_tools where model_name = 'model-create' union all

-- model-swap
select id, 'fast',     '1k',  null, 1 from public.fashn_tools where model_name = 'model-swap' union all
select id, 'fast',     '2k',  null, 2 from public.fashn_tools where model_name = 'model-swap' union all
select id, 'fast',     '4k',  null, 3 from public.fashn_tools where model_name = 'model-swap' union all
select id, 'balanced', '1k',  null, 2 from public.fashn_tools where model_name = 'model-swap' union all
select id, 'balanced', '2k',  null, 3 from public.fashn_tools where model_name = 'model-swap' union all
select id, 'balanced', '4k',  null, 4 from public.fashn_tools where model_name = 'model-swap' union all
select id, 'quality',  '1k',  null, 3 from public.fashn_tools where model_name = 'model-swap' union all
select id, 'quality',  '2k',  null, 4 from public.fashn_tools where model_name = 'model-swap' union all
select id, 'quality',  '4k',  null, 5 from public.fashn_tools where model_name = 'model-swap' union all

-- edit
select id, 'fast',     '1k',  null, 1 from public.fashn_tools where model_name = 'edit' union all
select id, 'fast',     '2k',  null, 2 from public.fashn_tools where model_name = 'edit' union all
select id, 'fast',     '4k',  null, 3 from public.fashn_tools where model_name = 'edit' union all
select id, 'balanced', '1k',  null, 2 from public.fashn_tools where model_name = 'edit' union all
select id, 'balanced', '2k',  null, 3 from public.fashn_tools where model_name = 'edit' union all
select id, 'balanced', '4k',  null, 4 from public.fashn_tools where model_name = 'edit' union all
select id, 'quality',  '1k',  null, 3 from public.fashn_tools where model_name = 'edit' union all
select id, 'quality',  '2k',  null, 4 from public.fashn_tools where model_name = 'edit' union all
select id, 'quality',  '4k',  null, 5 from public.fashn_tools where model_name = 'edit' union all

-- reframe
select id, 'fast',     '1k',  null, 1 from public.fashn_tools where model_name = 'reframe' union all
select id, 'fast',     '2k',  null, 2 from public.fashn_tools where model_name = 'reframe' union all
select id, 'fast',     '4k',  null, 3 from public.fashn_tools where model_name = 'reframe' union all
select id, 'balanced', '1k',  null, 2 from public.fashn_tools where model_name = 'reframe' union all
select id, 'balanced', '2k',  null, 3 from public.fashn_tools where model_name = 'reframe' union all
select id, 'balanced', '4k',  null, 4 from public.fashn_tools where model_name = 'reframe' union all
select id, 'quality',  '1k',  null, 3 from public.fashn_tools where model_name = 'reframe' union all
select id, 'quality',  '2k',  null, 4 from public.fashn_tools where model_name = 'reframe' union all
select id, 'quality',  '4k',  null, 5 from public.fashn_tools where model_name = 'reframe' union all

-- image-to-video (keyed by duration_seconds + resolution, no generation_mode)
select id, null, '480p',  5,  1 from public.fashn_tools where model_name = 'image-to-video' union all
select id, null, '720p',  5,  3 from public.fashn_tools where model_name = 'image-to-video' union all
select id, null, '1080p', 5,  6 from public.fashn_tools where model_name = 'image-to-video' union all
select id, null, '480p',  10, 2 from public.fashn_tools where model_name = 'image-to-video' union all
select id, null, '720p',  10, 6 from public.fashn_tools where model_name = 'image-to-video' union all
select id, null, '1080p', 10, 12 from public.fashn_tools where model_name = 'image-to-video'

on conflict (tool_id, coalesce(generation_mode,''), coalesce(resolution,''), coalesce(duration_seconds,-1))
  do update set credit_cost = excluded.credit_cost;

-- ── 5. tool_key — internal snake_case key used by executor / validator ─────────
-- Bridges the gap between Fashn API kebab-case names and internal code names.

alter table public.fashn_tools
  add column if not exists tool_key text;

update public.fashn_tools set tool_key = 'remove_background' where model_name = 'background-remove';
update public.fashn_tools set tool_key = 'product_to_model'  where model_name = 'product-to-model';
update public.fashn_tools set tool_key = 'try_on_max'        where model_name = 'tryon-max';
update public.fashn_tools set tool_key = 'try_on'            where model_name = 'tryon-v1.6';
update public.fashn_tools set tool_key = 'edit_image'        where model_name = 'edit';
update public.fashn_tools set tool_key = 'reframe'           where model_name = 'reframe';
update public.fashn_tools set tool_key = 'face_to_model'     where model_name = 'face-to-model';
update public.fashn_tools set tool_key = 'model_create'      where model_name = 'model-create';
update public.fashn_tools set tool_key = 'model_swap'        where model_name = 'model-swap';
update public.fashn_tools set tool_key = 'image_to_video'    where model_name = 'image-to-video';

create unique index if not exists fashn_tools_tool_key_uniq on public.fashn_tools (tool_key);
