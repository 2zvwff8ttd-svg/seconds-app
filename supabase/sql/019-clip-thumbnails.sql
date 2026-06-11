-- 各クリップ先頭フレームの静止画 URL（ホームのシャボン玉スライドショー用）
ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS clip_thumbnail_urls text[];

COMMENT ON COLUMN public.videos.clip_thumbnail_urls IS
  '各クリップの先頭フレーム JPEG URL。2件以上でバブル内スライドショーに使用。';
