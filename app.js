import {
  FilesetResolver,
  HandLandmarker,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

const LM = {
  WRIST: 0,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_TIP: 8,
  MIDDLE_TIP: 12,
  RING_TIP: 16,
  PINKY_TIP: 20,
  MIDDLE_MCP: 9,
  RING_MCP: 13,
  PINKY_MCP: 17,
};

const PINCH_THRESHOLD = 0.055;
const FRAME_PADDING = 28;
const FREEZE_HOLD_MS = 250;
const COUNTDOWN_SECONDS = 3;
const FIST_HOLD_FRAMES = 12;
const SNAP_DISTANCE_RATIO = 0.45;
let GRID = 3;
const LOAD_TIMEOUT_MS = 60000;

const PHOTOBOOTH_CONTRAST_ALPHA = 1.3;
const PHOTOBOOTH_BRIGHTNESS_BETA = 10;
const PHOTOBOOTH_NOISE_STD = 15;

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

const videoEl = document.getElementById("webcam");
const canvas = document.getElementById("sceneCanvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });

const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const loadingOverlay = document.getElementById("loadingOverlay");
const loaderText = document.getElementById("loaderText");
const loaderRetry = document.getElementById("loaderRetry");
const errorBanner = document.getElementById("errorBanner");
const progressBadge = document.getElementById("progressBadge");
const progressText = document.getElementById("progressText");

const galleryStrip = document.getElementById("galleryStrip");
const galleryEmpty = document.getElementById("galleryEmpty");
const galleryCount = document.getElementById("galleryCount");
const downloadStripBtn = document.getElementById("downloadStripBtn");
const resetAllBtn = document.getElementById("resetAllBtn");
const stripCompleteMsg = document.getElementById("stripCompleteMsg");

let appState = "welcome";

const puzzle = {
  boardBox: null,
  pieces: [],
  solved: false,
  tileW: 0,
  tileH: 0,
};

let SHATTER_COLS = 6;
let SHATTER_ROWS = 6;
const SHATTER_DURATION_MS = 850;
const shatter = {
  active: false,
  startedAt: 0,
  fragments: [],
  pendingCanvas: null,
};

let STRIP_MAX_PHOTOS = 3;
const galleryEntries = [];

function addToGallery(snapshotCanvas) {
  if (galleryEntries.length >= STRIP_MAX_PHOTOS) return;

  galleryEntries.push({ canvas: snapshotCanvas, time: Date.now() });
  renderGalleryThumb(snapshotCanvas, galleryEntries.length);
  galleryCount.textContent = `${galleryEntries.length} / ${STRIP_MAX_PHOTOS}`;
  if (galleryEmpty) galleryEmpty.style.display = "none";

  if (galleryEntries.length >= STRIP_MAX_PHOTOS) {
    showStripComplete();

    // Auto-transition to edit photo screen
    const stripCanvas = createPhotoStripCanvas();
    if (stripCanvas) {
      currentEditCanvas = stripCanvas;
      appState = "edit_photo";
      const progressOverlay = document.getElementById("progressOverlay");
      if (progressOverlay) progressOverlay.style.display = "none";
      document.getElementById("app").style.display = "none";

      // Show printing animation
      const printingScreen = document.getElementById("printingScreen");
      const printingImage = document.getElementById("printingImage");

      if (printingScreen && printingImage) {
        printingImage.src = currentEditCanvas.toDataURL("image/png");
        printingImage.classList.remove("translate-y-0");
        printingImage.classList.add("-translate-y-[120%]");
        if (window.navigateToScreen) window.navigateToScreen('printingScreen');

        // Trigger animation
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            printingImage.classList.remove("-translate-y-[120%]");
            printingImage.classList.add("translate-y-0");
          });
        });

        // Wait for animation to finish, then go to edit screen
        setTimeout(() => {
          if (window.navigateToScreen) window.navigateToScreen('editPhotoScreen');
          const editCanvas = document.getElementById("editCanvas");
          editCanvas.width = currentEditCanvas.width;
          editCanvas.height = currentEditCanvas.height;
          editCanvas.style.boxSizing = "border-box";
          redrawEditCanvas();
        }, 3500);
      } else {
        // Fallback if elements not found
        if (window.navigateToScreen) window.navigateToScreen('editPhotoScreen');
        const editCanvas = document.getElementById("editCanvas");
        editCanvas.width = currentEditCanvas.width;
        editCanvas.height = currentEditCanvas.height;
        editCanvas.style.boxSizing = "border-box";
        redrawEditCanvas();
      }
    }

  }
}

function isStripFull() {
  return galleryEntries.length >= STRIP_MAX_PHOTOS;
}

function showStripComplete() {
  if (stripCompleteMsg) stripCompleteMsg.classList.add("visible");
  updateStripDownloadAvailability();
}

function hideStripComplete() {
  if (stripCompleteMsg) stripCompleteMsg.classList.remove("visible");
}

function updateStripDownloadAvailability() {
  if (!downloadStripBtn) return;
  downloadStripBtn.disabled = galleryEntries.length === 0;
}

const STRIP_FILE_BORDER = 24;
const STRIP_BOTTOM_PADDING = 120; // Extra padding for text
const STRIP_FILE_GAP = 16;
const STRIP_FILE_BG = "#ffffff";

function createPhotoStripCanvas() {
  if (galleryEntries.length === 0) return null;

  const entries = galleryEntries;
  const targetW = entries[0].canvas.width;
  const scaledHeights = entries.map((entry) =>
    Math.round(entry.canvas.height * (targetW / entry.canvas.width))
  );

  const totalH =
    STRIP_FILE_BORDER + STRIP_BOTTOM_PADDING +
    scaledHeights.reduce((sum, h) => sum + h, 0) +
    STRIP_FILE_GAP * (entries.length - 1);
  const totalW = targetW + STRIP_FILE_BORDER * 2;

  const stripCanvas = document.createElement("canvas");
  stripCanvas.width = totalW;
  stripCanvas.height = totalH;
  const stripCtx = stripCanvas.getContext("2d");

  let cursorY = STRIP_FILE_BORDER;
  entries.forEach((entry, i) => {
    const h = scaledHeights[i];
    stripCtx.drawImage(entry.canvas, STRIP_FILE_BORDER, cursorY, targetW, h);
    cursorY += h + STRIP_FILE_GAP;
  });

  return stripCanvas;
}

