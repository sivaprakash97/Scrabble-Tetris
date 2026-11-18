-- Sandbox for the website (Supabase project "alphaboom"). Applied as migration "sandbox_v2".
--
-- Games and scores from preview links and local copies of the page go to a sandbox board, so
-- testing never shows up on the live scoreboard. The page decides with ST.BACKEND.sandbox (see
-- src/deploy.js and src/backend-config.js): only Vercel's production build is live.
--
-- Added next to the first versions (save_game, post_score, top_scores in scoreboard.sql), which
-- are left as they were so pages already open keep working. They know nothing of the sandbox:
-- they save and post live, and old top_scores lists sandbox scores too. Once no page uses them
-- they can be dropped.
--
-- To move a score between boards (e.g. a test posted on the live board):
--   update games  set sandbox = true where id = 'g-…';
--   update scores set sandbox = true where game_id = 'g-…';
-- To clear the sandbox board:  delete from scores where sandbox;

alter table public.games add column if not exists sandbox boolean not null default false;
alter table public.scores add column if not exists sandbox boolean not null default false;
create index if not exists scores_board_idx on public.scores (sandbox, score desc);

-- save_game_v2: save_game plus p_sandbox. A game stays live or sandbox for good.
create function public.save_game_v2(p_id text, p_player uuid, p_record jsonb, p_sandbox boolean default false)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  num_or_null constant text := '^-?[0-9]{1,9}$';
begin
  if p_id is null or p_id !~ '^g-[0-9A-Za-z-]{10,60}$' then
    raise exception 'invalid game id' using errcode = '22023';
  end if;
  if p_player is null or p_record is null or jsonb_typeof(p_record) <> 'object' then
    raise exception 'invalid game record' using errcode = '22023';
  end if;
  if octet_length(p_record::text) > 262144 then
    raise exception 'game record too large' using errcode = '22023';
  end if;

  insert into public.games as g
    (id, player_id, status, score, words, piece_count, level, started_at, saved_at, record, sandbox)
  values (
    p_id,
    p_player,
    left(p_record->>'status', 20),
    case when p_record->>'score' ~ num_or_null then (p_record->>'score')::integer end,
    case when p_record->>'words' ~ num_or_null then (p_record->>'words')::integer end,
    case when p_record->>'pieceCount' ~ num_or_null then (p_record->>'pieceCount')::integer end,
    case when p_record->>'level' ~ num_or_null then (p_record->>'level')::integer end,
    case when p_record->>'startedAt' ~ '^\d{4}-\d{2}-\d{2}T[0-9:.]+Z$' then (p_record->>'startedAt')::timestamptz end,
    now(),
    p_record,
    coalesce(p_sandbox, false)
  )
  on conflict (id) do update set
    status      = excluded.status,
    score       = excluded.score,
    words       = excluded.words,
    piece_count = excluded.piece_count,
    level       = excluded.level,
    started_at  = coalesce(g.started_at, excluded.started_at),
    saved_at    = now(),
    record      = excluded.record
  -- Only the player who started a game can update it. A game stays live or sandbox for good.
  where g.player_id = excluded.player_id;
end;
$function$;

-- post_score_v2: post_score, but the score goes on the same board as its game, and the rank
-- returned is on that board.
create function public.post_score_v2(p_game text, p_player uuid, p_nickname text)
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
    (game_id, player_id, nickname, score, words, level, best_word, best_points, sandbox)
  values (
    g.id, g.player_id, nick, g.score, g.words, g.level,
    left(g.record->'bestWord'->>'display', 16),
    case when g.record->'bestWord'->>'points' ~ '^[0-9]{1,9}$'
         then (g.record->'bestWord'->>'points')::integer end,
    g.sandbox
  )
  on conflict (game_id) do update set nickname = excluded.nickname, posted_at = now();

  return query
    with best as (
      select s.player_id, max(s.score) as score from public.scores s
       where s.sandbox = g.sandbox group by s.player_id
    )
    select (select count(*)::integer + 1 from best b where b.score > me.score),
           (select count(*)::integer from best)
      from best me where me.player_id = p_player;
end;
$function$;

-- top_scores_v2: top_scores for one board, live (p_sandbox false) or sandbox.
create function public.top_scores_v2(p_player uuid default null, p_limit integer default 20, p_sandbox boolean default false)
returns table (rank integer, nickname text, score integer, words integer, level integer,
               best_word text, best_points integer, posted_at timestamptz, mine boolean)
language sql
stable
security definer
set search_path to ''
as $function$
  with board as (
    select * from public.scores s where s.sandbox = coalesce(p_sandbox, false)
  ), best as (
    select distinct on (b.player_id) b.player_id, b.score, b.words, b.level, b.best_word,
           b.best_points, b.posted_at
      from board b
     order by b.player_id, b.score desc, b.posted_at asc
  ), names as (
    select distinct on (b.player_id) b.player_id, b.nickname
      from board b
     order by b.player_id, b.posted_at desc
  ), ranked as (
    select (rank() over (order by best.score desc))::integer as rank, n.nickname, best.score, best.words,
           best.level, best.best_word, best.best_points, best.posted_at,
           coalesce(best.player_id = p_player, false) as mine
      from best join names n using (player_id)
  )
  select * from ranked
   where ranked.rank <= least(greatest(coalesce(p_limit, 20), 1), 50) or ranked.mine
   order by ranked.rank, ranked.posted_at;
$function$;

revoke all on function public.save_game_v2(text, uuid, jsonb, boolean) from public, authenticated;
revoke all on function public.post_score_v2(text, uuid, text) from public, authenticated;
revoke all on function public.top_scores_v2(uuid, integer, boolean) from public, authenticated;
grant execute on function public.save_game_v2(text, uuid, jsonb, boolean) to anon;
grant execute on function public.post_score_v2(text, uuid, text) to anon;
grant execute on function public.top_scores_v2(uuid, integer, boolean) to anon;
