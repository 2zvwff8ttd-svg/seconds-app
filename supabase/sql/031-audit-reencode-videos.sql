-- Phase 4: copy 結合済み動画の再エンコード対象（繋ぎ目 iOS フリーズ対策）
-- 対象: clip_thumbnail_urls が 2 枚以上（複数クリップ由来）

SELECT COUNT(*) AS reencode_candidate_count
FROM public.videos v
WHERE COALESCE(array_length(v.clip_thumbnail_urls, 1), 0) > 1;

SELECT
  v.id AS video_id,
  v.user_id,
  v.title,
  v.duration_seconds,
  v.video_url,
  CASE WHEN v.bgm_url IS NOT NULL AND btrim(v.bgm_url) <> '' THEN true ELSE false END AS has_bgm,
  COALESCE(array_length(v.clip_thumbnail_urls, 1), 0) AS thumb_count,
  v.clip_thumbnail_urls,
  COUNT(c.id) AS clip_rows,
  v.created_at
FROM public.videos v
LEFT JOIN public.clips c ON c.video_id = v.id
WHERE COALESCE(array_length(v.clip_thumbnail_urls, 1), 0) > 1
GROUP BY v.id
ORDER BY v.created_at;

-- 既に再エンコード済み / バックフィル libx264 結合済み（apply 時スキップ候補）
SELECT id, title, video_url
FROM public.videos
WHERE video_url ~ '(video-reencoded|video-merged)\.mp4$';