function downloadPhotoStrip() {
  const stripCanvas = createPhotoStripCanvas();
  if (!stripCanvas) return;

  stripCanvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    // Mengubah penamaan file unduhan agar default ID
    link.download = `puzzlecam_gallery_${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }, "image/png");
}

function resetEverything() {
  galleryEntries.length = 0;
  galleryStrip.innerHTML = "";
  galleryCount.textContent = `0 / ${STRIP_MAX_PHOTOS}`;
  if (galleryEmpty) {
    galleryEmpty.style.display = "block";
    galleryStrip.appendChild(galleryEmpty);
  }
  hideStripComplete();
  updateStripDownloadAvailability();
  resetPuzzleOnly();
  statusText.textContent = "all reset";
}

function renderGalleryThumb(snapshotCanvas, index) {
  const print = document.createElement("div");
  print.className = "print";

  const thumbCanvas = document.createElement("canvas");
  const THUMB_W = 220;
  const scale = THUMB_W / snapshotCanvas.width;
  thumbCanvas.width = THUMB_W;
  thumbCanvas.height = Math.round(snapshotCanvas.height * scale);
  thumbCanvas.getContext("2d").drawImage(snapshotCanvas, 0, 0, thumbCanvas.width, thumbCanvas.height);

  const label = document.createElement("div");
  label.className = "print-label";
  label.textContent = `#${String(index).padStart(2, "0")}`;

  print.appendChild(thumbCanvas);
  print.appendChild(label);
  galleryStrip.insertBefore(print, galleryStrip.firstChild);
}

function resetPuzzleOnly() {
  puzzle.boardBox = null;
  puzzle.pieces = [];
  puzzle.solved = false;
  puzzle.fullPhotoboothCanvas = null;
  appState = "tracking";
  countdown.active = false;
  drag.activeHand = null;
  drag.piece = null;
  shatter.active = false;
  shatter.fragments = [];
  shatter.pendingCanvas = null;
  fistHoldCounter = 0;
  lastSeenFrame.box = null;
  lastSeenFrame.at = 0;
  updateProgressBadge();
  const progressOverlay = document.getElementById("progressOverlay");
  if (progressOverlay) progressOverlay.style.display = "flex";
}

function fitCanvasToWindow() {
  // Let Tailwind CSS class 'w-full h-full object-cover' handle the canvas sizing natively.
}

window.addEventListener("resize", fitCanvasToWindow);

async function initWebcam() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This browser does not support camera access (getUserMedia).");
  }
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: isMobile ? 1280 : 1920 },
      height: { ideal: isMobile ? 720 : 1080 },
      facingMode: "user"
    },
    audio: false,
  });
  videoEl.srcObject = stream;

  await new Promise((resolve) => {
    videoEl.onloadedmetadata = () => {
      videoEl.play();
      resolve();
    };
  });

  canvas.width = videoEl.videoWidth;
  canvas.height = videoEl.videoHeight;
  fitCanvasToWindow();
}

function withTimeout(promise, ms, timeoutMessage) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMessage)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

let handLandmarkerPreloadPromise = null;

function initHandLandmarker() {
  if (!handLandmarkerPreloadPromise) {
    handLandmarkerPreloadPromise = (async () => {
      let vision;
      try {
        vision = await withTimeout(
          FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
          ),
          LOAD_TIMEOUT_MS,
          "Timeout loading MediaPipe (WASM) runtime. Check your internet connection or ensure cdn.jsdelivr.net is not blocked."
        );
        visionInstance = vision;
      } catch (err) {
        throw err;
      }

      // Early WebGL check to prevent activeTexture undefined crashes
      let useGPU = false;
      try {
        const testCanvas = document.createElement("canvas");
        const gl = testCanvas.getContext("webgl") || testCanvas.getContext("experimental-webgl");
        if (gl) {
          useGPU = true;
          const loseContextExt = gl.getExtension('WEBGL_lose_context');
          if (loseContextExt) loseContextExt.loseContext();
        }
      } catch (e) {
        useGPU = false;
      }

      if (useGPU) {
        try {
          const handLandmarker = await withTimeout(
            HandLandmarker.createFromOptions(vision, {
              baseOptions: {
                modelAssetPath:
                  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
                delegate: "GPU",
              },
              runningMode: "video",
              numHands: 2,
              minHandDetectionConfidence: 0.6,
              minHandPresenceConfidence: 0.6,
              minTrackingConfidence: 0.6,
            }),
            LOAD_TIMEOUT_MS,
            "Timeout downloading HandLandmarker model (~10MB) using GPU."
          );
          return handLandmarker;
        } catch (gpuErr) {
          console.warn("[PuzzleCam] Failed using GPU delegate, retrying with CPU...", gpuErr);
        }
      }

      try {
        const handLandmarker = await withTimeout(
          HandLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath:
                "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
              delegate: "CPU",
            },
            runningMode: "video",
            numHands: 2,
            minHandDetectionConfidence: 0.6,
            minHandPresenceConfidence: 0.6,
            minTrackingConfidence: 0.6,
          }),
          LOAD_TIMEOUT_MS,
          "Timeout downloading HandLandmarker model (~10MB) using CPU. Check your connection or ensure storage.googleapis.com is not blocked."
        );
        return handLandmarker;
      } catch (cpuErr) {
        throw cpuErr;
      }
    })();
  }
  return handLandmarkerPreloadPromise;
}

window.preloadHandLandmarker = () => { initHandLandmarker().catch(console.error); };

let isFallbackActive = false;
async function fallbackToCPU() {
  if (isFallbackActive) return;
  isFallbackActive = true;
  console.warn("[PuzzleCam] WebGL error detected. Falling back to CPU...");
  statusText.textContent = "WebGL error, switching to CPU...";
  
  try {
    const oldLandmarker = handLandmarker;
    handLandmarker = null;
    if (oldLandmarker) {
      console.log("[PuzzleCam] Discarding broken WebGL landmarker instance without calling close() to prevent deadlocks.");
    }
    
    const vision = visionInstance || await withTimeout(
      FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
      ),
      LOAD_TIMEOUT_MS,
      "Timeout loading MediaPipe (WASM) runtime for CPU fallback."
    );
    
    handLandmarker = await withTimeout(
      HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "CPU",
        },
        runningMode: "video",
        numHands: 2,
        minHandDetectionConfidence: 0.6,
        minHandPresenceConfidence: 0.6,
        minTrackingConfidence: 0.6,
      }),
      LOAD_TIMEOUT_MS,
      "Timeout initializing HandLandmarker model for CPU fallback."
    );
    console.log("[PuzzleCam] CPU Fallback successfully initialized.");
    statusText.textContent = "Connected (CPU Fallback)";
  } catch (err) {
    console.error("[PuzzleCam] Failed to fall back to CPU:", err);
    showError("WebGL crashed, and CPU fallback failed. Please refresh the page.");
    statusText.textContent = "Fallback Failed";
  } finally {
    isFallbackActive = false;
  }
}

