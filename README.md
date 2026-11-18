# Block Pop – Block Puzzle

A relaxing 8×8 block puzzle you can install on iPhone and Android as a standalone app (Progressive Web App). No app store, no ads, works offline.

**Play:** https://chadant1.github.io/block-pop/

## How to play
- Drag one of the three pieces onto the board.
- Fill a full row **or** column to clear it.
- When all three pieces are used you get three new ones.
- The game ends when none of your remaining pieces fit.

### Scoring
- 1 point per block placed.
- Line clears: 10 / 30 / 60 / 100 … for 1 / 2 / 3 / 4 lines at once.
- **Combo:** keep clearing lines (within 3 placements of each other) to multiply line points by your combo streak.
- Clearing the whole board: +300.

## Install on your phone
**iPhone (Safari):** open the link → tap **Share** → **Add to Home Screen**.

**Android (Chrome):** open the link → tap **⋮** → **Install app** (or **Add to Home screen**).

It then launches full-screen from its own icon, saves your game and best score, and works without internet.

## Files
| File | Purpose |
|---|---|
| `index.html` | Page shell and HUD |
| `style.css` | Styling |
| `game.js` | All game logic and canvas rendering |
| `sw.js` | Service worker for offline play (bump `CACHE` when you change files) |
| `manifest.webmanifest` | Makes it installable as an app |
| `icons/` | App icons |

Run locally with any static server, e.g. `python3 -m http.server`.
