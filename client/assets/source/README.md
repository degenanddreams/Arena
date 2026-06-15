# Source art

Drop the original source JPEGs here, then run the asset pipeline:

```bash
npm install sharp        # once
node scripts/prepare_assets.js
```

The script copies the backgrounds as-is and crops + background-removes the
sprites into `../sprites/` and `../backgrounds/`, then writes
`../asset-manifest.js` listing what it produced. The game loads only assets
listed in that manifest, so until these files are present the game renders with
placeholder shapes (and logs nothing — no load errors).

## Required files

| Source file            | Becomes                          | Notes                                  |
|------------------------|----------------------------------|----------------------------------------|
| `Arena_Lobby.jpg`      | `backgrounds/lobby.jpg`          | copied as-is                           |
| `TRAINING_GROUNDS.jpg` | `backgrounds/training_grounds.jpg` | copied as-is                         |
| `cave2.jpg`            | `backgrounds/boss_cave.jpg`      | copied as-is                           |
| `dummy_image.jpg`      | `sprites/dummy.png`              | centre 400×600 crop, sandy bg removed  |
| `cowboss.jpg`          | `sprites/boss.png`               | left 620×909 crop, dark-brown bg removed |
| `User_Model.jpg`       | `sprites/player_male.png` + `player_female.png` | x295 y60 160×380 crop, parchment bg removed |

`Arena_Arena.jpg` (the wager combat zone) is intentionally skipped — that zone
isn't built yet.

If a source image's framing differs from the crop coordinates above, adjust the
`SPRITE_JOBS` crop boxes / background colours in `scripts/prepare_assets.js`.