function dist2D(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function isPinching(landmarks) {
  return dist2D(landmarks[LM.THUMB_TIP], landmarks[LM.INDEX_TIP]) < PINCH_THRESHOLD;
}

function isFist(landmarks) {
  const wrist = landmarks[LM.WRIST];
  const pairs = [
    [LM.INDEX_TIP, LM.INDEX_MCP],
    [LM.MIDDLE_TIP, LM.MIDDLE_MCP],
    [LM.RING_TIP, LM.RING_MCP],
    [LM.PINKY_TIP, LM.PINKY_MCP],
  ];
  let curled = 0;
  for (const [tipIdx, mcpIdx] of pairs) {
    if (dist2D(landmarks[tipIdx], wrist) < dist2D(landmarks[mcpIdx], wrist)) curled++;
  }
  return curled >= 4;
}

function toPixel(landmarkNorm) {
  return { x: landmarkNorm.x * canvas.width, y: landmarkNorm.y * canvas.height };
}

function mirrorLandmarkX(landmark) {
  return { x: 1 - landmark.x, y: landmark.y };
}

function computeHandFrame(indexTipA, indexTipB) {
  const a = toPixel(indexTipA);
  const b = toPixel(indexTipB);

  const minX = Math.min(a.x, b.x) - FRAME_PADDING;
  const maxX = Math.max(a.x, b.x) + FRAME_PADDING;
  const minY = Math.min(a.y, b.y) - FRAME_PADDING;
  const maxY = Math.max(a.y, b.y) + FRAME_PADDING;

  const x = Math.max(0, minX);
  const y = Math.max(0, minY);
  const width = Math.min(canvas.width, maxX) - x;
  const height = Math.min(canvas.height, maxY) - y;

  return { x, y, width, height };
}

const freezeGate = { holding: false, since: 0 };

const FRAME_GRACE_MS = 450;
const lastSeenFrame = { box: null, at: 0 };

const countdown = {
  active: false,
  startedAt: 0,
};

function startCountdown(frameBox) {
  puzzle.boardBox = { ...frameBox };
  appState = "countdown";
  countdown.active = true;
  countdown.startedAt = performance.now();
}

function drawCountdownOverlay(box) {
  const elapsed = (performance.now() - countdown.startedAt) / 1000;
  const remaining = COUNTDOWN_SECONDS - elapsed;

  if (remaining <= 0) {
    finishCountdownAndCapture(box);
    return;
  }

  applyBWInsideBox(box);

  ctx.save();
  ctx.strokeStyle = "#f5c518";
  ctx.lineWidth = 3;
  ctx.strokeRect(box.x, box.y, box.width, box.height);

  const n = Math.ceil(remaining);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  ctx.fillStyle = "rgba(10,10,8,0.45)";
  ctx.fillRect(box.x, box.y, box.width, box.height);

  ctx.font = `${Math.max(48, Math.min(box.width, box.height) * 0.4)}px 'IBM Plex Mono', monospace`;
  ctx.fillStyle = "#f5c518";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(n), cx, cy);
  ctx.restore();

  statusText.textContent = `mengambil gambar dalam ${n}…`;
}

function gaussianNoise(std) {
  const u1 = Math.random() || 1e-6;
  const u2 = Math.random();
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return z0 * std;
}

function applyPhotoboothEffect(imageData) {
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    let v = gray * PHOTOBOOTH_CONTRAST_ALPHA + PHOTOBOOTH_BRIGHTNESS_BETA;
    v += gaussianNoise(PHOTOBOOTH_NOISE_STD);
    v = Math.max(0, Math.min(255, v));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  return imageData;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function finishCountdownAndCapture(box) {
  countdown.active = false;

  const mirroredFrame = document.createElement("canvas");
  mirroredFrame.width = canvas.width;
  mirroredFrame.height = canvas.height;
  const mirroredCtx = mirroredFrame.getContext("2d");
  mirroredCtx.save();
  mirroredCtx.translate(mirroredFrame.width, 0);
  mirroredCtx.scale(-1, 1);
  mirroredCtx.filter = getFilterString(); // APPLY FILTER TO THE SNAPSHOT
  mirroredCtx.drawImage(videoEl, 0, 0, mirroredFrame.width, mirroredFrame.height);
  mirroredCtx.filter = 'none'; // RESET
  mirroredCtx.restore();

  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = Math.max(1, Math.round(box.width));
  cropCanvas.height = Math.max(1, Math.round(box.height));
  const cropCtx = cropCanvas.getContext("2d");
  cropCtx.drawImage(
    mirroredFrame,
    box.x, box.y, box.width, box.height,
    0, 0, cropCanvas.width, cropCanvas.height
  );

  puzzle.fullPhotoboothCanvas = cropCanvas;

  const tileW = Math.floor(cropCanvas.width / GRID);
  const tileH = Math.floor(cropCanvas.height / GRID);
  const pieces = [];

  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      const sx = col * tileW;
      const sy = row * tileH;
      const w = col === GRID - 1 ? cropCanvas.width - sx : tileW;
      const h = row === GRID - 1 ? cropCanvas.height - sy : tileH;

      const pieceCanvas = document.createElement("canvas");
      pieceCanvas.width = w;
      pieceCanvas.height = h;
      pieceCanvas.getContext("2d").drawImage(cropCanvas, sx, sy, w, h, 0, 0, w, h);

      pieces.push({
        row, col,
        canvas: pieceCanvas,
        w, h,
        x: 0, y: 0,
        placed: false,
        dragging: false,
      });
    }
  }

  const slots = [];
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      slots.push({ x: box.x + col * tileW, y: box.y + row * tileH });
    }
  }
  shuffle(slots);

  pieces.forEach((piece, i) => {
    piece.x = slots[i].x;
    piece.y = slots[i].y;
    if (isNearOwnCell(piece, box, tileW, tileH)) {
      snapPieceToCell(piece, box, tileW, tileH);
    }
  });

  puzzle.boardBox = box;
  puzzle.pieces = pieces;
  puzzle.tileW = tileW;
  puzzle.tileH = tileH;
  puzzle.solved = pieces.every((p) => p.placed);
  appState = "puzzle";
  fistHoldCounter = 0;
  updateProgressBadge();
}

const drag = {
  activeHand: null,
  piece: null,
  offsetX: 0,
  offsetY: 0,
};

function isNearOwnCell(piece, box, tileW, tileH) {
  const correctX = box.x + piece.col * tileW;
  const correctY = box.y + piece.row * tileH;
  const dx = piece.x - correctX;
  const dy = piece.y - correctY;
  const tolerance = Math.min(tileW, tileH) * SNAP_DISTANCE_RATIO;
  return Math.sqrt(dx * dx + dy * dy) < tolerance;
}

function reconcilePlacedState(box, tileW, tileH) {
  if (!box || !puzzle.pieces.length) return false;
  for (const piece of puzzle.pieces) {
    if (piece.displacing || piece.dragging) continue;
    piece.placed = isNearOwnCell(piece, box, tileW, tileH);
  }
  return puzzle.pieces.every((p) => p.placed);
}

function snapPieceToCell(piece, box, tileW, tileH) {
  displaceCellOccupant(piece, piece.row, piece.col, box, tileW, tileH);
  piece.x = box.x + piece.col * tileW;
  piece.y = box.y + piece.row * tileH;
  piece.placed = true;
}

