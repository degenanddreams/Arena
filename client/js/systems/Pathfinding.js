// Pathfinding.js — simple A* over the walkable tile grid (4-directional movement)
// findPath returns an array of {x, y} tile steps excluding the start tile,
// or null if no path exists.

function findPath(grid, startX, startY, endX, endY) {
  const height = grid.length;
  const width = grid[0].length;

  const inBounds = (x, y) => x >= 0 && x < width && y >= 0 && y < height;
  const walkable = (x, y) => inBounds(x, y) && grid[y][x];

  if (!walkable(endX, endY)) return null;
  if (startX === endX && startY === endY) return [];

  const key = (x, y) => y * width + x;
  const open = new Map();   // key -> node
  const closed = new Set();

  const startNode = {
    x: startX, y: startY,
    g: 0,
    f: Math.abs(endX - startX) + Math.abs(endY - startY),
    parent: null,
  };
  open.set(key(startX, startY), startNode);

  const NEIGHBORS = [[0, -1], [0, 1], [-1, 0], [1, 0]];

  while (open.size > 0) {
    // Pull the open node with the lowest f score
    let current = null;
    for (const node of open.values()) {
      if (!current || node.f < current.f) current = node;
    }

    if (current.x === endX && current.y === endY) {
      const path = [];
      let node = current;
      while (node.parent) {
        path.unshift({ x: node.x, y: node.y });
        node = node.parent;
      }
      return path;
    }

    open.delete(key(current.x, current.y));
    closed.add(key(current.x, current.y));

    for (const [dx, dy] of NEIGHBORS) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      const nKey = key(nx, ny);
      if (!walkable(nx, ny) || closed.has(nKey)) continue;

      const g = current.g + 1;
      const existing = open.get(nKey);
      if (existing && existing.g <= g) continue;

      open.set(nKey, {
        x: nx, y: ny,
        g,
        f: g + Math.abs(endX - nx) + Math.abs(endY - ny),
        parent: current,
      });
    }
  }

  return null;
}
