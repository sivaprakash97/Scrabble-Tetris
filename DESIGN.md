# Alphaboom design

A falling-block game where every block cell is a Scrabble-style letter tile, and you clear lines by spelling words. It was called Scrabble-Tetris while it was a prototype; it was renamed Alphaboom for hosting, to keep both trademarks out of the name.
This doc records the rules the prototype uses and why. Every number in it lives in `src/config.js`.

**Platform:** built for phones first, for a future phone app, and it also plays on a laptop or desktop. A window 1000 px wide or more with a mouse gets a three-column layout and keyboard controls (see "Laptop and desktop" below); phones and tablets keep the single phone column.

## Controls

Under the board, **Rotate sits alone on the left, in red**. On the right, Left and Right share a row, with one wide Down button underneath. Pause is a small button in the top-right corner of the score strip.

The layout follows the player's own sketch (v0.6), which had Down alone on the left. v0.7 swapped Down and Rotate because the two kept getting confused.
- Every button uses the same set of line icons, and none of them is an emoji.
- **Down is the only way to drop.** Holding it makes the piece fall fast, and the piece locks 0.5 s after it lands. There's no hard drop.
- Down doesn't carry over: if you keep holding it after a piece locks, the next piece still falls at normal speed until you press Down again.
- **The landing shadow shows the letters.** Each outline holds the letter that will land there, drawn lighter than a real tile, so you can see the word you'll make before the piece drops (v0.7).
- There's no Hold and no preview of upcoming pieces. Both were removed in v0.3 because they weren't used, and removing them gave the board more room.

### Laptop and desktop

Pointer-and-keyboard devices (`min-width: 1000px`, `hover: hover`, `pointer: fine`; the block at the end of `style.css`) get a wide layout. A touch screen of any size, an iPad in landscape included, keeps the phone layout and its on-screen pad.
- **Three columns.** Score, keys and rules on the left; the board in the middle, sized to the window's height (up to 96 px a cell, so a projected screen gets a big board); found words and their definitions on the right, as tall as the board.
- **Keys.** Arrow keys or WASD: Left/Right (A/D) move, Up (W) rotates, Down (S) drops faster. P or Esc pauses and resumes, M mutes. Space or Enter presses the big button on the start, pause and game-over screens, and inside How to play, Enter goes on and Left/Right turn the cards. Space on a tip is "Got it". There is still no hard drop; Space never drops a piece.
- **The pad becomes a keyboard diagram.** The same buttons, laid out as ↑ over ← ↓ →, each labelled with its keys, and each lights up while its key is down. They still work by clicking.
- **Same rules as the buttons.** Keys go through the same code as the on-screen pad (`press`/`release` in `src/ui.js`), so Left and Right repeat the game's own way (DAS/ARR), and Down doesn't carry over to the next piece. The operating system's key repeat is ignored.
- **Keys stay out of the way** while a dialog is open, while typing in a text box or the Shortest word menu, and when Ctrl, Cmd or Alt is held. After a dialog closes, focus is released so Space starts or resumes the game instead of re-opening the dialog.
- `fit()` in `src/ui.js` knows which layout is showing from whether `.app` is a grid, so there's one place (the media query) that decides.

## Look

The game is drawn as a glossy, chunky cartoon toy, in the style of casual phone games. Only the look changed: rules, controls, layout and timings are the same.

**One recipe for every part.** Tiles, buttons, score badges, the tray around the board, dialogs and panels all share it:
- a thick near-black outline (`--ink`) and generous round corners;
- a saturated body that is lighter on top, with a darker lip underneath, so it reads as inflated;
- a soft white gloss band across the top and a small bright speck of shine;
- a hard ink drop underneath in place of a blurred shadow. Buttons sink onto it when pressed.

The recipe lives in `style.css` for the page, and in `paintTile` in `src/ui.js` for the board.

**Tile colours follow the letter**, so nothing extra is saved with a game:

| Tiles | Colour |
|---|---|
| Vowels | yellow |
| 1-point consonants (L N R S T) | blue |
| 2–3 points (B C D G M P) | green |
| 4–5 points (F H K V W Y) | pink |
| 8–10 points (J X Z Qu) | purple |
| Blank | white, with a gold star |

Letters and values are always dark ink on a light face, so they stay readable on every colour.

**Feedback.**
- A word's tiles flash gold with a white outline and throw out stars. Tiles cleared without scoring fade to grey.
- After a clear, tiles drop into the gaps with a small bounce. The piece that just locked squashes for a moment.
- Banners (chain, row cleared, level) pop in as outlined lettering, and a new level drops confetti.
- A stat in the score strip jumps when a word changes it.
- These are drawn on top of the game state and never delay it. All of them are skipped when the device asks for reduced motion.

**Type.** Lilita One for tiles, numbers, buttons and headings; Fredoka for reading text. Text outlines are built from shadows so they work in every browser.

**Speed.** Each tile is painted once per letter and look into a small off-screen canvas, and the empty well once per size; each frame only stamps them.

## How to play (onboarding)

Four illustrated cards in a dialog, swiped sideways or stepped through with Back and Next:

