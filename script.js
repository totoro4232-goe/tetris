const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const PREVIEW_COLS = 4;
const PREVIEW_ROWS = 4;
const PREVIEW_BLOCK = 30;

const COLORS = {
  I: "#38bdf8",
  O: "#facc15",
  T: "#a78bfa",
  S: "#4ade80",
  Z: "#f87171",
  J: "#60a5fa",
  L: "#fb923c",
};

const SHAPES = {
  I: [[1, 1, 1, 1]],
  O: [
    [1, 1],
    [1, 1],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
  ],
};

const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
const nextCanvas = document.getElementById("next");
const nextCtx = nextCanvas.getContext("2d");
const holdCanvas = document.getElementById("hold");
const holdCtx = holdCanvas.getContext("2d");

const scoreEl = document.getElementById("score");
const levelEl = document.getElementById("level");
const linesEl = document.getElementById("lines");
const statusEl = document.getElementById("status");
const rankingListEl = document.getElementById("ranking-list");

const touchMap = [
  ["btn-left", () => move(-1)],
  ["btn-right", () => move(1)],
  ["btn-down", () => drop()],
  ["btn-rotate", () => playerRotate()],
  ["btn-drop", () => hardDrop()],
  ["btn-hold", () => holdPiece()],
];

ctx.scale(BLOCK, BLOCK);
nextCtx.scale(PREVIEW_BLOCK, PREVIEW_BLOCK);
holdCtx.scale(PREVIEW_BLOCK, PREVIEW_BLOCK);

let board = createBoard();
let current = null;
let nextType = null;
let holdType = null;
let canHold = true;

let score = 0;
let level = 1;
let lines = 0;
let dropCounter = 0;
let lastTime = 0;
let animationId = null;
let gameOver = false;
let paused = false;
let scoreSaved = false;

const RANKING_KEY = "tetris-ranking-v1";

function createBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

function randomType() {
  const keys = Object.keys(SHAPES);
  return keys[Math.floor(Math.random() * keys.length)];
}

function makePiece(type) {
  const matrix = SHAPES[type].map((row) => [...row]);
  return {
    type,
    matrix,
    x: Math.floor((COLS - matrix[0].length) / 2),
    y: 0,
  };
}

function collide(next) {
  for (let y = 0; y < next.matrix.length; y++) {
    for (let x = 0; x < next.matrix[y].length; x++) {
      if (!next.matrix[y][x]) continue;
      const boardX = next.x + x;
      const boardY = next.y + y;

      if (boardX < 0 || boardX >= COLS || boardY >= ROWS) return true;
      if (boardY >= 0 && board[boardY][boardX]) return true;
    }
  }
  return false;
}

function merge() {
  current.matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value) board[current.y + y][current.x + x] = current.type;
    });
  });
}

function rotate(matrix) {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const rotated = Array.from({ length: cols }, () => Array(rows).fill(0));

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      rotated[x][rows - 1 - y] = matrix[y][x];
    }
  }
  return rotated;
}

function loadRanking() {
  try {
    const raw = localStorage.getItem(RANKING_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => typeof item?.score === "number").slice(0, 5);
  } catch {
    return [];
  }
}

function renderRanking() {
  if (!rankingListEl) return;
  const ranking = loadRanking();
  rankingListEl.innerHTML = "";

  for (let i = 0; i < 5; i++) {
    const li = document.createElement("li");
    if (ranking[i]) {
      const d = new Date(ranking[i].date);
      const stamp = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      li.textContent = `${i + 1}. ${ranking[i].score}점 (Lv.${ranking[i].level}, ${stamp})`;
    } else {
      li.textContent = `${i + 1}. -`;
    }
    rankingListEl.appendChild(li);
  }
}

function saveRanking(newScore, newLevel) {
  const ranking = loadRanking();
  ranking.push({ score: newScore, level: newLevel, date: new Date().toISOString() });
  ranking.sort((a, b) => b.score - a.score);
  localStorage.setItem(RANKING_KEY, JSON.stringify(ranking.slice(0, 5)));
  renderRanking();
}

function clearLines() {
  let cleared = 0;

  for (let y = ROWS - 1; y >= 0; y--) {
    if (board[y].every((cell) => cell !== 0)) {
      board.splice(y, 1);
      board.unshift(Array(COLS).fill(0));
      cleared++;
      y++;
    }
  }

  if (cleared > 0) {
    const lineScore = [0, 100, 300, 500, 800];
    score += lineScore[cleared] * level;
    lines += cleared;
    level = Math.floor(lines / 10) + 1;
    updateInfo();
  }
}

function drawMini(ctx2d, type) {
  ctx2d.clearRect(0, 0, PREVIEW_COLS, PREVIEW_ROWS);
  ctx2d.fillStyle = "#0b1020";
  ctx2d.fillRect(0, 0, PREVIEW_COLS, PREVIEW_ROWS);

  if (!type) return;
  const matrix = SHAPES[type];
  const offsetX = Math.floor((PREVIEW_COLS - matrix[0].length) / 2);
  const offsetY = Math.floor((PREVIEW_ROWS - matrix.length) / 2);

  matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (!value) return;
      drawCell(ctx2d, offsetX + x, offsetY + y, COLORS[type]);
    });
  });
}

