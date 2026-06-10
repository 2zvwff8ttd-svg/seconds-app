-- 新規登録時の profiles 作成失敗を修正
-- 原因: raw_user_meta_data の username が CHECK 制約（英数字_・2〜30文字）に違反すると
--       handle_new_user トリガーが失敗し Auth が "Database error saving new user" を返す

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  raw_username text;
  base_username text;
  final_username text;
  suffix int := 0;
  suffix_text text;
begin
  raw_username := nullif(trim(new.raw_user_meta_data->>'username'), '');
  base_username := null;

  if raw_username is not null then
    base_username := lower(regexp_replace(raw_username, '[^a-zA-Z0-9_]', '', 'g'));
    if char_length(base_username) < 2 then
      base_username := null;
    elsif char_length(base_username) > 30 then
      base_username := left(base_username, 30);
    end if;
  end if;

  if base_username is null then
    base_username := 'user_' || left(replace(new.id::text, '-', ''), 8);
  end if;

  final_username := base_username;

  while exists (
    select 1
    from public.profiles p
    where lower(p.username) = lower(final_username)
  ) loop
    suffix := suffix + 1;
    suffix_text := '_' || suffix::text;
    final_username :=
      left(base_username, 30 - char_length(suffix_text)) || suffix_text;
  end loop;

  insert into public.profiles (id, username, country)
  values (
    new.id,
    final_username,
    coalesce(nullif(trim(new.raw_user_meta_data->>'country'), ''), 'JP')
  );

  return new;
end;
$$;

alter function public.handle_new_user() owner to postgres;
grant execute on function public.handle_new_user() to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;

notify pgrst, 'reload schema';
