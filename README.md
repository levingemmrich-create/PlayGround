# PlayGround

<!-- omgithub:readme:start -->
## 🚀 Build, play, and remix with OMGithub

**Created using [OMGithub.com](https://omgithub.com).**

[![OMGithub](https://img.shields.io/badge/OMGithub-Open%20project-orange?style=for-the-badge)](https://omgithub.com/levingemmrich-create/PlayGround)
[![GitHub](https://img.shields.io/badge/GitHub-Source-181717?logo=github&style=for-the-badge)](https://github.com/levingemmrich-create/PlayGround)

- 🎮 [Open the project](https://omgithub.com/levingemmrich-create/PlayGround).
- ✨ [Remix this project](https://omgithub.com/?remix=levingemmrich-create%2FPlayGround).
- 💻 [Explore the source](https://github.com/levingemmrich-create/PlayGround).
- 🛠️ [Check build runs](https://github.com/levingemmrich-create/PlayGround/actions).
- 🐛 [Report an issue](https://github.com/levingemmrich-create/PlayGround/issues).
- 👤 [Explore the creator's projects](https://omgithub.com/levingemmrich-create).
- 🌍 [Create with OMGithub](https://omgithub.com).
<!-- omgithub:readme:end -->

## Bloodchess

Standard chess — except nothing is cleaned up. Every captured piece leaves a body on the square where it fell, with a blood splatter that stays for the rest of the game. Corpses are visual only: they never block movement or change the rules.

- **Play the machine** — Casual (depth 2, makes mistakes), Ruthless (depth 3), or Merciless (depth 5).
- **Two players, one phone** — pass-and-play, with an optional board rotation after each move.
- **Full rules** — castling, en passant, promotion, check, checkmate, stalemate, insufficient material, the fifty-move rule, and threefold repetition.
- **Take it back** — undo restores the board, the bodies, and the kill tally. In bot games, undo rewinds both your move and the bot's reply.
- **Sound, haptics, and a move log** — toggle the effects from the header at any time.

### Play

No build step or dependencies. Serve the folder with any static server:

```bash
python3 -m http.server 3002
```

Then open <http://localhost:3002>. On a phone, use the same URL with your computer's LAN address.

### Controls

Tap a piece, then tap a highlighted square to move. Tap the selected piece again to cancel. Use the header buttons for sound/haptics, board flip, and the menu. The side panel has undo, rematch, and the move log.

### Tests

The rules engine is standalone and tested with perft plus targeted rule assertions:

```bash
node tests/engine.test.js
```
