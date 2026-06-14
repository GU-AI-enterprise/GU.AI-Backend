-- ── Add resolution_options to fashn_tools ────────────────────────────────────
-- Stores the valid resolution values for each tool (from Fashn API docs).
-- Empty array = tool does not have a resolution parameter.

alter table public.fashn_tools
  add column if not exists resolution_options text[] not null default '{}'::text[];

-- Image tools: 1k / 2k / 4k
update public.fashn_tools
set resolution_options = ARRAY['1k', '2k', '4k']
where model_name in (
  'tryon-max',
  'product-to-model',
  'face-to-model',
  'model-create',
  'model-swap',
  'edit',
  'reframe'
);

-- Video tool: 480p / 720p / 1080p
update public.fashn_tools
set resolution_options = ARRAY['480p', '720p', '1080p']
where model_name = 'image-to-video';

-- background-remove and tryon-v1.6 have no resolution param → keep empty array (default)
