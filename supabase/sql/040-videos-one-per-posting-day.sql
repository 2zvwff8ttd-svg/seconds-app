-- N1: Enforce one video per user per posting day at the DB level.
-- Posting day = JST calendar date of (created_at - 7 hours)
--   i.e. period [day 07:00 JST, next day 07:00 JST).
-- Does not modify existing rows. Safe when no duplicate pairs exist
-- (verified on production before ship).
-- Same as migrations/040_videos_one_per_posting_day.sql

create unique index if not exists videos_one_per_posting_day_idx
  on public.videos (
    user_id,
    ((timezone('Asia/Tokyo', created_at) - interval '7 hours')::date)
  );

comment on index public.videos_one_per_posting_day_idx is
  'One video per user per posting day (Asia/Tokyo 07:00 boundary).';
