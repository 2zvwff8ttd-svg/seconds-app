-- 動画と BGM を別 URL で保存（再生時にフロントで同時再生）

alter table public.videos
  add column if not exists bgm_url text;

comment on column public.videos.bgm_url is 'プリセット BGM の公開 URL（動画とは別再生）';

-- insert_pending_video に BGM URL を追加（既存呼び出しは p_bgm_url 省略可）
create or replace function public.insert_pending_video(
  p_id uuid,
  p_user_id uuid,
  p_video_url text,
  p_thumbnail_url text,
  p_title text,
  p_duration_seconds integer,
  p_visibility public.video_visibility,
  p_country text,
  p_bgm_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.videos;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'Unauthorized';
  end if;
  insert into public.videos (
    id, user_id, video_url, thumbnail_url, title,
    duration_seconds, visibility, country, status, bgm_url
  )
  values (
    p_id, p_user_id, p_video_url, p_thumbnail_url, p_title,
    p_duration_seconds, p_visibility, p_country, 'pending'::public.video_status,
    nullif(trim(p_bgm_url), '')
  )
  returning * into v_row;
  return jsonb_build_object('id', v_row.id, 'publish_at', v_row.publish_at);
end;
$$;

revoke all on function public.insert_pending_video(
  uuid, uuid, text, text, text, integer, public.video_visibility, text, text
) from public;
grant execute on function public.insert_pending_video(
  uuid, uuid, text, text, text, integer, public.video_visibility, text, text
) to authenticated;