| Card | Teaches |
|---|---|
| Spell words across | Words of the shortest length or more clear and score; the tiles above drop |
| Steer each piece | Rotate, Left, Right, hold Down; the dashed outline shows the landing |
| Longer words, bigger points | Longer words score more; every 10 words, the level goes up |
| Good to know | Blanks, Qu, full rows clear without scoring, don't reach the top |

- **When it shows:** by itself on a first visit, before the first game. On the last card, "Play!" closes it and starts the game. After that it's one tap away: "How to play" on the start and pause screens, and in the Rules panel.
- **Seen once:** `localStorage alphaboom.seenHowTo`. Clear it to see the first-visit flow again.
- **Numbers come from `src/config.js`:** the shortest word, words per level and the example scores (CAT +50, TRAINS +300), so the cards stay right when the rules change.
- The pictures are painted by the game's own tile painter.
- **The steering card is a live demo.** A little 5 × 5 well has a T piece (S over CAT) that plays a loop: rotate, left, right, right, rotate, drop with a squash, start again. Its keys press as it goes.
  - The player can tap the mini keys to try them, with the game's own sounds. A tap pauses the loop for 5 seconds.
  - It uses the game's shapes, rotation and kicks, so letters turn the way they do in play.
  - The loop runs only while that card is showing, and not under reduced motion.
- **No multiplier table** (v2 of the cards): testers found it too much. The points card shows CAT +50 next to TRAINS +300 instead.
- **Bullets are plain dots.** Coloured ones read as a colour code.
- The pause screen is now short ("24 words so far."), and the start screen gives a one-line pitch, since the cards hold the details.

## Scoreboard

Opened from "Scoreboard" on the start, pause and game-over screens, and in the Rules panel. Two tabs:

- **Top players** (website only): each player's best posted game, under their latest nickname, top 20. Your own row is highlighted, and shown below the top 20 if you're further down.
- **My best:** your 10 best games on this device (`localStorage alphaboom.games`), with date, level, words and best word. Kept for every finished game, posted or not.

**Posting a score.**
- After a game, the game-over screen offers "Post score". It opens the scoreboard with a nickname box. The nickname is remembered on the device (`alphaboom.nickname`), so later posts are one tap.
- Posting is optional, one game at a time. A player who never posts never appears.
- Nicknames are 2–16 letters, numbers, spaces or `_ . ' -`. Both the page and the database check this.

**Where it's kept.** The Supabase table `scores`, one row per posted game. See "Hosting and saving".

**Where there's no shared board.** On the Claude page and in a local file, games aren't in Supabase, so the scoreboard shows only "My best games".

## Learning while playing: full rows and chains

Playtest 8 showed the risk: 62% of the tiles cleared went in full rows, which score nothing. Players need to learn that words are the goal, and that falling tiles can spell more words. The cards say both, but most people skip cards, so the game also says it at the moment it happens.

**Full rows.**
- The banner reads "ROW CLEARED" with "+0 POINTS" under it (written "+0" so it reads as "added nothing", not "your score is now 0"), or "ONLY WORDS SCORE" if a word cleared in the same wave, since the word did score.
- It shows only the first two times on a device (`localStorage alphaboom.rowBanners`), then stops. A banner every time got tiresome.
- The full row's tiles always fade to grey, and the row always has its dull whoosh, plainly less fun than a word's.
- The game-over summary adds "19 full rows: +0 points" in red when any full rows cleared. This counts `junkRows` from the game log.

**Banners stack.** When several happen at once (row cleared, chain, level), each takes the first free row, top to bottom, oldest first, instead of drawing over each other.

**Tips for first-time players** (`src/screens.js`). A bubble over the score strip was easy to miss mid-game, so a tip now pauses the game:
1. The moment happens, and the game waits until it has settled (the whole chain has played out).
2. The game pauses and a pop-up shows the tip with a picture from what just happened: the player's own word, the chain word, the full row's letters, a level badge, or a warning sign.
3. "Got it", Escape or a tap outside closes it. If the same moment set off more than one tip, the next shows straight away.
4. A 3-2-1 countdown over the board, with a beep each, then play picks up again.

Pausing during the countdown, or leaving the app, stops it and shows the ordinary pause screen.

Each tip shows once per device (`localStorage alphaboom.tips`); clear it to see them again.

| Moment | Title | Tip |
|---|---|---|
| First word | Nice word! | Words score points, and longer words score a lot more. |
| First full row | Full row | A full row clears too, but it scores nothing. Only words score points. |
| First chain | Chain ×2! | When a word clears, the tiles above it fall. If they spell another word, that's a chain, and it scores ×2. |
| First level up | Level 2! | Pieces fall faster now, and every word scores ×2. |
| Stack reaches the top fifth | Careful! | The stack is near the top. Spell words to bring it back down. |

**Game-over summary.** One fact per line: words, level and longest chain; best word; full rows. A beaten record turns "Game over" into "New best!". Your best games are listed in the scoreboard's My best tab.

## Sound

Made in the browser with the Web Audio API (`src/sound.js`): no audio files to load or license, and bubbly to match the look.

