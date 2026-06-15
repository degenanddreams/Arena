# Arena — Local Build

Browser-based top-down RPG inspired by Old School RuneScape. Local single-player
development build: Phaser 3 client + Node/Express server + SQLite. All blockchain
interactions are mocked with the hardcoded test wallet `test_wallet_001`.

See `CLAUDE.md` for the full specification — it is the single source of truth.

## Setup

```bash
npm install
```

## Run

```bash
npm start        # or: npm run dev (nodemon)
```

Game at: http://localhost:3000

The database file `server/arena.db` is created and seeded automatically on first run.

## Current state

- Express server with SQLite (`players`, `inventory`, `bank`, `equipped`, `items` tables, items seeded)
- REST API: `POST /api/player/create`, `GET /api/player/:wallet_address`, `PUT /api/player/:wallet_address`
- Phaser world with three connected zones: Lobby (grey stone), Training Grounds (dirt brown), Boss Cave (dark stone)
- Point-and-click movement with A* pathfinding
- Player placeholder sprite with name label
- Camera: scroll to zoom, left/right arrow keys to rotate in 90° steps
- HUD: player name + HP bar

Combat, XP, inventory UI, NPCs, boss, and tutorial arrive in subsequent prompts.

## Controls

| Input | Action |
|---|---|
| Left click | Walk to tile |
| Mouse scroll | Zoom in/out |
| Left/Right arrows | Rotate camera 90° |
