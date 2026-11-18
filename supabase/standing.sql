-- Where a finished game would stand on the scoreboard (Supabase project "alphaboom").
-- Applied as migration "score_standing_v2". Read-only: it writes nothing.
--
-- The game-over screen shows the leaderboard with the player's own row in it, before they have
-- posted. This works out that row. The board holds each player's best posted game, so a game
-- only gets a new row if it beats the caller's best (or they have none). Otherwise the caller's
-- existing row is shown as it is.
--
-- Returns the top p_top rows (up to 20), plus p_around rows either side of the caller's row
-- (up to 5), in order. `kind` is 'you' for the not-yet-posted game (its nickname is null; the
-- page fills in the text box) and 'row' for everyone else. `pos` is the row's place in the list
-- (ties get the same `rank` but different `pos`), `mine` marks the caller's own row, and
-- `players` counts the board as it would be once the game is posted. Player ids never leave the
-- database, like top_scores_v2. p_score is only used to place the row: posting still takes the
-- score from the saved game (post_score_v2), so a made-up p_score changes nothing but the preview.
--
-- Same board rules as top_scores_v2: p_sandbox picks live or sandbox, and a player's name is the
-- latest nickname they posted under.

create or replace function public.score_standing_v2(
  p_player uuid,
  p_score integer,
  p_sandbox boolean default false,
  p_top integer default 5,
  p_around integer default 1
)
returns table (kind text, pos integer, rank integer, nickname text, score integer,
               posted_at timestamptz, mine boolean, players integer)
language sql
stable
security definer
set search_path to ''
as $function$
  with board as (
    select * from public.scores s where s.sandbox = coalesce(p_sandbox, false)
  ), best as (
    select distinct on (b.player_id) b.player_id, b.score, b.posted_at
      from board b
     order by b.player_id, b.score desc, b.posted_at asc
  ), names as (
    select distinct on (b.player_id) b.player_id, b.nickname
      from board b
     order by b.player_id, b.posted_at desc
  ), yours as (
    select max(bst.score) as score from best bst where bst.player_id = p_player
  ), pending as (
    -- posting this game would put a new best on the board for the caller
    select coalesce(p_score, 0) > coalesce((select y.score from yours y), 0) as yes
  ), hypo as (
    select n.nickname, bst.score, bst.posted_at,
           coalesce(bst.player_id = p_player, false) as mine, false as is_you
      from best bst join names n using (player_id)
     where not ((select p.yes from pending p) and coalesce(bst.player_id = p_player, false))
    union all
    select null::text, p_score, null::timestamptz, true, true
     where (select p.yes from pending p)
  ), ranked as (
    select h.*,
           (rank() over (order by h.score desc))::integer as rnk,
           (row_number() over (order by h.score desc, h.is_you, h.posted_at))::integer as rn,
           (count(*) over ())::integer as total
      from hypo h
  ), me as (
    select r.rn from ranked r where r.mine limit 1
  )
  select case when r.is_you then 'you' else 'row' end, r.rn, r.rnk, r.nickname, r.score,
         r.posted_at, r.mine, r.total
    from ranked r
   where r.rn <= least(greatest(coalesce(p_top, 5), 1), 20)
      or abs(r.rn - (select m.rn from me m)) <= least(greatest(coalesce(p_around, 1), 0), 5)
   order by r.rn;
$function$;

revoke all on function public.score_standing_v2(uuid, integer, boolean, integer, integer) from public, authenticated;
grant execute on function public.score_standing_v2(uuid, integer, boolean, integer, integer) to anon;