function spawnPiece() {
  if (!nextType) nextType = randomType();
  current = makePiece(nextType);
  nextType = randomType();
  canHold = true;
  drawMini(nextCtx, nextType);

  if (collide(current)) {
    gameOver = true;
    statusEl.textContent = "게임 오버! R 키로 다시 시작하세요.";
    if (!scoreSaved && score > 0) {
      saveRanking(score, level);
      scoreSaved = true;
    }
  }
}

function holdPiece() {
  if (gameOver || paused || !canHold) return;
  canHold = false;

  if (!holdType) {
    holdType = current.type;
    spawnPiece();
  } else {
    const swapType = holdType;
    holdType = current.type;
    current = makePiece(swapType);
    if (collide(current)) {
      gameOver = true;
      statusEl.textContent = "게임 오버! R 키로 다시 시작하세요.";
      if (!scoreSaved && score > 0) {
        saveRanking(score, level);
        scoreSaved = true;
      }
    }
  }

  drawMini(holdCtx, holdType);
}

function drop() {
  if (gameOver || paused) return;
  current.y++;
  if (collide(current)) {
    current.y--;
    merge();
    clearLines();
    spawnPiece();
  }
  dropCounter = 0;
}

function hardDrop() {
  if (gameOver || paused) return;
  while (!collide({ ...current, y: current.y + 1 })) current.y++;
  drop();
}

function move(dir) {
  if (gameOver || paused) return;
  current.x += dir;
  if (collide(current)) {
    current.x -= dir;
    return;
  }
}

function playerRotate() {
  if (gameOver || paused) return;
  const prev = current.matrix;
  current.matrix = rotate(current.matrix);

  const kicks = [0, -1, 1, -2, 2];
  for (const offset of kicks) {
    current.x += offset;
    if (!collide(current)) {
      return;
    }
    current.x -= offset;
  }
  current.matrix = prev;
}

function updateInfo() {
  scoreEl.textContent = String(score);
  levelEl.textContent = String(level);
  linesEl.textContent = String(lines);
}

function drawCell(targetCtx, x, y, color) {
  targetCtx.fillStyle = color;
  targetCtx.fillRect(x, y, 1, 1);
  targetCtx.strokeStyle = "rgba(255,255,255,0.08)";
  targetCtx.lineWidth = 0.05;
  targetCtx.strokeRect(x, y, 1, 1);
}

function drawBoard() {
  ctx.fillStyle = "#0b1020";
  ctx.fillRect(0, 0, COLS, ROWS);

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const type = board[y][x];
      if (type) drawCell(ctx, x, y, COLORS[type]);
    }
  }
}

function drawPiece() {
  if (!current) return;
  current.matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value) drawCell(ctx, current.x + x, current.y + y, COLORS[current.type]);
    });
  });
}

function drawGhostPiece() {
  if (!current || gameOver) return;
  let ghostY = current.y;
  while (!collide({ ...current, y: ghostY + 1 })) ghostY++;
  if (ghostY === current.y) return;

  current.matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (!value) return;
      const drawX = current.x + x;
      const drawY = ghostY + y;
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.fillRect(drawX, drawY, 1, 1);
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth = 0.05;
      ctx.strokeRect(drawX, drawY, 1, 1);
    });
  });
}

function update(time = 0) {
  const delta = time - lastTime;
  lastTime = time;

  if (!gameOver && !paused) {
    dropCounter += delta;
    const speed = Math.max(120, 900 - (level - 1) * 75);
    if (dropCounter > speed) drop();
  }

  drawBoard();
  drawGhostPiece();
  drawPiece();
  animationId = requestAnimationFrame(update);
}

function resetGame() {
  if (animationId) cancelAnimationFrame(animationId);

  board = createBoard();
  score = 0;
  level = 1;
  lines = 0;
  dropCounter = 0;
  gameOver = false;
  paused = false;
  holdType = null;
  nextType = randomType();
  canHold = true;
  scoreSaved = false;

  statusEl.textContent = "게임 시작!";
  updateInfo();
  drawMini(holdCtx, holdType);
  drawMini(nextCtx, nextType);
  spawnPiece();
  lastTime = performance.now();
  animationId = requestAnimationFrame(update);
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  statusEl.textContent = paused ? "일시정지됨 (P로 재개)" : "게임 진행 중";
}

function bindTouchControls() {
  touchMap.forEach(([id, action]) => {
    const button = document.getElementById(id);
    if (!button) return;
    const handle = (event) => {
      event.preventDefault();
      action();
    };
    button.addEventListener("touchstart", handle, { passive: false });
    button.addEventListener("click", handle);
  });
}

document.addEventListener("keydown", (event) => {
  switch (event.code) {
    case "ArrowLeft":
      move(-1);
      break;
    case "ArrowRight":
      move(1);
      break;
    case "ArrowDown":
      drop();
      break;
    case "ArrowUp":
      playerRotate();
      break;
    case "Space":
      event.preventDefault();
      hardDrop();
      break;
    case "KeyC":
      holdPiece();
      break;
    case "KeyP":
      togglePause();
      break;
    case "KeyR":
      resetGame();
      break;
    default:
      break;
  }
});

bindTouchControls();
renderRanking();
resetGame();