function displaceCellOccupant(piece, targetRow, targetCol, box, tileW, tileH) {
  const cellX = box.x + targetCol * tileW;
  const cellY = box.y + targetRow * tileH;

  const occupant = puzzle.pieces.find((p) => {
    if (p === piece || p.displacing) return false;
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;
    return (
      cx >= cellX && cx < cellX + tileW &&
      cy >= cellY && cy < cellY + tileH
    );
  });
  if (!occupant) return;

  if (occupant.row === targetRow && occupant.col === targetCol && occupant.placed) {
    return;
  }

  occupant.placed = false;

  const freeCells = [];
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      if (row === targetRow && col === targetCol) continue;
      const cx0 = box.x + col * tileW;
      const cy0 = box.y + row * tileH;
      const taken = puzzle.pieces.some((p) => {
        if (p === occupant || p === piece || p.displacing) return false;
        const cx = p.x + p.w / 2;
        const cy = p.y + p.h / 2;
        return cx >= cx0 && cx < cx0 + tileW && cy >= cy0 && cy < cy0 + tileH;
      });
      if (!taken) freeCells.push({ row, col });
    }
  }

  let targetSlot;
  if (freeCells.length > 0) {
    targetSlot = freeCells[Math.floor(Math.random() * freeCells.length)];
  } else {
    targetSlot = { row: occupant.row, col: occupant.col };
  }

  const targetX = box.x + targetSlot.col * tileW;
  const targetY = box.y + targetSlot.row * tileH;

  animateDisplacement(occupant, targetX, targetY, box);
}

const DISPLACE_ANIM_MS = 220;

function animateDisplacement(piece, targetX, targetY, box) {
  const startX = piece.x;
  const startY = piece.y;
  const startedAt = performance.now();

  piece.displacing = true;

  function step() {
    const t = Math.min(1, (performance.now() - startedAt) / DISPLACE_ANIM_MS);
    const eased = 1 - Math.pow(1 - t, 3);

    piece.x = startX + (targetX - startX) * eased;
    piece.y = startY + (targetY - startY) * eased;

    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      piece.x = targetX;
      piece.y = targetY;
      piece.displacing = false;
      clampPieceToBoard(piece);
    }
  }

  requestAnimationFrame(step);
}

function findNearestPiece(px, py) {
  let best = null;
  let bestDist = Infinity;
  for (const piece of puzzle.pieces) {
    if (piece.displacing) continue;
    const cx = piece.x + piece.w / 2;
    const cy = piece.y + piece.h / 2;
    const d = Math.hypot(px - cx, py - cy);
    if (d < Math.max(piece.w, piece.h) * 0.75 && d < bestDist) {
      best = piece;
      bestDist = d;
    }
  }
  return best;
}

function handleDragForHand(handLabel, pinching, indexPx) {
  if (pinching) {
    if (drag.activeHand === null) {
      const candidate = findNearestPiece(indexPx.x, indexPx.y);
      if (candidate) {
        drag.activeHand = handLabel;
        drag.piece = candidate;
        drag.offsetX = indexPx.x - candidate.x;
        drag.offsetY = indexPx.y - candidate.y;
        candidate.dragging = true;
        candidate.placed = false;
      }
    } else if (drag.activeHand === handLabel && drag.piece) {
      drag.piece.x = indexPx.x - drag.offsetX;
      drag.piece.y = indexPx.y - drag.offsetY;
    }
  } else {
    if (drag.activeHand === handLabel && drag.piece) {
      const piece = drag.piece;
      piece.dragging = false;
      if (isNearOwnCell(piece, puzzle.boardBox, puzzle.tileW, puzzle.tileH)) {
        snapPieceToCell(piece, puzzle.boardBox, puzzle.tileW, puzzle.tileH);
      } else {
        const box = puzzle.boardBox;
        const cx = piece.x + piece.w / 2;
        const cy = piece.y + piece.h / 2;
        const dropCol = Math.min(
          GRID - 1,
          Math.max(0, Math.floor((cx - box.x) / puzzle.tileW))
        );
        const dropRow = Math.min(
          GRID - 1,
          Math.max(0, Math.floor((cy - box.y) / puzzle.tileH))
        );
        
        piece.x = box.x + dropCol * puzzle.tileW;
        piece.y = box.y + dropRow * puzzle.tileH;
        piece.placed = (dropCol === piece.col && dropRow === piece.row);
        
        displaceCellOccupant(piece, dropRow, dropCol, box, puzzle.tileW, puzzle.tileH);
      }
      drag.activeHand = null;
      drag.piece = null;
      puzzle.solved = reconcilePlacedState(puzzle.boardBox, puzzle.tileW, puzzle.tileH);
      updateProgressBadge();
    }
  }
}

function clampPieceToBoard(piece) {
  const box = puzzle.boardBox;
  piece.x = Math.min(Math.max(piece.x, box.x), box.x + box.width - piece.w);
  piece.y = Math.min(Math.max(piece.y, box.y), box.y + box.height - piece.h);
}

function drawBoardAndPieces() {
  const box = puzzle.boardBox;

  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
  ctx.fillRect(box.x, box.y, box.width, box.height);
  
  ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 5]);
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      ctx.strokeRect(box.x + col * puzzle.tileW, box.y + row * puzzle.tileH, puzzle.tileW, puzzle.tileH);
    }
  }
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "rgba(245,197,24,0.18)";
  ctx.lineWidth = 1;
  for (let i = 1; i < GRID; i++) {
    ctx.beginPath();
    ctx.moveTo(box.x + i * puzzle.tileW, box.y);
    ctx.lineTo(box.x + i * puzzle.tileW, box.y + box.height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(box.x, box.y + i * puzzle.tileH);
    ctx.lineTo(box.x + box.width, box.y + i * puzzle.tileH);
    ctx.stroke();
  }
  ctx.restore();

  const sorted = [...puzzle.pieces].sort((a, b) => (a.dragging ? 1 : 0) - (b.dragging ? 1 : 0));

  for (const piece of sorted) {
    ctx.save();
    if (piece.dragging) {
      ctx.shadowColor = "rgba(245,197,24,0.9)";
      ctx.shadowBlur = 14;
    }
    ctx.drawImage(piece.canvas, piece.x, piece.y, piece.w, piece.h);
    ctx.strokeStyle = piece.placed ? "#5fae6e" : "rgba(234,229,214,0.5)";
    ctx.lineWidth = piece.dragging ? 3 : 1.5;
    ctx.strokeRect(piece.x, piece.y, piece.w, piece.h);
    ctx.restore();
  }

  ctx.save();
  ctx.strokeStyle = puzzle.solved ? "#5fae6e" : "#f5c518";
  ctx.lineWidth = 3;
  ctx.strokeRect(box.x, box.y, box.width, box.height);
  ctx.restore();

  if (puzzle.solved) {
    ctx.save();
    ctx.fillStyle = "rgba(95,174,110,0.15)";
    ctx.fillRect(box.x, box.y, box.width, box.height);
    ctx.restore();
  }
}

function updateProgressBadge() {
  const puzzleSolvedBanner = document.getElementById("puzzleSolvedBanner");
  if (appState !== "puzzle") {
    progressBadge.classList.remove("visible", "solved");
    puzzleSolvedBanner.classList.add("hidden");
    return;
  }
  const placedCount = puzzle.pieces.filter((p) => p.placed).length;
  progressText.textContent = `${placedCount} / ${puzzle.pieces.length} pieces placed`;
  progressBadge.classList.add("visible");
  progressBadge.classList.toggle("solved", puzzle.solved);

  if (puzzle.solved) {
    puzzleSolvedBanner.classList.remove("hidden");
  } else {
    puzzleSolvedBanner.classList.add("hidden");
  }
}

