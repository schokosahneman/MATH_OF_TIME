// ------------------------------------------------------------
// THE MATH OF TIME — p5.js Web Version (VISUAL ONLY)
// Responsive Canvas + HiDPI
// Content-based scaling with symmetric top/bottom margins
// Grid: ONLY Y-windowed (starts where top-right ASCII ends, ends where bottom-left ASCII begins)
// Angles: visible (° labels at the three points)
// Transition: invert overlay alpha locked to triContentAlpha (perfect sync)
//
// Features:
// - Type in Time (T, Enter) -> manual time preview
// - Time Roulette toggle (Z) with slow brake-out
// - Reset to Live (R)
// - Manual Phase Control: Space toggles auto/manual, 1 geo, 2 tri, 3 auto
// - Right-side controls box aligned to grid bounds (starts where grid ends to the right)
// - Left-side info box aligned to grid bounds (ends where grid begins to the left)
// - Help colors: black on white mode, white on negative mode
// ------------------------------------------------------------

const DESIGN_W = 1080;
const DESIGN_H = 1920;

// --- CONTENT BOUNDS (DESIGN coords) ---
const CONTENT_TOP_BASE = -180;       // dayText sits here
const CONTENT_BOTTOM_BASE = 1120;    // zoom knob
const CONTENT_PAD = 80;              // symmetric padding => equal top/bottom margin

const CONTENT_MIN_Y = CONTENT_TOP_BASE - CONTENT_PAD;
const CONTENT_MAX_Y = CONTENT_BOTTOM_BASE + CONTENT_PAD;

// ASCII constants (must match blocks)
const ASCII_PX = 14;
const ASCII_COLS = 20;
const ASCII_ROWS = 10;

// animation states
let animTime = 0;
let fadeTimer = 0;
let geoAlpha = 255;
let triContentAlpha = 0;
let sc = 1;

// store current content transform (for aligning UI to grid bounds)
let gOffX = 0;
let gOffY = 0;
let gSc = 1;

// keep last controls box size (so left box can match exactly)
let gControlsBoxW = 330;
let gControlsBoxH = 230;

// --- TIME CONTROL ---
let useLiveTime = true;     // if false -> use manual time
let manualH = 12, manualM = 0, manualS = 0;

// Type-in-time UI
let typingMode = false;
let timeInput = "";         // "HH:MM" or "HH:MM:SS"
let inputHintTimer = 0;

// Roulette with braking
// states: "off" | "spin" | "brake"
let rouletteState = "off";
let rouletteNextAt = 0;
let rouletteInterval = 90;        // ms (fast)
const ROULETTE_FAST = 90;
const ROULETTE_SLOW_STOP = 950;   // ms threshold where we stop
const ROULETTE_BRAKE_MULT = 1.18; // grows interval each tick during brake

// --- PHASE CONTROL ---
let phaseMode = "auto";          // "auto" | "geo" | "tri"
let manualPhaseEnabled = false;  // toggled by Space

// ------------------------------------------------------------
// LEFT INFO BOX TEXT (edit here if you want exact wording)
// ------------------------------------------------------------
const INFO_TITLE = "MATH OF TIME";
const INFO_PARAS = [
  "MATH OF TIME is an alternative clock system that visualizes the hidden mathematics behind everyday time perception.",
  "Instead of showing fixed numbers, it translates real time into shifting geometry, movement, rhythm, and sound. Each moment generates its own geometric configuration, with a constantly transforming triangle forming a unique signature of the present.",
  "Programmed in Processing and expanded through an audiovisual composition, the work explores how time—though mathematical and measurable—becomes deeply personal through perception, attention, and experience."
];

// Highlight exactly this sentence (we render it bold as its own line block)
const INFO_HIGHLIGHT = "Each moment generates its own geometric configuration.";

// Bottom meta
const INFO_META = [
  { k: "YEAR",        v: "2025" },
  { k: "SUPERVISION", v: "PROF. NINA JURIC" },
  { k: "PROGRAMM",    v: "PROCESSING" },
];

