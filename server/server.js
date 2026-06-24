// server.js — Express entry point: mounts API routes, serves /client as static
// files, and attaches Socket.io for multiplayer (Section 32, Phase 1).
const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const { initDatabase } = require('./database');

const PORT = process.env.PORT || 3100;
const db = initDatabase();

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/player', require('./routes/player')(db));
app.use('/api/items', require('./routes/items')(db));
// combat router serves both /api/combat/xp and /api/boss/* (Section 20)
app.use('/api', require('./routes/combat')(db));
app.use('/api/inventory', require('./routes/inventory')(db));
app.use('/api/bank', require('./routes/bank')(db));

app.use(express.static(path.join(__dirname, '..', 'client')));

// /play alias — serves the game (same as root). Query string (?wallet=, ?dev=)
// is preserved by the browser, so /play?dev=maxstats works too.
app.get('/play', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

// Socket.io is additive — all REST routes above keep working exactly as before.
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

require('./multiplayer')(io, db);

server.listen(PORT, () => {
  console.log(`Arena server running on port ${PORT} — http://localhost:${PORT}`);
});

module.exports = { io };