function drawVideoFrame() {
  ctx.save();
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function applyBWInsideBox(box) {
  const x = Math.max(0, Math.round(box.x));
  const y = Math.max(0, Math.round(box.y));
  const w = Math.min(canvas.width - x, Math.round(box.width));
  const h = Math.min(canvas.height - y, Math.round(box.height));
  if (w <= 0 || h <= 0) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  ctx.filter = getFilterString();
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);

  ctx.restore();
}

function drawLiveFrameOverlay(box) {
  ctx.save();
  ctx.strokeStyle = "#f5c518";
  ctx.lineWidth = 3;
  ctx.strokeRect(box.x, box.y, box.width, box.height);

  const cornerLen = 18;
  ctx.lineWidth = 4;
  const corners = [
    [box.x, box.y, 1, 1],
    [box.x + box.width, box.y, -1, 1],
    [box.x, box.y + box.height, 1, -1],
    [box.x + box.width, box.y + box.height, -1, -1],
  ];
  for (const [cx, cy, dx, dy] of corners) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + cornerLen * dy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + cornerLen * dx, cy);
    ctx.stroke();
  }
  ctx.restore();
}

function isPointInBoard(px, py, box) {
  if (!box) return false;
  return (
    px >= box.x &&
    px <= box.x + box.width &&
    py >= box.y &&
    py <= box.y + box.height
  );
}

function drawHandSkeleton(landmarksPx) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = "rgba(255,255,255,0.85)";
  ctx.shadowBlur = 10;
  ctx.strokeStyle = "white";
  ctx.lineWidth = 3;

  for (const [iA, iB] of HAND_CONNECTIONS) {
    const a = landmarksPx[iA];
    const b = landmarksPx[iB];
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  ctx.shadowBlur = 6;
  ctx.fillStyle = "white";
  for (const p of landmarksPx) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawHandSkeletonsOverBoard(handsLandmarks, box) {
  if (!box || !handsLandmarks || handsLandmarks.length === 0) return;

  for (const lm of handsLandmarks) {
    const landmarksPx = lm.map((pt) => toPixel(mirrorLandmarkX(pt)));
    const overBoard = landmarksPx.some((p) => isPointInBoard(p.x, p.y, box));
    if (overBoard) {
      drawHandSkeleton(landmarksPx);
    }
  }
}

function startShatter(sourceCanvas, box) {
  const cols = SHATTER_COLS;
  const rows = SHATTER_ROWS;
  const fragW = sourceCanvas.width / cols;
  const fragH = sourceCanvas.height / rows;
  const fragments = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const sx = col * fragW;
      const sy = row * fragH;

      const fragCanvas = document.createElement("canvas");
      fragCanvas.width = Math.ceil(fragW);
      fragCanvas.height = Math.ceil(fragH);
      fragCanvas.getContext("2d").drawImage(
        sourceCanvas,
        sx, sy, fragW, fragH,
        0, 0, fragCanvas.width, fragCanvas.height
      );

      const cx = box.x + sx + fragW / 2;
      const cy = box.y + sy + fragH / 2;

      const boardCx = box.x + box.width / 2;
      const boardCy = box.y + box.height / 2;
      const dirX = cx - boardCx;
      const dirY = cy - boardCy;
      const dirLen = Math.max(1, Math.hypot(dirX, dirY));
      const speed = 90 + Math.random() * 160;

      fragments.push({
        canvas: fragCanvas,
        x: cx,
        y: cy,
        w: fragW,
        h: fragH,
        vx: (dirX / dirLen) * speed + (Math.random() - 0.5) * 40,
        vy: (dirY / dirLen) * speed + (Math.random() - 0.5) * 40 - 60,
        rotation: 0,
        rotationSpeed: (Math.random() - 0.5) * 6,
        gravity: 220 + Math.random() * 80,
      });
    }
  }

  shatter.fragments = fragments;
  shatter.active = true;
  shatter.startedAt = performance.now();
  appState = "shattering";
}

function updateAndDrawShatter() {
  const elapsedMs = performance.now() - shatter.startedAt;
  const t = Math.min(1, elapsedMs / SHATTER_DURATION_MS);

  if (t >= 1) {
    finishShatter();
    return;
  }

  const dt = 1 / 60;
  const fadeStart = 0.45;

  ctx.save();
  for (const frag of shatter.fragments) {
    frag.x += frag.vx * dt;
    frag.y += frag.vy * dt;
    frag.vy += frag.gravity * dt;
    frag.rotation += frag.rotationSpeed * dt;

    const alpha = t < fadeStart ? 1 : Math.max(0, 1 - (t - fadeStart) / (1 - fadeStart));
    const scale = 1 - t * 0.25;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(frag.x, frag.y);
    ctx.rotate(frag.rotation);
    ctx.scale(scale, scale);
    ctx.drawImage(frag.canvas, -frag.w / 2, -frag.h / 2, frag.w, frag.h);
    ctx.restore();
  }
  ctx.restore();
}

function finishShatter() {
  shatter.active = false;
  shatter.fragments = [];
  if (shatter.pendingCanvas) {
    addToGallery(shatter.pendingCanvas);
    shatter.pendingCanvas = null;
  }

  if (appState !== "edit_photo") {
    resetPuzzleOnly();
  }
}

function handleFistReset() {
  if (appState !== "puzzle") {
    statusText.textContent = "reset (fist)";
    resetPuzzleOnly();
    return;
  }

  const reallySolved = reconcilePlacedState(puzzle.boardBox, puzzle.tileW, puzzle.tileH);
  puzzle.solved = reallySolved;

  if (reallySolved && puzzle.fullPhotoboothCanvas) {
    shatter.pendingCanvas = puzzle.fullPhotoboothCanvas;
    startShatter(puzzle.fullPhotoboothCanvas, puzzle.boardBox);
  } else {
    statusText.textContent = "reset (fist)";
    resetPuzzleOnly();
  }
}

let handLandmarker = null;
let visionInstance = null;
let fistHoldCounter = 0;