// ------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------
function daysInMonth(y, m) {
  const dm = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const leap = (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
  if (leap) dm[1] = 29;
  return dm[m - 1];
}

function angleAtPoint(P, A, B) {
  const v1 = p5.Vector.sub(A, P);
  const v2 = p5.Vector.sub(B, P);
  if (v1.mag() === 0 || v2.mag() === 0) return 0;

  v1.normalize();
  v2.normalize();
  const dot = constrain(p5.Vector.dot(v1, v2), -1, 1);
  return degrees(acos(dot));
}

function clampInt(v, a, b) {
  return Math.max(a, Math.min(b, v | 0));
}

function setManualTime(h, m, s) {
  manualH = clampInt(h, 0, 23);
  manualM = clampInt(m, 0, 59);
  manualS = clampInt(s, 0, 59);
  useLiveTime = false;
}

function setRandomTime() {
  const h = floor(random(0, 24));
  const m = floor(random(0, 60));
  const s = floor(random(0, 60));
  setManualTime(h, m, s);
}

function parseTimeString(str) {
  const parts = str.trim().split(":");
  if (parts.length < 2 || parts.length > 3) return null;

  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const s = parts.length === 3 ? parseInt(parts[2], 10) : 0;

  if ([h, m, s].some(n => Number.isNaN(n))) return null;
  if (h < 0 || h > 23) return null;
  if (m < 0 || m > 59) return null;
  if (s < 0 || s > 59) return null;

  return { h, m, s };
}

function fmt2(n) {
  return nf(n, 2);
}

function rouletteStart() {
  typingMode = false;
  timeInput = "";
  inputHintTimer = 0;

  useLiveTime = false;
  rouletteState = "spin";
  rouletteInterval = ROULETTE_FAST;
  rouletteNextAt = millis();
}

function rouletteBeginBrake() {
  rouletteState = "brake";
  rouletteNextAt = millis() + rouletteInterval;
}

function rouletteStop() {
  rouletteState = "off";
}

// ------------------------------------------------------------
// INPUT
// ------------------------------------------------------------
function keyPressed() {
  // RESET
  if (key === 'r' || key === 'R') {
    rouletteStop();
    typingMode = false;
    timeInput = "";
    useLiveTime = true;
    manualPhaseEnabled = false;
    phaseMode = "auto";
    return;
  }

  // ROULETTE TOGGLE (slow brake)
  if (key === 'z' || key === 'Z') {
    if (rouletteState === "off") rouletteStart();
    else if (rouletteState === "spin") rouletteBeginBrake();
    else if (rouletteState === "brake") rouletteStop(); // emergency stop
    return;
  }

  // phase control
  if (key === ' ') {
    manualPhaseEnabled = !manualPhaseEnabled;
    if (!manualPhaseEnabled) phaseMode = "auto";
    else phaseMode = "geo";
    return false;
  }
  if (key === '1') { manualPhaseEnabled = true; phaseMode = "geo"; return; }
  if (key === '2') { manualPhaseEnabled = true; phaseMode = "tri"; return; }
  if (key === '3') { manualPhaseEnabled = false; phaseMode = "auto"; return; }

  // type in time
  if (key === 't' || key === 'T') {
    rouletteStop();
    typingMode = !typingMode;
    if (typingMode) {
      timeInput = "";
      inputHintTimer = millis();
    }
    return;
  }

  // typing mode keys
  if (typingMode) {
    if (keyCode === ESCAPE) {
      typingMode = false;
      timeInput = "";
      return;
    }
    if (keyCode === ENTER || keyCode === RETURN) {
      const parsed = parseTimeString(timeInput);
      if (parsed) {
        rouletteStop();
        setManualTime(parsed.h, parsed.m, parsed.s);
        typingMode = false;
        timeInput = "";
      } else {
        inputHintTimer = millis();
      }
      return;
    }
    if (keyCode === BACKSPACE) {
      timeInput = timeInput.slice(0, -1);
      return;
    }
    if ((key >= '0' && key <= '9') || key === ':') {
      if (timeInput.length < 8) timeInput += key;
      return;
    }
    return;
  }
}

// ------------------------------------------------------------
// SETUP
// ------------------------------------------------------------
function setup() {
  pixelDensity(Math.min(window.devicePixelRatio || 1, 2));
  createCanvas(windowWidth, windowHeight);
  textAlign(CENTER, CENTER);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

// ------------------------------------------------------------
// DRAW
// ------------------------------------------------------------
function draw() {
  background(245);

  const dt = deltaTime / 1000.0;
  animTime += dt;
  fadeTimer += dt;

  // roulette tick + slow brake
  if (rouletteState !== "off" && millis() >= rouletteNextAt) {
    setRandomTime();

    if (rouletteState === "spin") {
      rouletteInterval = ROULETTE_FAST;
      rouletteNextAt = millis() + rouletteInterval;
    } else if (rouletteState === "brake") {
      rouletteInterval *= ROULETTE_BRAKE_MULT;
      rouletteNextAt = millis() + rouletteInterval;

      if (rouletteInterval >= ROULETTE_SLOW_STOP) {
        rouletteStop();
      }
    }
  }

  const cycle = fadeTimer % 23.0;

  // ------------------------------------------------------------
  // PHASES (auto) OR manual phase lock
  // ------------------------------------------------------------
  if (!manualPhaseEnabled && phaseMode === "auto") {
    if (cycle < 1.5) {
      const f = cycle / 1.5;
      geoAlpha = Math.floor(map(f, 0, 1, 255, 0));
      triContentAlpha = 0;
    } else if (cycle < 11.5) {
      geoAlpha = 0;
      triContentAlpha = 255;
    } else if (cycle < 13.0) {
      geoAlpha = 0;
      const f = (cycle - 11.5) / 1.5;
      triContentAlpha = Math.floor(map(f, 0, 1, 255, 0));
    } else if (cycle < 14.5) {
      triContentAlpha = 0;
      const f = (cycle - 13.0) / 1.5;
      geoAlpha = Math.floor(map(f, 0, 1, 0, 255));
    } else {
      geoAlpha = 255;
      triContentAlpha = 0;
    }
  } else {
    if (phaseMode === "tri") {
      geoAlpha = 0;
      triContentAlpha = 255;
    } else if (phaseMode === "geo") {
      geoAlpha = 255;
      triContentAlpha = 0;
    } else {
      manualPhaseEnabled = false;
      phaseMode = "auto";
    }
  }

  // ------------------------------------------------------------
  // RESPONSIVE SCALE (CONTENT-BASED + symmetric margins)
  // ------------------------------------------------------------
  const CONTENT_H = CONTENT_MAX_Y - CONTENT_MIN_Y;

  sc = Math.min(width / DESIGN_W, height / CONTENT_H);

  const offX = (width - DESIGN_W * sc) / 2;
  const offY = (height - CONTENT_H * sc) / 2;

  gOffX = offX;
  gOffY = offY;
  gSc = sc;

  push();
  translate(offX, offY - CONTENT_MIN_Y * sc);
  scale(sc);

  // ------------------------------------------------------------
  // Layout constants
  // ------------------------------------------------------------
  const cxHour = 450, cyHour = 620;
  const lineX = 735, lineTop = 140, lineBot = 740;
  const cxSec = 620, cySec = 420, secW = 260, secH = 520;
  const bx = 170, by = 70, bw = 100, bh = 260;
  const tiltHour = radians(-8);

  // ------------------------------------------------------------
  // GRID (Triangle only) — ONLY Y-windowed
  // ------------------------------------------------------------
  if (triContentAlpha > 0) {
    const gridSize = 28;
    const margin = 70;

    const asciiH = ASCII_ROWS * ASCII_PX;
    const topAsciiStartY = by - 150;
    const topAsciiBottomY = topAsciiStartY + asciiH;

    const bottomAsciiTopY = DESIGN_H / 2 - (ASCII_ROWS * ASCII_PX) / 2;

    const gridY0 = Math.max(margin, topAsciiBottomY);
    const gridY1 = Math.min(DESIGN_H - margin, bottomAsciiTopY);

    stroke(0, 18 * (triContentAlpha / 255.0));
    strokeWeight(1);

    for (let x = margin; x <= DESIGN_W - margin; x += gridSize) {
      line(x, gridY0, x, gridY1);
    }
    for (let y = gridY0; y <= gridY1; y += gridSize) {
      line(margin, y, DESIGN_W - margin, y);
    }
  }

  // ------------------------------------------------------------
  // TIME SOURCE (live vs manual)
  // ------------------------------------------------------------
  let hNow, mNow, sNow;
  if (useLiveTime) {
    hNow = hour();
    mNow = minute();
    sNow = second();
  } else {
    hNow = manualH;
    mNow = manualM;
    sNow = manualS;
  }

  const S = useLiveTime ? (millis() / 1000.0) % 60.0 : sNow;
  const M = mNow + S / 60.0;
  const H12 = (hNow % 12) + M / 60.0;

  let hourMarker = createVector(0, 0);
  let secondMarker = createVector(0, 0);
  let minuteMarker = createVector(0, 0);

  // ------------------------------------------------------------
  // 1) HOUR SHAPE
  // ------------------------------------------------------------
  push();
  translate(cxHour, cyHour);
  rotate(tiltHour);

  const t = millis() * 0.001;
  const sizeBase = 180;

  const pts = new Array(4);
  pts[0] = createVector(-sizeBase, -sizeBase);
  pts[1] = createVector(sizeBase, -sizeBase);
  pts[2] = createVector(sizeBase, sizeBase);
  pts[3] = createVector(-sizeBase, sizeBase);

  const triF = (sin(t * 0.5) + 1) * 0.5;
  const kiteF = (sin(t * 0.8 + PI / 3) + 1) * 0.5;
  const rectF = (sin(t * 0.6 + PI / 5) + 1) * 0.5;

  for (let i = 0; i < 4; i++) {
    if (i % 2 === 0) pts[i].x *= 1.0 + rectF * 0.3;
    else pts[i].y *= 1.0 + rectF * 0.2;
  }

  pts[0].x -= kiteF * 50;
  pts[2].x += kiteF * 50;
  pts[1].y -= kiteF * 30;
  pts[3].y += kiteF * 30;

  const midTop = p5.Vector.lerp(pts[0], pts[1], 0.5);
  pts[0].lerp(midTop, triF * 0.9);
  pts[1].lerp(midTop, triF * 0.9);

  noFill();
  stroke(0, 85 * (geoAlpha / 255.0));
  strokeWeight(1.8);

  beginShape();
  for (let i = 0; i < pts.length; i++) vertex(pts[i].x, pts[i].y);
  endShape(CLOSE);

  let perim = 0;
  for (let i = 0; i < 4; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % 4];
    perim += dist(a.x, a.y, b.x, b.y);
  }

  const aH = map(H12 % 12, 0, 12, 0, perim);
  let lenSoFar = 0;
  for (let i = 0; i < 4; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % 4];
    const d = dist(a.x, a.y, b.x, b.y);
    if (aH <= lenSoFar + d) {
      const f = (aH - lenSoFar) / d;
      hourMarker = p5.Vector.lerp(a, b, f);
      break;
    }
    lenSoFar += d;
  }

  // hour numbers
  const step = perim / 12.0;
  let traveled = 0;
  let currentIndex = 0;
  let edgeStart = pts[0];
  let edgeEnd = pts[1];
  let edgeLen = dist(edgeStart.x, edgeStart.y, edgeEnd.x, edgeEnd.y);

  for (let i = 0; i < 12; i++) {
    const target = i * step;

    while (target > traveled + edgeLen) {
      traveled += edgeLen;
      currentIndex = (currentIndex + 1) % 4;
      edgeStart = pts[currentIndex];
      edgeEnd = pts[(currentIndex + 1) % 4];
      edgeLen = dist(edgeStart.x, edgeStart.y, edgeEnd.x, edgeEnd.y);
    }

    const ratio = (target - traveled) / edgeLen;
    const pos = p5.Vector.lerp(edgeStart, edgeEnd, ratio);
    const disp = i === 0 ? 12 : i;

    const isActive = abs((H12 % 12) - disp) < 0.5;

    noStroke();
    if (isActive) {
      fill(0, geoAlpha);
      textFont("monospace");
      textSize(26);
    } else {
      fill(0, 140 * (geoAlpha / 255.0));
      textFont("Helvetica, Arial, sans-serif");
      textSize(13);
    }

    push();
    translate(pos.x, pos.y);
    text(String(disp), 0, 0);
    pop();
  }

  noStroke();
  fill(10, 40, 160);
  ellipse(hourMarker.x, hourMarker.y, 18, 18);

  pop(); // hour shape

  // ------------------------------------------------------------
  // 2) SECONDS OVAL
  // ------------------------------------------------------------
  noFill();
  stroke(0, 90 * (geoAlpha / 255.0));
  strokeWeight(1.4);
  ellipse(cxSec, cySec, secW, secH);

  textFont("Helvetica, Arial, sans-serif");
  textSize(10);

  for (let i = 0; i < 60; i++) {
    const a = TWO_PI * (i / 60.0) - HALF_PI;

    const ox = cxSec + cos(a) * (secW * 0.5);
    const oy = cySec + sin(a) * (secH * 0.5);

    const ix = cxSec + cos(a) * (secW * 0.5 - (i % 5 === 0 ? 14 : 7));
    const iy = cySec + sin(a) * (secH * 0.5 - (i % 5 === 0 ? 14 : 7));

    stroke(0, 70 * (geoAlpha / 255.0));
    line(ix, iy, ox, oy);

    if (i % 5 === 0) {
      noStroke();
      fill(0, 130 * (geoAlpha / 255.0));

      const lx = cxSec + cos(a) * (secW * 0.5 + 18);
      const ly = cySec + sin(a) * (secH * 0.5 + 18);

      push();
      translate(lx, ly);
      rotate(a + HALF_PI);
      text(nf(i, 2), 0, 0);
      pop();
    }
  }

  const aS = map(S, 0, 60, 0, TWO_PI) - HALF_PI;
  const sx = cxSec + cos(aS) * (secW * 0.5);
  const sy = cySec + sin(aS) * (secH * 0.5);
  secondMarker = createVector(sx, sy);

  noStroke();
  fill(10, 40, 160);
  ellipse(sx, sy, 8, 8);

  // ------------------------------------------------------------
  // 3) MINUTES
  // ------------------------------------------------------------
  stroke(0, 100 * (geoAlpha / 255.0));
  strokeWeight(1.4);
  line(lineX, lineTop, lineX, lineBot);

  textFont("Helvetica, Arial, sans-serif");
  textSize(10);

  for (let i = 0; i < 60; i++) {
    const y = map(i, 0, 59, lineTop, lineBot);
    const len = i % 5 === 0 ? 14 : 7;

    stroke(0, 70 * (geoAlpha / 255.0));
    line(lineX - len, y, lineX, y);

    if (i % 5 === 0) {
      noStroke();
      fill(0, 140 * (geoAlpha / 255.0));
      textAlign(RIGHT, CENTER);
      text(nf(i, 2), lineX - 18, y);
    }
  }

  const yM = map(M % 60.0, 0, 60, lineTop, lineBot);
  minuteMarker = createVector(lineX, yM);

  noStroke();
  fill(10, 40, 160);
  ellipse(lineX, yM, 13, 13);

  // ------------------------------------------------------------
  // 4) TRIANGLE LINES
  // ------------------------------------------------------------
  const hx = cxHour + cos(tiltHour) * hourMarker.x - sin(tiltHour) * hourMarker.y;
  const hy = cyHour + sin(tiltHour) * hourMarker.x + cos(tiltHour) * hourMarker.y;

  stroke(200, 0, 0, 76);
  strokeWeight(1.8);
  line(hx, hy, secondMarker.x, secondMarker.y);
  line(secondMarker.x, secondMarker.y, minuteMarker.x, minuteMarker.y);
  line(minuteMarker.x, minuteMarker.y, hx, hy);

  // ------------------------------------------------------------
  // ANGLES — ALWAYS VISIBLE
  // ------------------------------------------------------------
  const H = createVector(hx, hy);
  const Mv = createVector(minuteMarker.x, minuteMarker.y);
  const Sv = createVector(secondMarker.x, secondMarker.y);

  const angH = angleAtPoint(H, Sv, Mv);
  const angM = angleAtPoint(Mv, H, Sv);
  const angS = angleAtPoint(Sv, H, Mv);

  textFont("monospace");
  textSize(10);
  fill(0);
  noStroke();

  textAlign(CENTER, TOP);
  text(nf(angH, 0, 1) + "°", hx, hy + 18);
  text(nf(angM, 0, 1) + "°", minuteMarker.x, minuteMarker.y + 18);

  textAlign(CENTER, BOTTOM);
  text(nf(angS, 0, 1) + "°", secondMarker.x, secondMarker.y - 12);

  // ------------------------------------------------------------
  // INFO PANEL (box + point readout)
  // ------------------------------------------------------------
  noFill();
  stroke(0);
  strokeWeight(1.2);
  rect(bx, by, 100, 260);

  fill(0);
  noStroke();
  textAlign(LEFT, TOP);
  textFont("monospace");
  textSize(10);

  const tx = bx + 25;
  const ty = by + 25;

  text("Point (h)", tx, ty);
  text("X: " + Math.floor(hx), tx, ty + 20);
  text("Y: " + Math.floor(hy), tx, ty + 40);

  text("Point (min)", tx, ty + 80);
  text("X: " + Math.floor(minuteMarker.x), tx, ty + 100);
  text("Y: " + Math.floor(minuteMarker.y), tx, ty + 120);

  text("Point (sec)", tx, ty + 160);
  text("X: " + Math.floor(secondMarker.x), tx, ty + 180);
  text("Y: " + Math.floor(secondMarker.y), tx, ty + 200);

  // ------------------------------------------------------------
  // ASCII + calculating + loading (Triangle-Content)
  // ------------------------------------------------------------
  if (triContentAlpha > 0) {
    const mask = [
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    ];

    // ASCII #1 bottom-left
    const startX1 = bx;
    const startY1 = DESIGN_H / 2 - (ASCII_ROWS * ASCII_PX) / 2;

    textAlign(LEFT, TOP);
    textFont("monospace");
    textSize(ASCII_PX * 0.9);
    fill(0, triContentAlpha);

    for (let r = 0; r < ASCII_ROWS; r++) {
      for (let c = 0; c < ASCII_COLS; c++) {
        if (mask[r][c] === 1) {
          const d = Math.floor(random(0, 10));
          text(String(d), startX1 + c * ASCII_PX, startY1 + r * ASCII_PX);
        }
      }
    }

    // ASCII #2 top-right
    const ovalRight = cxSec + secW / 2;
    const asciiW = ASCII_COLS * ASCII_PX;
    const startX2 = ovalRight - asciiW;
    const startY2 = by - 150;

    for (let r = 0; r < ASCII_ROWS; r++) {
      for (let c = 0; c < ASCII_COLS; c++) {
        if (mask[r][c] === 1) {
          const d = Math.floor(random(0, 10));
          text(String(d), startX2 + c * ASCII_PX, startY2 + r * ASCII_PX);
        }
      }
    }

    // "calculating time…"
    const full = "calculating time…";
    const L = full.length;
    const baseX = 310;
    const baseY = 200;
    const gapY = 18;

    const phase = cycle - 1.5;

    let msg = "";
    let alpha = 255;

    if (phase < 2.0) {
      const letters = Math.floor(map(phase, 0, 2.0, 1, L));
      msg = full.substring(0, letters);
      alpha = 255;
    } else if (phase < 7.0) {
      msg = full;
      const blink = sin(frameCount * 0.15);
      alpha = map(blink, -1, 1, 60, 255);
    } else if (phase < 9.0) {
      const f = map(phase, 7.0, 9.0, 1.0, 0.0);
      const letters = Math.floor(map(f, 0, 1, 1, L));
      msg = full.substring(0, letters);
      alpha = 255;
    } else {
      msg = "";
      alpha = 0;
    }

    const finalAlpha = alpha * (triContentAlpha / 255.0);

    textFont("monospace");
    textSize(12);
    fill(0, finalAlpha);
    textAlign(LEFT, CENTER);

    text(msg, baseX, baseY);
    text(msg, baseX, baseY + gapY);
    text(msg, baseX, baseY + gapY * 2);

    // loading bar
    let p = constrain(cycle - 1.5, 0, 8.0);
    const filledBoxes = Math.floor(p / 2.0);

    const fullWidth = textWidth("calculating time…");
    const boxWidth = fullWidth / 4.0;
    const boxHeight = 10;
    const gap = 2;

    const lx = baseX;
    const ly = 265;

    const aStroke = 180 * (triContentAlpha / 255.0);
    stroke(0, aStroke);
    strokeWeight(1);

    for (let i = 0; i < 4; i++) {
      const x = lx + i * boxWidth;

      noFill();
      rect(x, ly, boxWidth - gap, boxHeight);

      if (i < filledBoxes) {
        fill(0, triContentAlpha);
        noStroke();
        rect(x, ly, boxWidth - gap, boxHeight);

        stroke(0, aStroke);
        noFill();
      }
    }
  }

  // ------------------------------------------------------------
  // DAY TEXT
  // ------------------------------------------------------------
  const dNow = day();
  const dMax = daysInMonth(year(), month());
  const dayText = "day " + dNow + " of " + dMax;

  const dayX = lineX;
  const dayY = -180;

  textAlign(RIGHT, CENTER);
  textFont("monospace");
  textSize(12);
  fill(0);
  noStroke();
  text(dayText, dayX, dayY);

  pop(); // end content transform

  // ------------------------------------------------------------
  // NEGATIVE EFFECT — PERFECTLY SYNCED
  // ------------------------------------------------------------
  if (triContentAlpha > 0) {
    const frameImg = get();
    frameImg.filter(INVERT);

    tint(255, triContentAlpha);
    image(frameImg, 0, 0);
    noTint();
  }

  // ------------------------------------------------------------
  // UI (screen space; not inverted)
  // ------------------------------------------------------------
  drawHelpBox();       // right box (controls)
  drawInfoBoxLeft();   // left box (project info)
}

