-- 댓글/이모지 알림 생성 (2026-09-13)
--
-- 배경: notifications 테이블에 INSERT 하는 코드가 프론트에 전혀 없었다.
--       연차/연장근무 알림만 서버 쪽에서 생성되고 있었고, 댓글·이모지는 미구현이었다.
--
-- 이 스크립트는 DB 트리거로 알림을 만든다. 프론트를 우회해도(직접 API 호출 등)
-- 알림이 빠지지 않고, 타인 user_id로 INSERT 할 권한을 anon 키에 열어주지 않아도 된다.
--
-- ⚠️ 실행 후 Supabase 대시보드 > Database > Replication 에서
--    notifications 테이블의 Realtime 을 켜야 배지가 즉시 갱신된다.
--
-- ⚠️ notices(공지) 테이블에는 작성자 컬럼이 없다. 따라서 공지에 달린
--    댓글/이모지는 "글 작성자"를 특정할 수 없어 알림을 보내지 않는다.
--    (공지 댓글에 달린 대댓글·댓글 이모지는 댓글 작성자를 알 수 있으므로 정상 발송된다)

begin;

-- ---------------------------------------------------------------------------
-- 1. 알림 대상 식별용 컬럼 추가
--    기존 related_leave_id / related_overtime_id 와 같은 역할.
--    이모지 중복 알림 방지(떼었다 다시 붙이기)와 추후 클릭 시 이동에 쓴다.
-- ---------------------------------------------------------------------------
alter table public.notifications
  add column if not exists actor_id            uuid references public.users(id) on delete set null,
  add column if not exists related_entity_type text,
  add column if not exists related_entity_id   bigint,
  add column if not exists related_comment_id  uuid references public.notice_comments(id) on delete cascade,
  add column if not exists related_emoji_id    uuid references public.reaction_emojis(id) on delete cascade;

create index if not exists notifications_dedup_idx
  on public.notifications (user_id, type, actor_id, related_entity_type, related_entity_id, related_emoji_id);

-- ---------------------------------------------------------------------------
-- 2. 공용 헬퍼
-- ---------------------------------------------------------------------------

-- 글 작성자 조회. 공지(notice)는 작성자 컬럼이 없어 항상 null 을 반환한다.
create or replace function public.fn_entity_author(p_entity_type text, p_entity_id bigint)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_entity_type = 'post'
      then (select author_id from public.posts where id = p_entity_id)
    else null
  end;
$$;

-- 사용자 표시 이름 (없으면 이메일 로컬파트)
create or replace function public.fn_display_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(u.name, ''), split_part(u.email, '@', 1), '누군가')
  from public.users u where u.id = p_user_id;
$$;

-- 이모지 표시 문자 (이미지 이모지는 unicode 가 없으므로 key 로 대체)
create or replace function public.fn_emoji_label(p_emoji_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(e.unicode, ''), ':' || e.key || ':', '이모지')
  from public.reaction_emojis e where e.id = p_emoji_id;
$$;

-- ---------------------------------------------------------------------------
-- 3. 댓글 → 글 작성자 + 부모 댓글 작성자
-- ---------------------------------------------------------------------------
create or replace function public.tg_notify_notice_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor        uuid := new.user_id;
  v_actor_name   text;
  v_preview      text;
  v_post_author  uuid;
  v_parent_author uuid;
begin
  if v_actor is null then
    return new;
  end if;

  v_actor_name := public.fn_display_name(v_actor);
  v_preview    := left(regexp_replace(coalesce(new.content, ''), '\s+', ' ', 'g'), 60);

  -- (1) 글 작성자에게
  v_post_author := public.fn_entity_author(new.entity_type, new.notice_id);

  if v_post_author is not null and v_post_author <> v_actor then
    insert into public.notifications
      (user_id, type, title, body, actor_id, related_entity_type, related_entity_id, related_comment_id)
    values
      (v_post_author, 'post_comment', '내 글에 새 댓글이 달렸습니다',
       v_actor_name || ': ' || v_preview,
       v_actor, new.entity_type, new.notice_id, new.id);
  end if;

  -- (2) 대댓글이면 부모 댓글 작성자에게도 (글 작성자와 중복되면 생략)
  if new.parent_id is not null then
    select c.user_id into v_parent_author
    from public.notice_comments c
    where c.id = new.parent_id;

    if v_parent_author is not null
       and v_parent_author <> v_actor
       and v_parent_author is distinct from v_post_author then
      insert into public.notifications
        (user_id, type, title, body, actor_id, related_entity_type, related_entity_id, related_comment_id)
      values
        (v_parent_author, 'comment_reply', '내 댓글에 답글이 달렸습니다',
         v_actor_name || ': ' || v_preview,
         v_actor, new.entity_type, new.notice_id, new.id);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_notice_comment on public.notice_comments;