| Moment | Sound |
|---|---|
| Move / rotate | Soft tick / quick rising blip |
| Piece locks | Soft thump |
| Word | A bubbly bloop, two semitones higher per extra letter. Several words in one wave play one after another. |
| Chain | A rising three-note run, a step higher each wave, so a long chain climbs a scale |
| Full row | A dull falling whoosh |
| Level up / game over | A short rising jingle / a falling three-note phrase |
| Buttons / posting a score | A soft tap / a little three-note cheer |

- **Sound on/off:** the speaker button under Pause, and "Sound" in the Rules panel. It's on by default and remembered per device (`alphaboom.sound`).
- **Tips and the countdown:** a two-note chime when a tip pops up, a beep for each of 3-2-1, and a rising "go".
- **Browsers only allow sound after a tap,** so it starts on the first tap anywhere, usually Start.
  - Safari on iPhones only counts the end of a tap (touchend or click), not its start. The sound wakes on all of them and plays a one-sample silent sound inside the tap to start iOS audio.
  - After a phone call or app switch, the next tap restarts it.
- **On iPhones,** the "ambient" audio session follows the ring/silent switch, as Apple recommends for game sound effects, and mixes with music that's already playing.
  - **With the phone on silent, there's no sound.**
  - To play even on silent, set `navigator.audioSession.type` to `'playback'` in `src/sound.js`. That also pauses the player's music.
- Moves while a direction is held are thinned out to one tick every 40 ms.
- A compressor keeps big chains from clipping.

## Core loop

- **The board is 10 × 10 (v0.8).** It was 10 wide by 20 tall until playtest 3, when the stack rarely got past the fourth row.
- The 7 classic tetrominoes fall, each carrying 4 letter tiles.
- Rotating a piece rotates its letters with it, so an I-piece flipped 180° reads backwards.
- **Word clear.** When a piece locks, every row is read left to right. Any word of 3 or more letters inside a run of touching tiles disappears. Rows don't need to be full.
- **Only across words count (v0.7).**
  - Vertical words (columns read top to bottom) were added in v0.4 and removed after Playtest 2 made the game too easy.
  - The code is kept behind `VERTICAL_WORDS` in the config.
  - When it was on, a tile could belong to both an across word and a down word, and both scored.
- Within a run, a small dynamic-programming pass chooses the highest-scoring set of words that don't overlap. Ties go to the set that clears more tiles. So `XCATSZ` clears CATS rather than CAT, and `CATDOG` clears both CAT and DOG.
- **Full rows clear, but don't score.** A completely full row clears even if it holds no word. Its tiles fade out grey rather than flashing gold, and it's worth 0 points.
  - Words stay the only way to score.
  - A wave that only clears full rows doesn't advance the chain.
  - This safety valve was added in v0.4. Without it, even a strong player falls behind, because every piece adds 4 tiles and words cleared only about 2.5 of them (see Benchmark).
- **Gravity: gaps close after every clear (v0.6).**
  - When anything clears (a word or a full row), every tile on the board drops straight down to fill the empty cells beneath it.
  - Gaps can still form when a piece lands, but the next clear closes them all.
  - Before v0.6, only the tiles directly above a cleared cell dropped, so gaps stayed forever (see Playtest 1).
  - `CLOSE_GAPS` in the config turns this off.
- Tiles that drop can form new words, which starts another **chain wave**. Waves repeat until nothing clears, and then the next piece spawns.
- The game ends when a new piece can't spawn, or a piece locks above the top.

## Letter rules (the Tile Director, `src/tiles.js`)

The aim is randomness that still feels fair.

| Rule | Value | Why |
|---|---|---|
| Two shuffle-bags (vowels, consonants) | Counts per 200 tiles match how often each letter appears in the 3–5 letter everyday words. **Vowels:** A17 E21 O14 I11 U7. **Consonants:** S21 R12 T11 L11 D9 N9 P7 C6 H6 M6 B5 G5 Y5 F4 K4 W4 V2 J1 X1 Z1 Qu1 | A bag refills only when empty, so every letter turns up at its fair rate and long droughts can't happen. This is the same idea as Tetris's 7-bag. |
| Vowels per 4-tile piece | 1 / 2 / 3 at 45% / 50% / 5% | That's about 40% vowels; short everyday words are about 35%. Every piece is spellable. |
| Adaptive nudge | Top 4 rows of the stack: under 35% vowels → +1 vowel; over 60% → −1 | A rubber band against consonant pile-ups. |
| Helper letters | 35% of pieces swap one tile for a letter that would finish a word already on the board | The board can always be fed. See below. |
| Rare letters (J K Qu X Z) | At most 1 per piece, and never in back-to-back pieces | Stops unplayable clumps. |
| Q | Always arrives as one **Qu** tile | Makes Q usable (QUIZ, QUA, QUIT). |
| Blank ✦ | About 5% of pieces; it replaces a consonant, preferring a rare one | A wildcard pressure valve, scoring 0 like a Scrabble blank. A word may contain at most 2 blanks. |

**Why not Scrabble's counts?**
- v0.1–0.3 used them, but Scrabble is a game where you choose where every tile goes. Here a tile lands wherever its piece falls.
- Compared with short everyday words, Scrabble's counts dealt these letters too often: Qu about 6×, J, X and Z about 2×, and I 1.8×.
- They dealt S only a third as often as it's needed. Scrabble keeps S scarce on purpose, but plurals make it the most useful letter here.
- Vowels made up 46% of tiles.
- Letter **values** for scoring are still Scrabble's, so hard letters still pay more.

