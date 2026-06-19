-- Thêm các cột metadata cho mục đích lấy dữ liệu hiển thị trên Library
ALTER TABLE assets 
ADD COLUMN IF NOT EXISTS title text,
ADD COLUMN IF NOT EXISTS description text,
ADD COLUMN IF NOT EXISTS tags text[],
ADD COLUMN IF NOT EXISTS prompt_text text;
