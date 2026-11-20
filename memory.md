# Alphaboom change history

A dated record of every rule, UI, backend and analytics change, oldest first. DESIGN.md says how the game works now. This file says when each change happened and why. Add new entries at the bottom, in the same commit as the change (see CLAUDE.md).

The entries up to 2026-11-20 were rebuilt from the git history and DESIGN.md.

## 2026-10-16: First playable prototype (v0.1)
- Scrabble-Tetris: the 7 classic pieces, each carrying 4 letter tiles. Spelling a word across or down a row clears it.
- Letters came from Scrabble's tile counts, and words from the full ENABLE1 list (152k words). It included Hold, a Next preview and a "letter cycle" move (ABCD → DABC).

## 2026-11-06: Phone only, simpler controls
- The game was made for phones only, with a simpler control pad.
- The letter cycle was shelved because it was too easy to confuse with Rotate. It stays in the code behind `CYCLE_LETTERS`.

## 2026-11-06: Everyday dictionary with definitions; Hold and Next dropped (v0.3)
- The dictionary moved to SCOWL size 50, to stop odd words like OKE, PAC and DOL from counting.
- "Words found" now shows a short WordNet definition for each word.
- Hold and the Next preview were removed because nobody used them, which gave the board more room.

## 2026-11-06: Fairer letters, helper letters, full-row clears, vertical words (v0.4)
- Letters now come from vowel and consonant shuffle bags, matched to everyday words, with 1–3 vowels per piece. Rare letters are capped, and Q always arrives as one Qu tile.
- Helper letters: 35% of pieces carry one letter that finishes a word already on the board.
- A full row now clears even with no word in it, but it scores nothing. This was a safety valve: the benchmark bot fell behind without it.
- Words reading down a column count too.

## 2026-11-06: Every game saved for review (v0.5)
- Every game is saved piece by piece on the Claude-hosted page, so playtests can be replayed and studied.

## 2026-11-06: Gaps close after every clear; control pad regrouped (v0.6)
- After any clear, every tile drops to fill the gaps below it.
- Why: in Playtest 1, buried gaps covered about 20% of the board, so no row ever filled.

## 2026-11-06: Vertical words removed; Down and Rotate swapped (v0.7)
- Only words reading across count now. The vertical-word code is kept behind `VERTICAL_WORDS`.
- Why: in Playtest 2, 48% of words were down words, and the game felt too easy.
- Rotate now sits alone on the left in red, with Down wide under Left and Right, because the two buttons kept getting confused.

## 2026-11-06: Letters shown in the landing shadow (v0.7)
- The landing outline now shows the letter that will land in each cell, so players can see the word before it drops.

## 2026-11-06: Board halved to 10 rows (v0.8)
- The board went from 10 × 20 to 10 × 10.
- Why: in Playtest 3 the stack rarely got past row 4, so most of the board went unused.

## 2026-11-06: Common words only, plus a blocklist (v0.9)
- The dictionary is now ENABLE1 ∩ SCOWL size 35, minus a blocklist of words that read as abbreviations or names.
- Why: Playtest 4 let through EMS, SIS, SIM, DIS, POI and others.

## 2026-11-07: LEE blocked, ZEN allowed
- From Playtest 5: LEE reads as a name, and ZEN is an everyday word that ENABLE leaves out. This added `scripts/allowlist.txt`.

## 2026-11-07: Games saved every 3 pieces
- Games used to save every 10 pieces, and Playtest 6 lost a short game. Recorded Playtest 6 (the weighted-letters experiment ran short of vowels).

## 2026-11-07: About 120 everyday short words allowed
- From Playtest 7: EMU didn't count. About 120 hand-picked everyday words from SCOWL sizes 40–50, with their forms, were added to the allowlist (OAT, FAX, KALE, OOPS…).

## 2026-11-11: Renamed Alphaboom; hosted on Vercel; games saved to Supabase
- The new name keeps both trademarks out of anything players see.
- The website runs on Vercel (project `alphaboom`), and every push to `main` deploys it.
- Website games are saved anonymously to the Supabase project `alphaboom` through `save_game`. Row-level security is on with no policies.

## 2026-11-14: New look: glossy, chunky cartoon toy
- Every tile, button, badge and dialog uses one recipe: thick ink outlines, glossy colours and hard drop shadows. Tile colours follow the letter.
- Only the look changed. The rules, controls and timings are the same.

## 2026-11-17: How to play cards and a playtester scoreboard
- Four illustrated How to play cards, which open by themselves on a first visit.
- A scoreboard where players can post a finished game under a nickname (`scores` table, `post_score` and `top_scores`).

## 2026-11-17: Teaching full rows and chains during play; sound
- Banners for full rows ("+0 points") and chains, and first-time tips.
- Sound effects made in the browser with Web Audio.
- Why: Playtest 8 had 62% of cleared tiles going in full rows, which score nothing.

## 2026-11-17: Steering demo, simpler points card, sturdier iPhone audio
- The steering card became a live demo with keys you can tap.
- The points card shows CAT +50 next to TRAINS +300, replacing the multiplier table, which testers found too much.
- Sound now starts reliably on iPhones.

## 2026-11-17: Tips pause the game; row banner only twice; banners stack
- A tip now pauses the game and shows a picture from what just happened, then plays resume after a 3-2-1 countdown.
- The full-row banner shows only the first two times on a device.
- Banners stack instead of overlapping.

## 2026-11-18: "+0 points" for full rows
- The full-row banner says "+0 points", so it reads as "added nothing", not "your score is now 0".

## 2026-11-18: Sandbox: previews and local copies stay off the live scoreboard
- Preview links and local copies save to a separate sandbox board and show a yellow "Sandbox" tag. Only the live site uses the live board.
- This added `save_game_v2`, `post_score_v2` and `top_scores_v2`. The first versions are kept so pages that are already open keep working.

## 2026-11-18: First tutorial card animated with the game's own effects
- The card uses the game's drop, squash and word-pop animation. A real piece drops straight in and spells CAT, with no rotation.

## 2026-11-18: Keyboard controls and a wide laptop layout (#1)
- In a window 1000 px or wider with a mouse: three columns, a bigger board, and arrow keys or WASD. P or Esc pauses, M mutes, Space or Enter starts.
- Phones and touch tablets keep the phone layout.

## 2026-11-18: PostHog product analytics, live site only (#2)
- The live site sends a few events per visit: game started, first word, a game-over summary, tutorial progress, tips and scoreboard use. It also sends page views, session recordings with text boxes masked, and JavaScript errors.
- It sets no cookies, and it uses the same anonymous player id as the saved games. Sandboxes send nothing.
- Saved games now also record the build, control presses by kind, and `junkTiles` per piece.

## 2026-11-19: Results screen after every game (#3)
- After every game, a results screen with Performance and Leaderboard tabs replaces the game-over card.
- This added `score_standing_v2` (where a score would stand, read-only).
- The Scoreboard dialog became look-only, and "Copy game log" now shows on previews only.

## 2026-11-20: Results: score on top, Leaderboard tab first, gold Add to leaderboard (#4)
- The score sits above the tabs, and the Leaderboard tab opens first, showing "N players on the leaderboard". A gold "Add to leaderboard" button sits over the green Play again.
- Why: playtesters finished games but none posted, because the leaderboard sat unseen on a second tab.
