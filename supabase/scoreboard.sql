-- Scoreboard for the website (Supabase project "alphaboom"). Applied as migration "scoreboard".
--
-- A player can post a finished game under a nickname. The browser's publishable key can only
-- call the two functions below: it can't read, write or list the table directly (row-level
-- security is on with no policies, and the anon role has no table grants). Player ids never
-- leave the database: the board marks the caller's own row with `mine` instead.
--
-- Scores are copied from the saved game in public.games, not taken from the request, and
-- post_score checks that the saved score equals the points of the words in its record plus its
-- soft-drop points. A determined player could still forge a whole record, so treat the board
-- as a friendly one. Remove a row with: delete from public.scores where game_id = '...';

create table public.scores (
  game_id     text primary key references public.games (id) on delete cascade,
  player_id   uuid not null,
  nickname    text not null,
  score       integer not null,
  words       integer,
  level       integer,
  best_word   text,
  best_points integer,
  posted_at   timestamptz not null default now()
);
create index scores_player_idx on public.scores (player_id, score desc);
create index scores_score_idx on public.scores (score desc);

alter table public.scores enable row level security;
revoke all on table public.scores from anon, authenticated;

-- Posts (or re-posts under a new name) one finished game. Returns where the player's best
-- posted score now ranks, and how many players are on the board.
create or replace function public.post_score(p_game text, p_player uuid, p_nickname text)
returns table (rank integer, players integer)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  g public.games%rowtype;
  nick text;
  earned bigint;
begin
  nick := regexp_replace(btrim(coalesce(p_nickname, '')), '\s+', ' ', 'g');
  if char_length(nick) < 2 or char_length(nick) > 16
     or nick !~ '^[[:alnum:] _.''-]+$' or nick !~ '[[:alnum:]]' then
    raise exception 'invalid nickname' using errcode = '22023';
  end if;

  select * into g from public.games where id = p_game and player_id = p_player;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;
  if g.status is distinct from 'over' then
    raise exception 'game not finished' using errcode = '55000';
  end if;
  if coalesce(g.score, 0) <= 0 then
    raise exception 'nothing to post' using errcode = '22023';
  end if;

  select coalesce((select sum((w->>'points')::bigint)
                     from jsonb_array_elements(coalesce(g.record->'pieces', '[]')) p,
                          jsonb_array_elements(coalesce(p->'words', '[]')) w), 0)
       + coalesce((select sum((p->>'softCells')::bigint)
                     from jsonb_array_elements(coalesce(g.record->'pieces', '[]')) p), 0)
    into earned;
  if earned <> g.score then
    raise exception 'score does not match the game' using errcode = '22023';
  end if;

  insert into public.scores as s
    (game_id, player_id, nickname, score, words, level, best_word, best_points)
  values (
    g.id, g.player_id, nick, g.score, g.words, g.level,
    left(g.record->'bestWord'->>'display', 16),
    case when g.record->'bestWord'->>'points' ~ '^[0-9]{1,9}$'
         then (g.record->'bestWord'->>'points')::integer end
  )
  on conflict (game_id) do update set nickname = excluded.nickname, posted_at = now();

  return query
    with best as (
      select s.player_id, max(s.score) as score from public.scores s group by s.player_id
    )
    select (select count(*)::integer + 1 from best b where b.score > me.score),
           (select count(*)::integer from best)
      from best me where me.player_id = p_player;
end;
$function$;

-- The board: each player's best posted game under their latest nickname, top p_limit (up to
-- 50), plus the caller's own row if it's further down.
create or replace function public.top_scores(p_player uuid default null, p_limit integer default 20)
returns table (rank integer, nickname text, score integer, words integer, level integer,
               best_word text, best_points integer, posted_at timestamptz, mine boolean)
language sql
stable
security definer
set search_path to ''
as $function$
  with best as (
    select distinct on (s.player_id) s.player_id, s.score, s.words, s.level, s.best_word,
           s.best_points, s.posted_at
      from public.scores s
     order by s.player_id, s.score desc, s.posted_at asc
  ), names as (
    select distinct on (s.player_id) s.player_id, s.nickname
      from public.scores s
     order by s.player_id, s.posted_at desc
  ), ranked as (
    select (rank() over (order by b.score desc))::integer as rank, n.nickname, b.score, b.words,
           b.level, b.best_word, b.best_points, b.posted_at,
           coalesce(b.player_id = p_player, false) as mine
      from best b join names n using (player_id)
  )
  select * from ranked
   where ranked.rank <= least(greatest(coalesce(p_limit, 20), 1), 50) or ranked.mine
   order by ranked.rank, ranked.posted_at;
$function$;

revoke all on function public.post_score(text, uuid, text) from public, authenticated;
revoke all on function public.top_scores(uuid, integer) from public, authenticated;
grant execute on function public.post_score(text, uuid, text) to anon;
grant execute on function public.top_scores(uuid, integer) to anon;