// ------------------------------------------------------------
// HELP BOX UI (RIGHT) — starts where grid ends to the right
// ------------------------------------------------------------
function drawHelpBox() {
  const isNeg = triContentAlpha > 0;
  const fg = isNeg ? 255 : 0;
  const fgA = isNeg ? 210 : 190;
  const strokeA = isNeg ? 150 : 140;

  // Grid bounds in SCREEN SPACE
  const margin = 70;
  const gridRightScreen = gOffX + (DESIGN_W - margin) * gSc;
  const gridTopScreen   = gOffY + (margin - CONTENT_MIN_Y) * gSc;

  const x = gridRightScreen;
  const y = gridTopScreen;

  const pad = 18;
  const lh = 16;
  const fontSize = 12;

  textFont("monospace");
  textSize(fontSize);

  const rightMargin = 24;
  const maxW = Math.max(240, width - x - rightMargin);

  const modeTime = useLiveTime ? "LIVE" : "MANUAL";
  const modePhase = manualPhaseEnabled ? `MANUAL (${phaseMode.toUpperCase()})` : "AUTO";
  const rouletteTxt = rouletteState === "off" ? "OFF" : (rouletteState === "spin" ? "ON" : "BRAKE");

  const shownTime = useLiveTime
    ? `${fmt2(hour())}:${fmt2(minute())}:${fmt2(second())}`
    : `${fmt2(manualH)}:${fmt2(manualM)}:${fmt2(manualS)}`;

  let rawLines = [];
  rawLines.push("Controls");
  rawLines.push("");
  rawLines.push(`Time:     ${modeTime}   [${shownTime}]`);
  rawLines.push(`Phase:    ${modePhase}`);
  rawLines.push(`Roulette: ${rouletteTxt}`);
  rawLines.push("");
  rawLines.push("T   type time (HH:MM or HH:MM:SS)");
  rawLines.push("    Enter apply");
  rawLines.push("Z   toggle roulette (slow brake)");
  rawLines.push("R   reset to live");
  rawLines.push("Space  auto/manual phase");
  rawLines.push("1 geo   2 triangle   3 auto");

  if (typingMode) {
    rawLines.push("");
    const blink = (sin(millis() * 0.012) + 1) * 0.5;
    const caret = blink > 0.5 ? "_" : " ";
    rawLines.push(`INPUT: ${timeInput}${caret}`);

    const parsed = parseTimeString(timeInput);
    if (timeInput.length > 0 && !parsed && (millis() - inputHintTimer) < 900) {
      rawLines.push("format: HH:MM or HH:MM:SS");
    }
  }

  const wrapWidth = maxW - pad * 2;
  let lines = [];

  function pushWrapped(line) {
    if (line === "") { lines.push(""); return; }
    if (textWidth(line) <= wrapWidth) { lines.push(line); return; }

    const words = line.split(" ");
    let current = "";

    for (let i = 0; i < words.length; i++) {
      const test = current ? (current + " " + words[i]) : words[i];
      if (textWidth(test) <= wrapWidth) current = test;
      else {
        if (current) lines.push(current);
        current = words[i];
      }
    }
    if (current) lines.push(current);
  }

  for (const l of rawLines) pushWrapped(l);

  let desiredW = 240;
  for (const l of lines) desiredW = Math.max(desiredW, textWidth(l) + pad * 2);
  const boxW = Math.min(desiredW, maxW);
  const boxH = pad * 2 + lines.length * lh;

  // store so left box can match exactly
  gControlsBoxW = boxW;
  gControlsBoxH = boxH;

  noFill();
  stroke(fg, strokeA);
  strokeWeight(1);
  rect(x, y, boxW, boxH);

  noStroke();
  fill(fg, fgA);
  textAlign(LEFT, TOP);

  const textX = x + pad;
  const textY = y + pad;

  for (let i = 0; i < lines.length; i++) {
    text(lines[i], textX, textY + i * lh);
  }
}