**Helper letters.** When a piece spawns, `ST.finishingLetters` looks for open word ends a piece could reach:
- **At either end of a run in a row:** the cell must be empty, with nothing above it, resting on the floor or on a tile.
- **On top of a column**, only when the shelved vertical words are switched on.

It lists the letters that would finish a word there, giving longer words more weight. Qu, X and Z are never offered. With a 35% chance, the piece swaps one tile for one of those letters, vowel for vowel or consonant for consonant, so the vowel quota holds.

Tests check these rules over 10,000 generated pieces (`test/tiles.test.js`, `test/rules.test.js`).

Letters are picked when a piece spawns, so the adaptive nudge and the helper letters always react to the stack as it is right now.

**Game log.** After a game ends, "Copy game log" copies a text summary:
- every piece's letters, with helper letters marked;
- the words found;
- the final board.

Paste it into a conversation to look at what came up.

## Saved sessions (playtesting)

Every game is saved (`src/sessions.js`), so a session a person played can be reviewed afterwards. Where it goes depends on where the page runs:
- **The website (Vercel):** the Supabase project `alphaboom`, anonymously. See "Hosting and saving" below.
- **The Claude-hosted page:** that page's own database, as described in the rest of this section.
- **Anywhere else** (a local file, a signed-out viewer): nothing is saved.

**What's saved, one document per game.** `Game.sessionRecord()` builds it.

The game as a whole:
- the settings and the seed;
- score, level, words and longest chain;
- play time, not counting pauses;
- the number of pauses;
- the final board;
- `build`: which copy played it (`env`, `branch`, `commit`, from `src/deploy.js`), so games can be compared before and after a rule change;
- `input`: control presses by kind (`keyboard`, `touch`, `mouse`).

For **every piece**:

| Field | What it records |
|---|---|
| `letters` | The piece's letters |
| `helper` | The helper letter swapped in, if any |
| `offered` | The letters that would have finished a word at that moment |
| `x`, `y`, `rot` | Where it landed and its net rotation |
| `moves`, `rotations` | How many moves and rotations the player made |
| `thinkMs` | Time from spawn to lock |
| `softCells` | Cells soft-dropped |
| `words` | The words it made, with direction, points and chain |
| `junkRows` | Full rows it cleared |
| `junkTiles` | Tiles cleared in those rows that weren't part of a word |
| `board` | The board after everything settled |

**When it's saved:**
- when a game starts;
- every 3 pieces (10 until playtest 6, which lost a short game);
- on pause, including leaving the app;
- at game over.

**Where it's saved on the Claude page:** `sessions/<player id>/games/<game id>`, plus `sessions/<player id>` = `{ lastGame, lastPlayedAt }` so players can be listed.

**Who can read and write it.** The database rules let each player write only their own subtree. Only the page's owner and its editors can read everyone's sessions. The Rules panel says this to players.

**Size.** A 100-piece game is about 50 KB. The cap is 256 KB per document; above it, boards are kept for every 5th piece only.

**When nothing is saved.** With no database (a local file, or a signed-out viewer), nothing is saved and the game plays normally.

## Hosting and saving (the website)

**Name.** The game was renamed from Scrabble-Tetris to **Alphaboom** for hosting, to keep both trademarks out of anything players see. "Wordfall" and most "-fall" names were already taken by other word games. A web search found no other Alphaboom, but that isn't a trademark search: do one before an app-store release.

**Vercel.**
- Project `alphaboom` in the Hobby team, linked to this GitHub repo. Every push to `main` deploys to production; other branches get preview deployments.
- `vercel.json` runs `node scripts/build-web.mjs`, which copies `index.html` and only the files it loads (style, scripts, word list, definitions, favicon) into `dist/web`. Scripts, tests and docs aren't published.
- The word list and definitions are cached for a day.

**Supabase (project `alphaboom`, region ap-south-1, free plan).**
- **Table `games`, one row per game:** `id`, `player_id`, `status`, `score`, `words`, `piece_count`, `level`, `started_at`, `saved_at`, plus `record`, the full session record described above (as JSON).
- **Function `save_game(p_id, p_player, p_record)`:**
  - It's the only way in, and only the public `anon` role may call it.
  - It checks the id's format and caps a record at 256 KB.
  - It inserts or updates the row, but updates only when the player id matches, so nobody can overwrite another player's game.
- **Row-level security is on with no policies,** so the public key can't read, list, insert or delete rows directly. Supabase's security advisor notes both on purpose: "RLS enabled, no policy" and "anon can execute a security-definer function".
- **The page's settings** are in `src/backend-config.js`: the project URL and the publishable key, which is meant to be public. Empty the URL there to turn website saving off.

**Scoreboard (`supabase/scoreboard.sql`, applied as migration `scoreboard`).**
- **Table `scores`, one row per posted game:** `game_id` (the game in `games`), `player_id`, `nickname`, `score`, `words`, `level`, `best_word`, `best_points`, `posted_at`.
- **Function `post_score(p_game, p_player, p_nickname)`:**
  - It posts a finished game that the same player saved, or renames an already posted one.
  - The score is copied from the saved game, not taken from the request.
  - It checks that the saved score equals the record's word points plus its soft-drop points. All four finished games in the database passed this check when it was added.
  - It returns your best posted score's rank and how many players are on the board.
