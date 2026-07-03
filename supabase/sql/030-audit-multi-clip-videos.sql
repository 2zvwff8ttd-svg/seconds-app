-- Phase 3: 複数クリップ動画の監査（バックフィル前に Supabase SQL Editor で実行）
-- 対象: clips が 2 行以上ある動画（HAVING COUNT(*) > 1）

-- 件数確認
SELECT COUNT(*) AS multi_clip_video_count
FROM (
  SELECT video_id
  FROM public.clips
  GROUP BY video_id
  HAVING COUNT(*) > 1
) t;

-- 詳細一覧（video_id・クリップ数・URL・BGM の有無）
SELECT
  v.id AS video_id,
  v.user_id,
  v.title,
  v.duration_seconds,
  v.video_url,
  CASE WHEN v.bgm_url IS NOT NULL AND btrim(v.bgm_url) <> '' THEN true ELSE false END AS has_bgm,
  v.bgm_url,
  COUNT(c.id) AS clip_count,
  array_agg(c.clip_order ORDER BY c.clip_order) AS clip_orders,
  array_agg(c.clip_url ORDER BY c.clip_order) AS clip_urls,
  array_agg(c.id ORDER BY c.clip_order) AS clip_row_ids,
  v.created_at
FROM public.videos v
JOIN public.clips c ON c.video_id = v.id
GROUP BY v.id
HAVING COUNT(c.id) > 1
ORDER BY v.created_at;