function processResults(result) {
  if (appState === "edit_photo" || appState === "welcome") {
    return;
  }

  if (appState === "shattering") {
    updateAndDrawShatter();
    statusText.textContent = "saving…";
    return;
  }

  const handsLandmarks = result.landmarks || [];
  const noHands = handsLandmarks.length === 0;

  if (noHands) {
    statusDot.className = puzzle.solved ? "status-dot solved" : "status-dot";
    fistHoldCounter = 0;
    freezeGate.holding = false;

    if (drag.activeHand && drag.piece) {
      handleDragForHand(drag.activeHand, false, { x: drag.piece.x, y: drag.piece.y });
    }

    if (appState === "tracking") {
      const sinceLastSeen = performance.now() - lastSeenFrame.at;
      if (lastSeenFrame.box && sinceLastSeen < FRAME_GRACE_MS) {
        applyBWInsideBox(lastSeenFrame.box);
        drawLiveFrameOverlay(lastSeenFrame.box);
      }
      statusText.textContent = isStripFull()
        ? "gallery full - download or reset to continue"
        : "searching for hands…";
      return;
    }

    if (appState === "countdown") {
      drawCountdownOverlay(puzzle.boardBox);
      return;
    }

    if (appState === "puzzle") {
      puzzle.solved = reconcilePlacedState(puzzle.boardBox, puzzle.tileW, puzzle.tileH);
      updateProgressBadge();
      drawBoardAndPieces();
      statusText.textContent = puzzle.solved
        ? "puzzle selesai! kepalkan tangan untuk menyimpan"
        : "susun puzzle menggunakan gestur pinch";
      return;
    }

    return;
  }

  statusDot.className = puzzle.solved ? "status-dot solved" : "status-dot live";

  const anyFist = handsLandmarks.some((lm) => isFist(lm));
  const draggingNow = drag.activeHand !== null && drag.piece !== null;
  if (anyFist && !draggingNow && appState !== "tracking") {
    fistHoldCounter++;
    if (fistHoldCounter >= FIST_HOLD_FRAMES) {
      fistHoldCounter = 0;
      handleFistReset();
      return;
    }
  } else {
    fistHoldCounter = 0;
  }

  if (appState === "tracking") {
    if (isStripFull()) {
      statusText.textContent = "galeri penuh — unduh atau reset untuk lanjut";
      return;
    }
    if (handsLandmarks.length === 2) {
      const [handA, handB] = handsLandmarks;
      const indexA = mirrorLandmarkX(handA[LM.INDEX_TIP]);
      const indexB = mirrorLandmarkX(handB[LM.INDEX_TIP]);
      const frameBox = computeHandFrame(indexA, indexB);

      if (frameBox.width > 4 && frameBox.height > 4) {
        applyBWInsideBox(frameBox);
        drawLiveFrameOverlay(frameBox);
        lastSeenFrame.box = frameBox;
        lastSeenFrame.at = performance.now();
      }

      const bothPinching = isPinching(handA) && isPinching(handB);
      if (bothPinching && frameBox.width > 40 && frameBox.height > 40) {
        if (!freezeGate.holding) {
          freezeGate.holding = true;
          freezeGate.since = performance.now();
        }
        statusDot.className = "status-dot armed";
        statusText.textContent = "tahan gestur pinch…";

        if (performance.now() - freezeGate.since > FREEZE_HOLD_MS) {
          freezeGate.holding = false;
          startCountdown(frameBox);
        }
      } else {
        freezeGate.holding = false;
        statusText.textContent = "tangan terdeteksi";
      }
    } else {
      freezeGate.holding = false;
      const sinceLastSeen = performance.now() - lastSeenFrame.at;
      if (lastSeenFrame.box && sinceLastSeen < FRAME_GRACE_MS) {
        applyBWInsideBox(lastSeenFrame.box);
        drawLiveFrameOverlay(lastSeenFrame.box);
        statusText.textContent = "tangan terdeteksi";
      } else {
        statusText.textContent = "tangan terdeteksi";
      }
    }
    return;
  }

  if (appState === "countdown") {
    drawCountdownOverlay(puzzle.boardBox);
    return;
  }

  if (appState === "puzzle") {
    const labelsPresent = new Set();
    const handedness = result.handedness || [];
    
    handsLandmarks.forEach((lm, i) => {
      const label = handedness[i] && handedness[i][0] ? handedness[i][0].categoryName : (i === 0 ? "Left" : "Right");
      labelsPresent.add(label);
      const pinching = isPinching(lm);
      const indexPx = toPixel(mirrorLandmarkX(lm[LM.INDEX_TIP]));
      handleDragForHand(label, pinching, indexPx);
    });

    if (drag.activeHand && !labelsPresent.has(drag.activeHand) && drag.piece) {
      handleDragForHand(drag.activeHand, false, { x: drag.piece.x, y: drag.piece.y });
    }

    if (!drag.piece) {
      puzzle.solved = reconcilePlacedState(puzzle.boardBox, puzzle.tileW, puzzle.tileH);
      updateProgressBadge();
    }

    drawBoardAndPieces();
    drawHandSkeletonsOverBoard(handsLandmarks, puzzle.boardBox);

    statusText.textContent = puzzle.solved
      ? (fistHoldCounter > 0
        ? `menyimpan… tahan kepalan tangan (${fistHoldCounter}/${FIST_HOLD_FRAMES})`
        : "puzzle selesai! kepalkan tangan untuk menyimpan")
      : "susun puzzle menggunakan gestur pinch";
  }
}

let lastDetectTime = 0;
let loopRunning = false;
let currentLandmarks = [];
let currentHandedness = [];

function renderLoop() {
  if (!loopRunning) return;
  const activeStates = ["tracking", "countdown", "freeze", "puzzle", "shattering"];

  if (activeStates.includes(appState) && videoEl.readyState >= 2) {
    // Always draw the video frame so the camera preview never freezes
    drawVideoFrame();

    if (handLandmarker) {
      const nowMs = performance.now();

      // Throttle AI detection to ~30 FPS (every 30ms) for ultra smooth mobile performance
      if (nowMs - lastDetectTime >= 30) {
        lastDetectTime = nowMs;
        try {
          const result = handLandmarker.detectForVideo(videoEl, nowMs);
          currentLandmarks = result.landmarks || [];
          currentHandedness = result.handedness || [];
        } catch (detectErr) {
          console.error("[PuzzleCam] Detection error:", detectErr);
          if (detectErr.message && (detectErr.message.includes("activeTexture") || detectErr.message.includes("WebGL"))) {
            fallbackToCPU();
          }
        }
      }
      
      // Always run game logic & rendering every frame using the latest landmarks
      // This prevents the canvas from flickering when the AI detection is throttled
      processResults({ landmarks: currentLandmarks, handedness: currentHandedness });
    }
  }

  requestAnimationFrame(renderLoop);
}

function showError(message) {
  errorBanner.textContent = message;
  errorBanner.style.display = "block";
}

function showLoaderError(message) {
  loaderText.textContent = message;
  loaderText.style.color = "#e0533d";
  loaderRetry.classList.remove("hidden");
}

function resetLoaderUI() {
  loadingOverlay.classList.remove("hidden");
  loaderText.style.color = "";
  loaderText.textContent = "memuat model HandLandmarker…";
  loaderRetry.classList.add("hidden");
  errorBanner.style.display = "none";
}

async function boot() {
  resetLoaderUI();

  let settled = false;
  const watchdogMs = (LOAD_TIMEOUT_MS * 2) + 5000;
  const watchdog = setTimeout(() => {
    if (!settled) {
      showLoaderError("Loading process took too long. Click try again or check your connection.");
    }
  }, watchdogMs);

  try {
    if (!videoEl.srcObject) {
      await initWebcam();
    }

    if (!handLandmarker) {
      handLandmarker = await initHandLandmarker();
    }

    settled = true;
    clearTimeout(watchdog);
    loadingOverlay.classList.add("hidden");
    const progressOverlay = document.getElementById("progressOverlay");
    if (progressOverlay) progressOverlay.style.display = "flex";
    statusText.textContent = "siap";

    if (!loopRunning) {
      loopRunning = true;
      requestAnimationFrame(renderLoop);
    }
  } catch (err) {
    settled = true;
    clearTimeout(watchdog);
    if (err && err.name === "NotAllowedError") {
      showLoaderError("Camera permission denied. Enable it in browser settings and click try again.");
    } else if (err && err.name === "NotFoundError") {
      showLoaderError("No webcam found.");
    } else {
      showLoaderError((err && err.message) || "Failed to start application.");
    }
  }
}