- **Function `top_scores(p_player, p_limit)`:** each player's best posted game under their latest nickname, top `p_limit` (up to 50), plus the caller's own row. It returns `mine` instead of player ids, so ids never leave the database.
- **Locked down like `games`:** row-level security on with no policies, no table grants for `anon`, and only `anon` may call the functions.
- **It's a friendly board, not a cheat-proof one.** Someone could forge a whole game record through `save_game` and post it.
- **To remove an entry:** `delete from scores where game_id = 'g-…';`

**Sandbox: testing without touching the live board** (`supabase/sandbox.sql`, migration `sandbox_v2`).
- **Only the live site uses the live board.** Every preview link (each branch's `alphaboom-git-<branch>-…vercel.app`) and every local copy is a sandbox: its games are saved with `sandbox = true`, and its scoreboard shows and posts to the sandbox board.
- **How a copy knows:** `scripts/build-web.mjs` stamps `src/deploy.js` with Vercel's `VERCEL_ENV` and the branch name. `production` is live; `preview`, and `development` (the checked-in file, for local copies), are sandboxes. A Vercel build without `VERCEL_ENV` says `unknown` and counts as live, which is how the game behaved before the sandbox.
- **You can see it:** a sandbox shows a yellow "Sandbox · <branch>" tag in the bottom-left corner, and its scoreboard says "Sandbox board. Scores posted here stay off the live scoreboard." The live site shows neither.
- **Database:** `games.sandbox` and `scores.sandbox`. The page calls `save_game_v2`, `post_score_v2` (a score goes on its game's board) and `top_scores_v2` (one board). The first versions are kept unchanged so pages already open keep working; they save and post live.
- **Reading only real players' games:** add `where not sandbox`.
- **To move a test score off the live board,** or clear the sandbox board, see the top of `supabase/sandbox.sql`.

**Players are anonymous unless they post.**
- Each browser gets a random player id (`localStorage alphaboom.player`), so one person's games group together. There's no account or email.
- The only name stored is a nickname a player types to post a score.
- The Rules panel tells players: "Games are saved anonymously to help improve Alphaboom… If you post a score, the nickname you type is shown with it on the scoreboard."
- **Reading the board:**

  ```sql
  select nickname, score, words, best_word, posted_at from scores order by score desc limit 20;
  ```

**Reading games.** Use the Supabase dashboard, or SQL with the project's own access (not the public key), for example:

```sql
select id, player_id, status, score, words, piece_count, saved_at
from games order by saved_at desc limit 20;

select record from games where id = 'g-…';   -- the full game, same shape as the Claude page's
```

**Free-tier limits.** Supabase pauses a free project after a week with no activity; restore it from the dashboard. Vercel's Hobby plan is for non-commercial use.

## Product analytics (PostHog)

Supabase keeps every game in full; PostHog (`src/analytics.js`) answers the questions about players: where new players get stuck, which tutorial card they leave on, and whether they come back. It's the PostHog project "Alphaboom" on the US cloud; the project key in `src/backend-config.js` is meant to be public (it can only send events). Set it to `''` to turn analytics off.

**Where it runs.** Only the live site. Every sandbox sends nothing: preview links and local copies, by the same rule that keeps them off the live scoreboard (`src/deploy.js`). The Claude page and local files send nothing either. So everything in PostHog is real players, and testing on a preview link never shows up there. The first events arrive once a change reaches `main`.

**Events.** A handful per visit; the per-piece detail stays in Supabase.

| Event | When | Main properties |
|---|---|---|
| `$pageview`, `$pageleave` | The page opens and closes | (PostHog's own) |
| `game_started` | A game begins | `from` (start, play_again, pause_screen), `game_number` on this device, `first_game` |
| `first_word` | The first word of each game | `word`, `pieces`, `play_ms`, `first_game` |
| `game_over` | A game ends | `score`, `words`, `level`, `pieces`, `play_ms`, `max_chain`, `chain_words`, `best_word`, `longest_word`, `avg_word_len`, `words_3`/`words_4`/`words_5_plus`, `words_per_piece`, `full_rows`, `full_row_tile_pct`, `helper_pieces`, `helper_hits`, `pieces_to_first_word`, `input` |
| `tutorial_closed` | How to play closes | `auto` (opened by itself), `furthest_card`, `finished`, `first_visit` |
| `tip_shown` | A first-time tip pops up | `tip` (word, chain, row, level, danger) |
| `scoreboard_opened`, `score_posted` | The scoreboard opens; a score is posted | `can_post`; `score`, `rank`, `players` |
| `game_log_copied`, `sound_toggled` | | `on` |

Every event also carries `deploy_env`, `branch`, `app_version` (the commit), `layout` (phone or wide) and `touch_screen`.

- **`full_row_tile_pct`**: of all tiles cleared in the game, the share that went in full rows, which score nothing. Playtest 8's 62% is this number. It uses `junkTiles`, so it's exact for games from this version on.
- **`helper_hits`**: pieces given a helper letter that made a word on landing (chain 1). Divide by `helper_pieces` to see whether `HELPER_CHANCE` earns its place.
- **`game_number`** counts games started on the device. Counting began with analytics: a device that already had a best score starts at 1, so it isn't taken for a new player.

**Same player id.** PostHog's id is the anonymous player id the saved games use (`alphaboom.player`), so a PostHog person and their `games` rows join on `player_id`.

**Privacy.** `persistence: 'memory'`, so PostHog sets no cookies and stores nothing on the device; each visit is a PostHog session. Autocapture is off (the control pad would send an event per tap). Session recordings mask every text box, so nicknames aren't recorded. JavaScript errors are sent for Error Tracking. The Rules panel tells players.

**Project settings to switch on in PostHog** (they live there, not in the code):
- Session replay → **Canvas capture**. The board is a canvas, so without it recordings show an empty well.
- Error tracking → turn on exception autocapture, if it isn't already.

## Points

- **Letter values are Scrabble's:** A1 B3 C3 D2 E1 F4 G2 H4 I1 J8 K5 L1 M3 N1 O1 P3 Qu10 R1 S1 T1 U1 V4 W4 X8 Y4 Z10, and ✦0.
- **Word score** = (sum of the letter values) × length multiplier × 10.
- **Length multipliers:**

  | Letters | 3 | 4 | 5 | 6 | 7 | 8+ |
  |---|---|---|---|---|---|---|
  | Multiplier | ×1 | ×2 | ×3 | ×5 | ×8 | ×12 |

  A Qu tile counts as 2 letters.
- **Examples:** CAT 50, QUIZ 420, TRAINS 300.
- **Chain:** the n-th wave of a cascade scores ×n.
- **Level:** every word is also multiplied by the level. The level goes up every 10 words, and each level makes pieces fall 15% faster.
- **Drops:** holding Down scores +1 per cell.

## Dictionary: everyday words

Only common everyday English words count. Rare Scrabble words don't, and neither do words that read as abbreviations or names.
- **The list (v0.9):** ENABLE1 ∩ SCOWL size 35, with US + UK spellings, minus `scripts/blocklist.txt`, plus `scripts/allowlist.txt`. That's 38,790 words of 3–12 letters.
  - **ENABLE1** is a public-domain Scrabble-style list. It contributes clean, lowercase entries with no names or abbreviations.
  - **SCOWL** is the list behind standard spell-checkers. Size 35 is its "small" dictionary of common words.
  - **The blocklist** holds 22 words that pass both lists but read as abbreviations, names, plurals of short words, or Latin: IFS, OHS, COX, LEE, MOD, QUA and others. Each group has a comment explaining why. Add to it whenever a word like that slips through.
  - **The allowlist** adds everyday words the base lists leave out, about 260 in all. Each one's forms (plurals, -ed, -ing) are listed too.
    - ENABLE drops words that dictionaries capitalise, even when people use them in lowercase: ZEN ("very zen").
    - The size-35 cut also dropped everyday words that SCOWL ranks at 40 or 50: EMU, OAT, FAX, ZAP, SOY, TOFU, KALE, NERD, BEEP, OOPS, YEAH and about 110 more. They were hand-picked in playtest 7 from every 3–4-letter word at those sizes; abbreviations, crude words, names and archaic words stayed out.
    - One section holds short forms of longer words (SAX, LIMO, MAYO, DEMO, TYPO). Delete it if they read as abbreviations.
- **History:**
  - **v0.1–0.2** used all of ENABLE1 (152k words). It accepted OKE (a Turkish unit of weight), PAC (a winter boot) and DOL (a unit of pain).
  - **v0.3–0.8** used SCOWL size 50 (58,771 words). In playtest 4 it still let through EMS, SIS, SIM, DIS, POI, LEI, ERE, BAH and FEY, almost all from SCOWL's rarest tiers (40–50).

| Kept | Dropped |
|---|---|
| CAT, CATS, DOG, WOW, ERA, TEEN, AYE, DIE, HOG, AXE, QUIZ, QUIT, DEAN, HAM, TRAINS; OAT, BAH and EMU are back through the allowlist | GAR, TUT, OKE, PAC, DOL, ZAX, EME, ANA, BOXY, EMS, SIS, SIM, DIS, POI, LEI, ERE, FEY, MID, TORT, PEE, IFS, OHS, COX, QUA |

`data/LICENSES.md` holds the licence notices for every source. All of them allow use in a paid app as long as the notices are included.

## Definitions

Each word in "Words found" shows a short definition, so players can see why a word counted.

Every word in the list gets its definition at build time, in this order:
1. **Hand-written supplement** (`scripts/supplement-defs.json`), covering about 200 words.
   - These are function words and interjections that WordNet lacks (THE, AND, SHE, WITH, HEY), and newer words such as KETO and FETA.
   - It also fixes words WordNet misreads: HIS would otherwise be the plural of "hi", WHO the World Health Organization, and US the United States. Playtest 7's words needed many more: EMU ("units of electricity"), KALE ("money"), TUTU and YOGI (two famous people), LYNX ("a text browser") and PING ("a river in Thailand").
2. **WordNet 3.0 entry for the word itself.** Use the most-used sense. A noun wins when another sense is only slightly more used, so HOG and QUIZ read as nouns.
3. **The base form.** This covers irregular forms from WordNet's exception lists (WENT → go, MICE → mouse) and suffix rules (CATS → cat, BOGGED → bog, CHALKIER → chalky, ADEPTLY → adept). When there are several candidates, the most-used sense wins, so DIES means the verb die, not dice.
4. **A supplement word's base form**, when WordNet knows neither: NERDIER → nerdy, PREPPED → prep.

Coverage is 98.9% of the list, and every allowlisted word has a definition (a test checks it). Every common word is covered, and the gaps are rare inflections such as DIALINGS. A word with no definition shows "Everyday word, no short definition yet."

Glosses are cut at WordNet's example sentences and trimmed to 100 characters. `data/definitions.js` is about 1.7 MB, because each distinct definition text is stored only once.

## Benchmark

`npm run benchmark` has a computer player try every rotation and column for each piece. It places each piece where it clears the most tiles while keeping the stack low, playing 40 seeded games capped at 400 pieces.

Every piece adds 4 tiles, so the game is sustainable only when clearing comes close to 4 tiles per piece.

| Rules | Median pieces | Tiles cleared per piece | Words per game | Games reaching 400 |
|---|---|---|---|---|
| v0.3: Scrabble counts, across only | 99 | 2.39 | 74 | 0/40 |
| v0.4, across only | 400 | 3.68 | 280 | 22/40 |
| v0.4, across and down | 170 | 3.61 | 208 (55% down) | 0/40 |
| v0.6 (gaps close), across and down | 400 | 3.98 | 445 (49% down) | 40/40 |
| v0.7 (gaps close), across only (current) | **400** | **3.98** | 317 | **40/40** |

A human clears far less than this computer player does. In Playtest 1, the player cleared 1.62 tiles per piece, against the computer player's 3.61 under the same v0.4 rules. The computer player can't tell "too easy" from "just right", which is what the human playtests are for.

How much each v0.4 change helped, across only, measured one at a time:

| Change | Median pieces |
|---|---|
| Letters matched to everyday words | 99 → 108 |
| Plus helper letters | 118 |
| Plus full rows clearing | about 350–400 |

**Vertical words on their own** are the biggest boost to word clears. On v0.3 rules they took the median from 99 to 134 pieces and doubled words per game. But with the full-row valve, the computer player does better across only: chasing column words leaves fewer complete rows.

Playtest 2 settled it the other way: vertical words made the game too easy for a person, so they're shelved (v0.7). This computer player isn't a human, so treat these numbers as a comparison between rule sets, not a difficulty rating.

A separate random-placement bot finds only about 1.9 words per game, so words don't clear themselves by accident. A 4-letter minimum is a real "hard mode".

## Playtest 1 (v0.5 rules, saved session, 6 Nov 2026)

One game on a phone, words read across and down:
- **Result:** 51 pieces in 5 min 24 s of play; 27 words; 2,903 points; level 3.
- **Check:** replaying the saved moves reproduced the saved final board tile for tile.

**What held the game back:**
- **Gaps buried under tiles.** There were 0 at the start, 13 by piece 24 and 41 at the end, about 20% of the board.
  - The big ones came from landings that left overhangs, at pieces 5, 24, 27, 35 and 40.
  - With a gap in almost every row, no row ever filled, so the full-row valve never fired.
  - The player cleared 1.62 tiles per piece, against the 4 each piece adds, and the middle columns reached the top at piece 50.
  - **Fix:** gaps now close after every clear (v0.6).
- **Words not spotted.** 28 of the 50 placed pieces made no word, and in 26 of those, some landing spot would have. Examples:
  - IERO had 20 spots that made a word (ORE, RISK down).
  - BUCG had 19 (CUB, KEG).
  - DCEW had 12 (CORK, WET).
  - This points to "show words at the landing spot" (below).

**What worked:**
- **Helper letters:** 5 of 10 ended up in words, including PING +280 and SILL +240.
- **Vertical words:** 11 of 27 words were down words.
- **Chains:** a triple on piece 10 (IMP, then VENT, then LEE).

**Pace:**
- Early pieces took 10–14 s each.
- The average was 6.5 s.
- With the stack high and play at level 3, the last ten pieces took 2–3 s each.

**Letters:**
- 44.6% vowels. The adaptive nudge gave 3-vowel pieces 14% of the time, against 5% by design.
- Some odd words still count (ALB, FER, LEI, ETA).

## Playtest 2 (v0.6 rules, 6 Nov 2026)

One game on a phone. Words were read across and down, and gaps closed after every clear:
- **Result:** 120 pieces, 79 words, 23,520 points, level 8.
- **Compared with Playtest 1:** more than double the pieces, nearly 3× the words, and 8× the score.

**Verdict: too easy.**
- 38 of the 79 words (48%) read downward.
- Down words, gaps closing and full rows clearing kept setting off chains. The biggest scores came from them: WISH +2,400, DEBT +1,120 and PaLE +800.
- The game ended when the middle columns grew into a tower (the board's top rows held ITCS and EI in columns 3–6), while the sides stayed low.

**Change (v0.7):** vertical words removed. Gaps still close, and full rows still clear. The control buttons were also swapped: Rotate alone on the left, and Down wide under Left and Right.

## Playtest 7 (7 Nov 2026): vowel floor, and EMU

| | Weighted, vowel floor | Main game |
|---|---|---|
| Pieces | 35 | 73 |
| Words / score | 10 / 745 | 23 / 3,182 |
| Words per piece | 0.29 | 0.32 |
| Vowels | 38.6% | 43.2% |
| Pieces with 0 / 1 / 2 / 3 vowels | 0 / 57 / 31 / 11% | 0 / 34 / 59 / 7% |

- **The vowel floor worked:** no weighted piece lacked a vowel. Most still had only one, against two in the main game.
- **The weighted letters also ran unlucky:** H 7.9% (expected 5.7%) and F 4.3% (1.9%), but A, O and S short at 5.7%, 4.3% and 4.3%. Over 140 letters that's plausibly chance.
- **EMU didn't count.** SCOWL ranks it at size 50, beyond the size-35 cut. A hand-picked batch of about 120 everyday short words from sizes 40 and 50, with their forms, is now on the allowlist (see Dictionary).

## Playtest 6 (7 Nov 2026): the weighted letters ran short of vowels

The player found the weighted-letters experiment had barely any vowels, and the main game played better. The saved games agree:

| | Weighted experiment (6 Nov, 29 pieces) | Main game (7 Nov, 37 pieces) |
|---|---|---|
| Vowels among all letters | 36% | 44% |
| Pieces with no vowel | 4 (STNR, SRCR, NTNN, RHNY) | 0 |
| Pieces with at most one vowel | 59% | 43% |

- **Why:** the experiment's weights give vowels 38% of letters and nothing guarantees one per piece, so 0.616⁴ = 14% of pieces have none. The main game's vowel quota always deals 1–3 per piece.
- **Main game:** its letter system stays.
- **Experiment:** gets a vowel floor (at least one vowel per piece) and will be played again; see `docs/letter-generation.md` on that branch.
- **Saving:** a weighted game played today saved only its first piece (W L S H), because games saved every 10 pieces. Both versions now save every 3.

## Playtest 5 (6 Nov 2026): main game against the weighted-letters experiment

| Version | Pieces | Words | Score |
|---|---|---|---|
| Weighted-letters experiment (`experiment/letter-frequency`) | 29 | 10 | 577 |
| Main game, stricter word list | 60 | 20 | 2,503 |

- **The experiment felt better and more challenging.**
- **LEE** was accepted but read as a name. It's now on the blocklist.
- **ZEN** didn't count, though it lined up on row 7 (OZENEEM) after piece 48. ENABLE leaves it out because dictionaries capitalise it ("Zen"). It's now on the new allowlist, with an everyday definition.

## Playtest 4 (v0.8 rules, 10 × 10 board, 6 Nov 2026)

- **Result:** 147 pieces, 69 words, 20,456 points, level 7.
- **Words that felt wrong.** Several words read as abbreviations or names: EMS ("a quad with a square body"), SIS, SIM, DIS, POI, LEI, OHS, IFS and COX.
  - **Change (v0.9):** stricter word list plus blocklist (see Dictionary).
- **Letters that felt too random.** The player wrote a spec for a weighted letter system: English-frequency weights plus recent-letter balancing. It's being tried on a separate branch, `experiment/letter-frequency`, with its own playable link, so the two can be compared.

## Playtest 3 (v0.7 rules, 6 Nov 2026)

On v0.7, words counted across only, gaps closed after each clear, and the landing shadow showed letters.
- **Verdict:** still too easy. Clearing kept the stack so low that it rarely got past the fourth row of the 20, so most of the board went unused.
- **Change (v0.8):** the board is 10 rows tall instead of 20. Less room means mistakes matter sooner.

The computer player can't judge this. It clears 3.98 of the 4 tiles each piece adds and reached the 400-piece cap in all 40 games at 20, 12 and 10 rows. Human playtests are the measure from here.

## Later-phase ideas

- **Show words at the landing spot.** While a piece moves, its shadow would highlight the words it would spell where it lands, with the points. Playtest 1 found a word was available for 26 of the 28 pieces that made none.

- **Letter cycle.** This would keep the shape and shift each letter one step along the piece (ABCD → DABC).
  - It was tried in v0.1, but it was too easy to confuse with Rotate, because both move letters around. It's shelved for now.
  - The logic is still in the code: `ST.cycleLetters` and `Game.cycle()`, behind `CYCLE_LETTERS` in the config.
  - Before bringing it back, decide how to keep the two visibly separate. One idea: Rotate changes only the shape and the letters always keep their reading order, while Cycle is the only thing that changes letter order. It would also need its own button style and animation.
- Scrabble premium squares (DL / TL / DW / TW) fixed into the well.
- Earning a blank by spelling a word of 6+ letters.
- A profanity filter for the word list. SCOWL size 35 still contains some vulgar words; `scripts/blocklist.txt` is the place to add them.
- An optional "Scrabble expert" mode that accepts the full ENABLE list.
- Sound, daily seeded runs, and a high-score table.
