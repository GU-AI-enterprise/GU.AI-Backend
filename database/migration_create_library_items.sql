CREATE TABLE public.library_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    category text NOT NULL CHECK (category IN ('model', 'pose', 'prompt', 'background', 'example')),
    title text NOT NULL,
    description text,
    tags text[],
    image_url text, -- Sẽ bị NULL đối với danh mục 'prompt'
    prompt_text text, -- Sẽ bị NULL đối với hình ảnh thông thường
    img_aspect text CHECK (img_aspect IN ('tall', 'portrait', 'landscape', 'square')),
    created_at timestamptz DEFAULT now()
);

-- (Tùy chọn) Bật RLS và cho phép Public có thể đọc
ALTER TABLE public.library_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cho phép tất cả mọi người được xem thư viện"
ON public.library_items
FOR SELECT USING (true);