loaderRetry.addEventListener("click", () => {
  boot();
});

if (downloadStripBtn) {
  downloadStripBtn.addEventListener("click", downloadPhotoStrip);
  updateStripDownloadAvailability();
}

if (resetAllBtn) {
  resetAllBtn.addEventListener("click", () => {
    const confirmed = window.confirm(
      "Are you sure you want to delete all photos in the gallery and start over?"
    );
    if (confirmed) resetEverything();
  });
}

// ================= WELCOME SCREEN LOGIC =================
let selectedFilter = 'none';
let currentLayout = '3';

const filterBtns = document.querySelectorAll('.filter-btn');
filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    filterBtns.forEach(b => {
      b.classList.remove('bg-on-surface-variant', 'text-white', 'border-transparent');
      b.classList.add('bg-surface-container-highest', 'text-on-surface', 'border-outline/20');
    });
    btn.classList.add('bg-on-surface-variant', 'text-white', 'border-transparent');
    btn.classList.remove('bg-surface-container-highest', 'text-on-surface', 'border-outline/20');
    selectedFilter = btn.getAttribute('data-filter');
  });
});

const gridBtns = document.querySelectorAll('.grid-btn');
gridBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    gridBtns.forEach(b => {
      b.classList.remove('border-primary', 'shadow-lg');
      b.classList.add('border-outline-variant/20', 'shadow-sm');
      b.querySelector('.active-indicator').classList.add('opacity-0');
      b.querySelector('.active-indicator').classList.remove('opacity-100');
    });
    btn.classList.add('border-primary', 'shadow-lg');
    btn.classList.remove('border-outline-variant/20', 'shadow-sm');
    btn.querySelector('.active-indicator').classList.remove('opacity-0');
    btn.querySelector('.active-indicator').classList.add('opacity-100');
    GRID = parseInt(btn.getAttribute('data-grid'));
    SHATTER_COLS = GRID * 2;
    SHATTER_ROWS = GRID * 2;
  });
});

const layoutBtns = document.querySelectorAll('.layout-btn');
layoutBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    layoutBtns.forEach(b => {
      b.classList.remove('border-primary', 'shadow-lg');
      b.classList.add('border-outline-variant/20', 'shadow-sm');
      b.querySelector('.active-indicator').classList.add('opacity-0');
      b.querySelector('.active-indicator').classList.remove('opacity-100');
    });
    btn.classList.add('border-primary', 'shadow-lg');
    btn.classList.remove('border-outline-variant/20', 'shadow-sm');
    btn.querySelector('.active-indicator').classList.remove('opacity-0');
    btn.querySelector('.active-indicator').classList.add('opacity-100');
    currentLayout = btn.getAttribute('data-layout');
    STRIP_MAX_PHOTOS = parseInt(currentLayout);
    galleryCount.textContent = `0 / ${STRIP_MAX_PHOTOS}`;
  });
});

document.getElementById('startBtn').addEventListener('click', () => {
  // Show tutorial modal instead of directly starting
  document.getElementById('tutorialScreen').style.display = 'flex';
});

document.getElementById('tutorialGotItBtn').addEventListener('click', () => {
  document.getElementById('tutorialScreen').style.display = 'none';
  
  if (window.navigateToScreen) {
    window.navigateToScreen('app');
  } else {
    document.getElementById('welcomeScreen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
  }

  appState = 'tracking';
  boot();
});

function getFilterString() {
  if (selectedFilter === 'bw') {
    return 'grayscale(100%) contrast(120%)';
  } else if (selectedFilter === 'vintage') {
    return 'sepia(50%) contrast(120%) saturate(80%)';
  } else if (selectedFilter === 'korean') {
    return 'brightness(110%) contrast(90%) saturate(110%) sepia(10%)';
  } else if (selectedFilter === 'warm') {
    return 'sepia(30%) saturate(140%) hue-rotate(-10deg)';
  } else if (selectedFilter === 'cool') {
    return 'saturate(110%) contrast(100%) hue-rotate(180deg) brightness(105%)';
  } else {
    return 'none';
  }
}

// ================= EDIT PHOTO SCREEN LOGIC =================
let currentEditCanvas = null;
let currentBorderColor = '#ffffff';
let placedStickers = [];

const borderBtns = document.querySelectorAll('.border-btn');
borderBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    borderBtns.forEach(b => b.classList.remove('border-primary'));
    borderBtns.forEach(b => b.classList.add('border-transparent'));

    if (btn.getAttribute('data-border') === '#ffffff') {
      btn.classList.add('border-primary');
      btn.classList.remove('border-transparent');
    } else {
      btn.classList.remove('border-transparent');
      btn.classList.add('border-primary');
    }

    currentBorderColor = btn.getAttribute('data-border');
    redrawEditCanvas();
  });
});

const stickerBtns = document.querySelectorAll('.sticker-btn');
stickerBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    if (!currentEditCanvas) return;
    const emoji = btn.textContent.trim();
    const x = currentEditCanvas.width / 2 + (Math.random() - 0.5) * 200;
    const y = currentEditCanvas.height / 2 + (Math.random() - 0.5) * 200;

    placedStickers.push({ emoji, x, y, size: 80 });
    redrawEditCanvas();
  });
});

function redrawEditCanvas() {
  if (!currentEditCanvas) return;
  const editCanvas = document.getElementById("editCanvas");
  const eCtx = editCanvas.getContext("2d");

  eCtx.clearRect(0, 0, editCanvas.width, editCanvas.height);

  // Draw the full background frame
  eCtx.fillStyle = currentBorderColor || "#ffffff";
  eCtx.fillRect(0, 0, editCanvas.width, editCanvas.height);

  // Draw photos and stickers
  eCtx.drawImage(currentEditCanvas, 0, 0);

  eCtx.textAlign = "center";
  eCtx.textBaseline = "middle";
  placedStickers.forEach(sticker => {
    // If it's a material icon string (e.g. "star", "favorite"), use Material Symbols font.
    // If it's a native emoji, sans-serif is fine, but Material Symbols works well if we only use icons.
    eCtx.font = `${sticker.size}px "Material Symbols Outlined"`;
    eCtx.fillText(sticker.emoji, sticker.x, sticker.y);
  });

  // Render Memory Log Caption at the bottom of the photo strip
  const memoryLogInput = document.querySelector('.typewriter-input');
  if (memoryLogInput && memoryLogInput.value.trim()) {
    eCtx.fillStyle = "#7b5455";
    eCtx.font = "bold 22px 'Courier Prime', monospace";
    eCtx.textAlign = "center";
    eCtx.textBaseline = "middle";
    eCtx.fillText(memoryLogInput.value.trim(), editCanvas.width / 2, editCanvas.height - (120 / 2));
  }
}