create trigger trg_notify_notice_comment
  after insert on public.notice_comments
  for each row execute function public.tg_notify_notice_comment();

-- ---------------------------------------------------------------------------
-- 4. 글 이모지 → 글 작성자
--    이모지는 토글이므로 (글, 행위자, 이모지) 조합당 1회만 알림.
-- ---------------------------------------------------------------------------
create or replace function public.tg_notify_notice_reaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor       uuid := new.user_id;
  v_post_author uuid;
begin
  if v_actor is null then
    return new;
  end if;

  v_post_author := public.fn_entity_author(new.entity_type, new.notice_id);

  if v_post_author is null or v_post_author = v_actor then
    return new;
  end if;

  if exists (
    select 1 from public.notifications n
    where n.user_id = v_post_author
      and n.type = 'post_reaction'
      and n.actor_id = v_actor
      and n.related_entity_type = new.entity_type
      and n.related_entity_id = new.notice_id
      and n.related_emoji_id = new.emoji_id
  ) then
    return new;
  end if;

  insert into public.notifications
    (user_id, type, title, body, actor_id, related_entity_type, related_entity_id, related_emoji_id)
  values
    (v_post_author, 'post_reaction', '내 글에 이모지가 달렸습니다',
     public.fn_display_name(v_actor) || '님이 ' || public.fn_emoji_label(new.emoji_id) || ' 를 남겼습니다',
     v_actor, new.entity_type, new.notice_id, new.emoji_id);

  return new;
end;
$$;

drop trigger if exists trg_notify_notice_reaction on public.notice_reactions;
create trigger trg_notify_notice_reaction
  after insert on public.notice_reactions
  for each row execute function public.tg_notify_notice_reaction();

-- ---------------------------------------------------------------------------
-- 5. 댓글 이모지 → 댓글 작성자
--    (댓글 이모지는 공지 글에 달린 댓글이어도 작성자를 알 수 있어 항상 발송된다)
-- ---------------------------------------------------------------------------
create or replace function public.tg_notify_comment_reaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor          uuid := new.user_id;
  v_comment_author uuid;
  v_entity_type    text;
  v_entity_id      bigint;
begin
  if v_actor is null then
    return new;
  end if;

  select c.user_id, c.entity_type, c.notice_id
    into v_comment_author, v_entity_type, v_entity_id
  from public.notice_comments c
  where c.id = new.comment_id;

  if v_comment_author is null or v_comment_author = v_actor then
    return new;
  end if;

  if exists (
    select 1 from public.notifications n
    where n.user_id = v_comment_author
      and n.type = 'comment_reaction'
      and n.actor_id = v_actor
      and n.related_comment_id = new.comment_id
      and n.related_emoji_id = new.emoji_id
  ) then
    return new;
  end if;

  insert into public.notifications
    (user_id, type, title, body, actor_id, related_entity_type, related_entity_id, related_comment_id, related_emoji_id)
  values
    (v_comment_author, 'comment_reaction', '내 댓글에 이모지가 달렸습니다',
     public.fn_display_name(v_actor) || '님이 ' || public.fn_emoji_label(new.emoji_id) || ' 를 남겼습니다',
     v_actor, v_entity_type, v_entity_id, new.comment_id, new.emoji_id);

  return new;
end;
$$;

drop trigger if exists trg_notify_comment_reaction on public.comment_reactions;
create trigger trg_notify_comment_reaction
  after insert on public.comment_reactions
  for each row execute function public.tg_notify_comment_reaction();

commit;