// ------------------------------------------------------------
// LEFT INFO BOX — same size as Controls; ends where grid begins to the left
// ------------------------------------------------------------
function drawInfoBoxLeft() {
  const isNeg = triContentAlpha > 0;
  const fg = isNeg ? 255 : 0;
  const fgA = isNeg ? 210 : 190;
  const strokeA = isNeg ? 150 : 140;

  // --- Grid / ASCII bounds (DESIGN coords) ---
  const margin = 70;

  // bottom-left ASCII starts here (DESIGN coords) — same as in your ASCII drawing
  const bottomAsciiTopY = DESIGN_H / 2 - (ASCII_ROWS * ASCII_PX) / 2;

  // Grid top (DESIGN coords)
  const gridTopY = margin;

  // Box bottom should be: beginning of bottom-left ASCII (DESIGN coords)
  const boxBottomY = bottomAsciiTopY;

  // Convert to SCREEN SPACE using current content transform
  const gridLeftScreen = gOffX + (margin) * gSc;
  const yTopScreen = gOffY + (gridTopY - CONTENT_MIN_Y) * gSc;
  const yBottomScreen = gOffY + (boxBottomY - CONTENT_MIN_Y) * gSc;

  // Width like Controls, height = up to ASCII start
  const boxW = gControlsBoxW;
  const boxH = Math.max(140, yBottomScreen - yTopScreen);

  // Position: right edge touches grid left edge
  const x = gridLeftScreen - boxW;
  const y = yTopScreen;

  // Typography
  const pad = 18;
  const lh = 16;
  const fontSize = 12;

  textFont("monospace");
  textSize(fontSize);

  // Draw box
  noFill();
  stroke(fg, strokeA);
  strokeWeight(1);
  rect(x, y, boxW, boxH);

  const cx = x + pad;
  const cy = y + pad;
  const wrapW = boxW - pad * 2;

  function wrapTextToLines(str) {
    if (!str) return [""];
    const words = str.split(" ");
    let lines = [];
    let current = "";

    for (let i = 0; i < words.length; i++) {
      const test = current ? (current + " " + words[i]) : words[i];
      if (textWidth(test) <= wrapW) current = test;
      else {
        if (current) lines.push(current);
        current = words[i];
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  // -------------------------
  // META BLOCK (BOTTOM) — back again
  // -------------------------
  const metaGapAbove = 22;
  const metaRowStep = lh * 1.5;
  const metaBlockH = INFO_META.length * metaRowStep;

  const metaY = y + boxH - pad - metaBlockH;
  const bodyBottomY = metaY - metaGapAbove;

  // BODY
  noStroke();
  fill(fg, fgA);
  textAlign(LEFT, TOP);

  let yCursor = cy;

  // Title (bold)
  textStyle(BOLD);
  for (const l of wrapTextToLines(INFO_TITLE)) {
    if (yCursor + lh > bodyBottomY) break;
    text(l, cx, yCursor);
    yCursor += lh;
  }
  textStyle(NORMAL);

  yCursor += lh;

  // Paragraph 1
  for (const l of wrapTextToLines(INFO_PARAS[0])) {
    if (yCursor + lh > bodyBottomY) break;
    text(l, cx, yCursor);
    yCursor += lh;
  }

  yCursor += lh;

  // Paragraph 2 with highlight sentence (bold)
  const p2 = INFO_PARAS[1];
  const idx = p2.indexOf(INFO_HIGHLIGHT);

  if (idx >= 0) {
    const before = p2.slice(0, idx).trim();
    const after  = p2.slice(idx + INFO_HIGHLIGHT.length).trim();

    for (const l of wrapTextToLines(before)) {
      if (yCursor + lh > bodyBottomY) break;
      textStyle(NORMAL);
      text(l, cx, yCursor);
      yCursor += lh;
    }

    for (const l of wrapTextToLines(INFO_HIGHLIGHT)) {
      if (yCursor + lh > bodyBottomY) break;
      textStyle(BOLD);
      text(l, cx, yCursor);
      yCursor += lh;
    }
    textStyle(NORMAL);

    for (const l of wrapTextToLines(after)) {
      if (yCursor + lh > bodyBottomY) break;
      text(l, cx, yCursor);
      yCursor += lh;
    }
  } else {
    for (const l of wrapTextToLines(p2)) {
      if (yCursor + lh > bodyBottomY) break;
      text(l, cx, yCursor);
      yCursor += lh;
    }
  }

  yCursor += lh;

  // Paragraph 3
  for (const l of wrapTextToLines(INFO_PARAS[2])) {
    if (yCursor + lh > bodyBottomY) break;
    text(l, cx, yCursor);
    yCursor += lh;
  }

  // META (bold, 2 columns)
  textStyle(BOLD);
  textAlign(LEFT, TOP);

  const keyX = cx;
  const valX = x + boxW * 0.50;

  for (let i = 0; i < INFO_META.length; i++) {
    const rowY = metaY + i * metaRowStep;
    text(INFO_META[i].k, keyX, rowY);
    text(INFO_META[i].v, valX, rowY);
  }

  textStyle(NORMAL);
}