// Live redraw on memory log typing
const memoryLogInput = document.querySelector('.typewriter-input');
if (memoryLogInput) {
  memoryLogInput.addEventListener('input', () => {
    redrawEditCanvas();
  });
}

let draggingStickerIndex = -1;
let dragOffsetX = 0;
let dragOffsetY = 0;

const editCanvasElement = document.getElementById("editCanvas");
const trashBin = document.getElementById("trashBin");

function getCanvasPointer(e) {
  const rect = editCanvasElement.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;

  // We use a fallback of 1 for object scale to avoid divide by zero if not rendered
  const scaleX = rect.width ? editCanvasElement.width / rect.width : 1;
  const scaleY = rect.height ? editCanvasElement.height / rect.height : 1;

  // When using object-contain, the canvas drawing buffer might be letterboxed inside the DOM element.
  // To be perfectly accurate we'd calculate the letterbox, but a simple scaling is usually sufficient
  // if the flex layout constrains the canvas tightly.
  // Let's calculate the real displayed size to account for object-contain:
  const canvasRatio = editCanvasElement.width / editCanvasElement.height;
  const rectRatio = rect.width / rect.height;

  let drawWidth = rect.width;
  let drawHeight = rect.height;
  let offsetX = 0;
  let offsetY = 0;

  if (canvasRatio > rectRatio) {
    // Limited by width
    drawHeight = rect.width / canvasRatio;
    offsetY = (rect.height - drawHeight) / 2;
  } else {
    // Limited by height
    drawWidth = rect.height * canvasRatio;
    offsetX = (rect.width - drawWidth) / 2;
  }

  const trueScaleX = editCanvasElement.width / drawWidth;
  const trueScaleY = editCanvasElement.height / drawHeight;

  return {
    x: (clientX - rect.left - offsetX) * trueScaleX,
    y: (clientY - rect.top - offsetY) * trueScaleY,
    clientX,
    clientY
  };
}

editCanvasElement.addEventListener("mousedown", handleDragStart);
editCanvasElement.addEventListener("touchstart", handleDragStart, { passive: false });
window.addEventListener("mousemove", handleDragMove);
window.addEventListener("touchmove", handleDragMove, { passive: false });
window.addEventListener("mouseup", handleDragEnd);
window.addEventListener("touchend", handleDragEnd);

function handleDragStart(e) {
  if (appState !== "edit_photo") return;
  const ptr = getCanvasPointer(e);

  for (let i = placedStickers.length - 1; i >= 0; i--) {
    const s = placedStickers[i];
    const hitZone = s.size * 0.6;
    if (Math.abs(ptr.x - s.x) < hitZone && Math.abs(ptr.y - s.y) < hitZone) {
      draggingStickerIndex = i;
      dragOffsetX = s.x - ptr.x;
      dragOffsetY = s.y - ptr.y;
      trashBin.classList.remove('opacity-70');
      trashBin.classList.add('opacity-100', 'scale-105');
      e.preventDefault();
      return;
    }
  }
}

function handleDragMove(e) {
  if (draggingStickerIndex === -1) return;
  e.preventDefault();
  const ptr = getCanvasPointer(e);

  const s = placedStickers[draggingStickerIndex];
  s.x = ptr.x + dragOffsetX;
  s.y = ptr.y + dragOffsetY;

  const trashRect = trashBin.getBoundingClientRect();
  if (ptr.clientX >= trashRect.left && ptr.clientX <= trashRect.right &&
    ptr.clientY >= trashRect.top && ptr.clientY <= trashRect.bottom) {
    trashBin.classList.add('bg-error', 'text-white', 'border-error');
    trashBin.classList.remove('bg-error-container', 'text-on-error-container', 'border-error/50');
  } else {
    trashBin.classList.add('bg-error-container', 'text-on-error-container', 'border-error/50');
    trashBin.classList.remove('bg-error', 'text-white', 'border-error');
  }

  redrawEditCanvas();
}

function handleDragEnd(e) {
  if (draggingStickerIndex === -1) return;

  let clientX, clientY;
  if (e.changedTouches) {
    clientX = e.changedTouches[0].clientX;
    clientY = e.changedTouches[0].clientY;
  } else {
    clientX = e.clientX;
    clientY = e.clientY;
  }

  const trashRect = trashBin.getBoundingClientRect();
  if (clientX >= trashRect.left && clientX <= trashRect.right &&
    clientY >= trashRect.top && clientY <= trashRect.bottom) {
    placedStickers.splice(draggingStickerIndex, 1);
    redrawEditCanvas();
  }

  draggingStickerIndex = -1;
  trashBin.classList.add('opacity-70', 'bg-error-container', 'text-on-error-container', 'border-error/50');
  trashBin.classList.remove('opacity-100', 'scale-105', 'bg-error', 'text-white', 'border-error');
}

window.onScreenChange = (screenId) => {
  if (screenId === 'landingPage' || screenId === 'welcomeScreen') {
    appState = 'welcome';
    loopRunning = false;

    // Matikan kamera untuk menghemat resource dan mencegah freeze
    if (videoEl && videoEl.srcObject) {
      const tracks = videoEl.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      videoEl.srcObject = null;
    }
  }
};

function finishEditAndReturn(save) {
  if (save && currentEditCanvas) {
    const finalCanvas = document.createElement("canvas");
    finalCanvas.width = editCanvas.width;
    finalCanvas.height = editCanvas.height;

    const fCtx = finalCanvas.getContext("2d");
    fCtx.drawImage(editCanvas, 0, 0);

    const link = document.createElement("a");
    link.download = `scrapbook-photo-${Date.now()}.png`;
    link.href = finalCanvas.toDataURL("image/png");
    link.click();
  }

  placedStickers = [];
  currentEditCanvas = null;
  document.getElementById("editPhotoScreen").classList.add("hidden");

  // Kembali ke beranda
  document.getElementById("app").style.display = "none";
  document.getElementById("welcomeScreen").style.display = "flex";
  document.getElementById("welcomeScreen").classList.remove("hidden");

  resetEverything();
  appState = "welcome";
}

document.getElementById('savePhotoBtn').addEventListener('click', () => finishEditAndReturn(true));
document.getElementById('skipEditBtn').addEventListener('click', () => finishEditAndReturn(false));

const skipEditBtnTop = document.getElementById('skipEditBtnTop');
if (skipEditBtnTop) {
  skipEditBtnTop.addEventListener('click', () => finishEditAndReturn(false));
}

const fullscreenBtn = document.getElementById('fullscreenBtn');
const fullscreenIcon = document.getElementById('fullscreenIcon');
if (fullscreenBtn) {
  fullscreenBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
      });
    } else {
      document.exitFullscreen();
    }
  });
}
window.addEventListener('fullscreenchange', () => {
  if (fullscreenIcon) {
    fullscreenIcon.textContent = document.fullscreenElement ? 'fullscreen_exit' : 'fullscreen';
  }
});

// Removed beforeunload listener to prevent refresh freezing.