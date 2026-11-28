import { DEFAULT_CAPTIONS, STYLE_LOCK, VIDEO_H, VIDEO_W } from "./constants";
import { kit, type KitCtx, type KitExpr } from "./demo";
import { uid } from "./storage";
import type { AssetRef, Character, Project, Scene } from "./types";

/* =========================================================================
 * Built-in story #2: "Three parachutes" – 10 scenes, English narration.
 * Three black parachute packs + one red school bag with the same pattern.
 * ========================================================================= */

const { INK, C, newCanvas, toBlob, shape, rrect, line, cloud, sweat, head, hand, shirt, dress } = kit;
type Ctx = KitCtx;

const P = {
  wall: "#6f8b94",
  wallDark: "#5d7781",
  ceiling: "#4b5f69",
  floor: "#39434d",
  sky: "#8fb6c9",
  skyDeep: "#7ea7bb",
  land: "#7d9a6a",
  pack: "#2b2e35",
  packStrap: "#16181d",
  red: "#c2493d",
  redStrap: "#8e2f27",
  buckle: "#c9ccd2",
  shirtWhite: "#eeece6",
  mom: "#a5506a",
  kid1: "#5f8f6a",
  kid2: "#d98a3a",
  alarm: "#e0483a",
  book: ["#4f7cac", "#e3b23c", "#6aa36f", "#d0654f"],
};

/* ------------------------------ props ------------------------------ */

/** Parachute pack (or the look-alike school bag when `color` is red). */
function pack(ctx: Ctx, x: number, y: number, w: number, h: number, color: string, strap: string, tilt = 0) {
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(tilt);
  ctx.translate(-w / 2, -h / 2);
  const lw = Math.max(6, w * 0.045);
  // shoulder loops
  shape(ctx, null, lw * 1.6, () => {
    ctx.moveTo(w * 0.25, h * 0.08);
    ctx.quadraticCurveTo(w * 0.25, -h * 0.16, w * 0.42, -h * 0.02);
    ctx.moveTo(w * 0.75, h * 0.08);
    ctx.quadraticCurveTo(w * 0.75, -h * 0.16, w * 0.58, -h * 0.02);
  });
  shape(ctx, color, lw, () => rrect(ctx, 0, 0, w, h, w * 0.18));
  // top flap
  shape(ctx, null, lw * 0.8, () => {
    ctx.moveTo(w * 0.08, h * 0.3);
    ctx.quadraticCurveTo(w * 0.5, h * 0.4, w * 0.92, h * 0.3);
  });
  // vertical straps
  for (const sx of [0.22, 0.66]) shape(ctx, strap, lw * 0.7, () => rrect(ctx, w * sx, h * 0.08, w * 0.12, h * 0.86, w * 0.04));
  // chest buckle
  shape(ctx, P.buckle, lw * 0.7, () => rrect(ctx, w * 0.3, h * 0.55, w * 0.4, h * 0.11, w * 0.04));
  // ripcord ring
  shape(ctx, null, lw * 0.9, () => ctx.arc(w * 0.93, h * 0.72, w * 0.08, 0, Math.PI * 2));
  ctx.restore();
}

function blackPack(ctx: Ctx, x: number, y: number, w: number, tilt = 0) {
  pack(ctx, x, y, w, w * 1.45, P.pack, P.packStrap, tilt);
}
function redBag(ctx: Ctx, x: number, y: number, w: number, tilt = 0) {
  pack(ctx, x, y, w, w * 1.45, P.red, P.redStrap, tilt);
}

function rack(ctx: Ctx, x: number, y: number, w: number, hooks: number) {
  shape(ctx, "#b9b2a2", 10, () => rrect(ctx, x, y, w, 34, 12));
  for (let i = 0; i < hooks; i++) {
    const hx = x + (w / hooks) * (i + 0.5);
    line(ctx, 10, [
      [hx, y + 34],
      [hx, y + 70],
      [hx + 22, y + 82],
    ]);
  }
}

/* ------------------------------ sets ------------------------------ */

function cabin(ctx: Ctx, alarm = false) {
  ctx.fillStyle = P.wall;
  ctx.fillRect(-400, -400, VIDEO_W + 800, VIDEO_H + 800);
  ctx.fillStyle = P.ceiling;
  ctx.fillRect(-400, -400, VIDEO_W + 800, 700);
  for (let i = 0; i < 3; i++) shape(ctx, "#d3ccbc", 12, () => rrect(ctx, 20 + i * 350, 110, 330, 200, 40));
  ctx.fillStyle = P.floor;
  ctx.fillRect(-400, 1620, VIDEO_W + 800, 700);
  line(ctx, 10, [
    [-400, 1620],
    [VIDEO_W + 400, 1620],
  ]);
  if (alarm) {
    shape(ctx, P.alarm, 10, () => ctx.arc(540, 360, 46, Math.PI, 0));
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = P.alarm;
    ctx.fillRect(-400, -400, VIDEO_W + 800, VIDEO_H + 800);
    ctx.globalAlpha = 1;
  }
}

function porthole(ctx: Ctx, x: number, y: number, s: number, smoke = false) {
  shape(ctx, "#e8e2d4", 12, () => ctx.ellipse(x, y, 110 * s, 150 * s, 0, 0, Math.PI * 2));
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(x, y, 80 * s, 118 * s, 0, 0, Math.PI * 2);
  ctx.fillStyle = smoke ? "#5b5f6b" : P.sky;
  ctx.fill();
  ctx.clip();
  if (smoke) {
    ctx.fillStyle = "#8a8d96";
    for (const [dx, dy, r] of [
      [-30, 40, 50],
      [20, -10, 60],
      [-10, -70, 45],
    ])
      shape(ctx, "#8a8d96", 0, () => ctx.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2));
    shape(ctx, "#f08a3c", 0, () => ctx.arc(x + 20 * s, y + 70 * s, 34 * s, 0, Math.PI * 2));
  } else cloud(ctx, x - 60 * s, y + 30 * s, 0.8 * s);
  ctx.restore();
  shape(ctx, null, 12, () => ctx.ellipse(x, y, 80 * s, 118 * s, 0, 0, Math.PI * 2));
}

function skyBox(ctx: Ctx, x: number, y: number, w: number, h: number) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = P.sky;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = P.land;
  ctx.fillRect(x, y + h * 0.86, w, h * 0.14);
  cloud(ctx, x + w * 0.1, y + h * 0.2, 1.1);
  cloud(ctx, x + w * 0.55, y + h * 0.55, 0.9);
  cloud(ctx, x + w * 0.2, y + h * 0.75, 0.7);
  ctx.restore();
}

function openDoor(ctx: Ctx) {
  cabin(ctx);
  const dx = 250;
  const dy = 420;
  const dw = 580;
  const dh = 1180;
  shape(ctx, "#cfc8b8", 14, () => rrect(ctx, dx - 40, dy - 40, dw + 80, dh + 80, 90));
  skyBox(ctx, dx, dy, dw, dh);
  shape(ctx, null, 14, () => rrect(ctx, dx, dy, dw, dh, 70));
  // swung-open door panel
  shape(ctx, "#d9d2c3", 14, () => {
    ctx.moveTo(dx + dw + 40, dy - 20);
    ctx.lineTo(dx + dw + 210, dy + 60);
    ctx.lineTo(dx + dw + 210, dy + dh - 40);
    ctx.lineTo(dx + dw + 40, dy + dh + 20);
    ctx.closePath();
  });
  // wind streaks
  ctx.globalAlpha = 0.6;
  for (let i = 0; i < 6; i++)
    line(ctx, 8, [
      [dx + 60 + i * 80, dy + 120 + (i % 3) * 300],
      [dx + 10 + i * 80, dy + 260 + (i % 3) * 300],
    ], "#f4f1ea");
  ctx.globalAlpha = 1;
  return { dx, dy, dw, dh };
}

/* ------------------------------ characters ------------------------------ */

function legs(ctx: Ctx, x: number, top: number, len: number, lw: number, spread = 0.25) {
  line(ctx, lw, [
    [x - len * spread * 0.4, top],
    [x - len * spread, top + len],
  ]);
  line(ctx, lw, [
    [x + len * spread * 0.4, top],
    [x + len * spread, top + len],
  ]);
  shape(ctx, INK, 0, () => {
    ctx.ellipse(x - len * spread - lw, top + len + lw * 0.6, lw * 2.6, lw * 1.2, 0, 0, Math.PI * 2);
    ctx.ellipse(x + len * spread + lw, top + len + lw * 0.6, lw * 2.6, lw * 1.2, 0, 0, Math.PI * 2);
  });
}

/** Captain: white shirt, navy tie, pilot cap. Returns shoulder anchor points. */
function captainBody(ctx: Ctx, x: number, headY: number, r: number, lw: number) {
  const top = headY + r * 0.9;
  shirt(ctx, x, top, r * 1.7, r * 2.1, P.shirtWhite, lw);
  shape(ctx, C.navy, lw * 0.7, () => {
    ctx.moveTo(x - r * 0.12, top + 4);
    ctx.lineTo(x + r * 0.12, top + 4);
    ctx.lineTo(x + r * 0.1, top + r * 1.1);
    ctx.lineTo(x, top + r * 1.3);
    ctx.lineTo(x - r * 0.1, top + r * 1.1);
    ctx.closePath();
  });
  // shoulder stripes
  for (const sx of [-1, 1]) line(ctx, lw * 0.7, [[x + sx * r * 0.55, top + r * 0.12], [x + sx * r * 0.85, top + r * 0.3]], "#e7c14d");
  return { top, ls: [x - r * 0.75, top + r * 0.35] as [number, number], rs: [x + r * 0.75, top + r * 0.35] as [number, number] };
}

function momBody(ctx: Ctx, x: number, headY: number, r: number, lw: number) {
  const top = headY + r * 0.9;
  dress(ctx, x, top, r * 1.6, r * 2.8, lw, P.mom);
  return { top, ls: [x - r * 0.45, top + r * 0.3] as [number, number], rs: [x + r * 0.45, top + r * 0.3] as [number, number] };
}

function kidBody(ctx: Ctx, x: number, headY: number, r: number, lw: number, color: string) {
  const top = headY + r * 0.9;
  shirt(ctx, x, top, r * 1.5, r * 1.5, color, lw);
  return { top, ls: [x - r * 0.65, top + r * 0.3] as [number, number], rs: [x + r * 0.65, top + r * 0.3] as [number, number] };
}

function arm(ctx: Ctx, lw: number, pts: [number, number][], handR: number) {
  line(ctx, lw, pts);
  const end = pts[pts.length - 1];
  hand(ctx, end[0], end[1], handR, lw * 0.75);
}

/** Full standing character used in group shots. */
function person(
  ctx: Ctx,
  who: "captain" | "mom" | "kid1" | "kid2",
  x: number,
  headY: number,
  r: number,
  expr: KitExpr,
  armsUp = false,
  look = 0,
) {
  const lw = Math.max(8, r * 0.1);
  const body =
    who === "captain"
      ? captainBody(ctx, x, headY, r, lw)
      : who === "mom"
        ? momBody(ctx, x, headY, r, lw)
        : kidBody(ctx, x, headY, r, lw, who === "kid1" ? P.kid1 : P.kid2);
  const bodyBottom = body.top + (who === "mom" ? r * 2.8 : who === "captain" ? r * 2.1 : r * 1.5);
  legs(ctx, x, bodyBottom, who === "mom" ? r * 0.9 : r * 1.3, lw);
  const reach = r * 1.3;
  if (armsUp) {
    arm(ctx, lw, [body.ls, [body.ls[0] - reach * 0.4, body.ls[1] - reach * 0.5], [body.ls[0] - reach * 0.5, body.ls[1] - reach]], r * 0.2);
    arm(ctx, lw, [body.rs, [body.rs[0] + reach * 0.4, body.rs[1] - reach * 0.5], [body.rs[0] + reach * 0.5, body.rs[1] - reach]], r * 0.2);
  } else {
    arm(ctx, lw, [body.ls, [body.ls[0] - reach * 0.3, body.ls[1] + reach * 0.5], [body.ls[0] - reach * 0.35, body.ls[1] + reach * 0.95]], r * 0.2);
    arm(ctx, lw, [body.rs, [body.rs[0] + reach * 0.3, body.rs[1] + reach * 0.5], [body.rs[0] + reach * 0.35, body.rs[1] + reach * 0.95]], r * 0.2);
  }
  const hair = who === "captain" ? "captain" : who === "mom" ? "bun" : who === "kid1" ? "curly" : "teo";
  head(ctx, x, headY, r, expr, { hair, lookX: look });
}

/* ------------------------------ scenes ------------------------------ */

async function s1(): Promise<Blob> {
  const [c, ctx] = newCanvas();
  ctx.save();
  ctx.translate(540, 960);
  ctx.rotate(-0.1);
  ctx.translate(-540, -960);
  cabin(ctx, true);
  porthole(ctx, 180, 640, 1, true);
  porthole(ctx, 900, 640, 1, true);
  person(ctx, "mom", 190, 950, 105, "panic", true);
  person(ctx, "kid1", 440, 1180, 80, "panic", true);
  person(ctx, "kid2", 640, 1180, 80, "panic", true);
  person(ctx, "captain", 880, 930, 110, "gasp", true);
  ctx.restore();
  sweat(ctx, 330, 860, 1.6);
  sweat(ctx, 1000, 820, 1.6);
  return toBlob(c);
}

async function s2(): Promise<Blob> {
  const [c, ctx] = newCanvas();
  cabin(ctx, true);
  rack(ctx, 600, 520, 440, 4);
  for (let i = 0; i < 3; i++) blackPack(ctx, 612 + i * 110, 590, 90);
  redBag(ctx, 942, 590, 90);
  const x = 400;
  const hy = 820;
  const r = 200;
  const lw = 18;
  const b = captainBody(ctx, x, hy, r, lw);
  legs(ctx, x, b.top + r * 2.1, 220, lw);
  // left arm down
  arm(ctx, lw, [b.ls, [b.ls[0] - 70, b.ls[1] + 200], [b.ls[0] - 40, b.ls[1] + 380]], 40);
  // right hand raised showing THREE fingers
  const hx = x + 380;
  const hyy = 760;
  line(ctx, lw, [b.rs, [x + 330, 1000], [hx, hyy + 40]]);
  for (const [fx, fy] of [
    [-34, -110],
    [0, -126],
    [34, -110],
  ])
    shape(ctx, kit.HEAD, lw * 0.6, () => rrect(ctx, hx + fx - 14, hyy + fy, 28, 100, 14));
  shape(ctx, kit.HEAD, lw * 0.7, () => ctx.arc(hx, hyy + 10, 52, 0, Math.PI * 2));
  head(ctx, x, hy, r, "gasp", { hair: "captain", lookX: 0.6 });
  sweat(ctx, x - 230, hy - 80, 2);
  return toBlob(c);
}

async function s3(): Promise<Blob> {
  const [c, ctx] = newCanvas();
  ctx.fillStyle = P.wallDark;
  ctx.fillRect(0, 0, VIDEO_W, VIDEO_H);
  // panel seams
  for (const y of [300, 1650]) line(ctx, 8, [[0, y], [VIDEO_W, y]], "#4f6670");
  rack(ctx, 40, 560, 1000, 4);
  blackPack(ctx, 55, 650, 220);
  blackPack(ctx, 305, 650, 220);
  blackPack(ctx, 555, 650, 220);
  redBag(ctx, 805, 650, 220);
  // subtle spotlight on the red one
  ctx.globalAlpha = 0.16;
  shape(ctx, "#fff3c8", 0, () => {
    ctx.moveTo(915, 0);
    ctx.lineTo(1080, 1300);
    ctx.lineTo(760, 1300);
    ctx.closePath();
  });
  ctx.globalAlpha = 1;
  return toBlob(c);
}

async function s4(): Promise<Blob> {
  const [c, ctx] = newCanvas();
  cabin(ctx, true);
  // shocked onlookers in the back
  person(ctx, "mom", 150, 760, 75, "gasp", false, 1);
  person(ctx, "kid1", 300, 900, 55, "gasp", false, 1);
  person(ctx, "kid2", 930, 900, 55, "gasp", false, -1);
  const x = 560;
  const hy = 760;
  const r = 180;
  const lw = 16;
  const b = captainBody(ctx, x, hy, r, lw);
  legs(ctx, x, b.top + r * 2.1, 220, lw);
  blackPack(ctx, x - 130, b.top + 60, 260, -0.08);
  arm(ctx, lw, [b.ls, [x - 260, b.top + 260], [x - 60, b.top + 330]], 36);
  arm(ctx, lw, [b.rs, [x + 260, b.top + 260], [x + 60, b.top + 390]], 36);
  head(ctx, x, hy, r, "smug", { hair: "captain", lookX: -0.4 });
  return toBlob(c);
}

async function fallingScene(who: "captain" | "mom"): Promise<Blob> {
  const [c, ctx] = newCanvas();
  const { dx, dy, dw, dh } = openDoor(ctx);
  ctx.save();
  ctx.beginPath();
  ctx.rect(dx, dy, dw, dh);
  ctx.clip();
  const x = dx + dw * 0.55;
  const hy = dy + dh * 0.42;
  ctx.translate(x, hy);
  ctx.rotate(who === "captain" ? 0.5 : -0.45);
  ctx.translate(-x, -hy);
  if (who === "captain") blackPack(ctx, x - 70, hy + 40, 140, 0.1);
  else redBag(ctx, x - 70, hy + 40, 140, -0.1);
  person(ctx, who, x, hy, 75, who === "captain" ? "panic" : "grin", true);
  ctx.restore();
  return toBlob(c);
}

async function s6(): Promise<Blob> {
  const [c, ctx] = newCanvas();
  cabin(ctx, true);
  rack(ctx, 620, 520, 420, 4);
  blackPack(ctx, 742, 590, 90);
  blackPack(ctx, 852, 590, 90);
  // kids staring
  person(ctx, "kid1", 170, 1250, 70, "stare", false, 1);
  person(ctx, "kid2", 920, 1250, 70, "stare", false, -1);
  const x = 540;
  const hy = 640;
  const r = 165;
  const lw = 16;
  const b = momBody(ctx, x, hy, r, lw);
  legs(ctx, x, b.top + r * 2.8, 140, lw, 0.2);
  // red bag held high in both hands
  redBag(ctx, x - 120, 180, 240, 0.05);
  arm(ctx, lw, [b.ls, [x - 230, b.top - 20], [x - 110, 330]], 34);
  arm(ctx, lw, [b.rs, [x + 230, b.top - 20], [x + 110, 330]], 34);
  head(ctx, x, hy, r, "smug", { hair: "bun" });
  return toBlob(c);
}

async function s8(): Promise<Blob> {
  const [c, ctx] = newCanvas();
  cabin(ctx, true);
  rack(ctx, 140, 520, 800, 4);
  blackPack(ctx, 170, 600, 150);
  blackPack(ctx, 370, 600, 150);
  person(ctx, "kid1", 330, 1100, 135, "grin");
  person(ctx, "kid2", 760, 1100, 135, "grin");
  return toBlob(c);
}

async function s9(): Promise<Blob> {
  const [c, ctx] = newCanvas();
  ctx.fillStyle = P.wall;
  ctx.fillRect(0, 0, VIDEO_W, VIDEO_H);
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = P.alarm;
  ctx.fillRect(0, 0, VIDEO_W, VIDEO_H);
  ctx.globalAlpha = 1;
  // the empty hook where the red bag hung
  rack(ctx, -60, 260, 520, 2);
  const x = 640;
  const hy = 980;
  const r = 300;
  const lw = 22;
  shirt(ctx, x, hy + r * 0.85, r * 1.6, 700, P.kid1, lw);
  // pointing arm toward the empty hook
  line(ctx, lw, [[x - 330, hy + 330], [150, 860], [250, 480]]);
  shape(ctx, kit.HEAD, lw * 0.7, () => ctx.arc(255, 470, 50, 0, Math.PI * 2));
  shape(ctx, kit.HEAD, lw * 0.6, () => rrect(ctx, 240, 350, 30, 110, 15));
  head(ctx, x, hy, r, "panic", { hair: "curly", lookX: -1, lookY: -0.6 });
  sweat(ctx, x + 330, hy - 200, 2.6);
  sweat(ctx, x + 260, hy - 330, 1.8);
  return toBlob(c);
}

async function s10(): Promise<Blob> {
  const [c, ctx] = newCanvas();
  ctx.fillStyle = P.skyDeep;
  ctx.fillRect(0, 0, VIDEO_W, VIDEO_H);
  cloud(ctx, 60, 300, 1.6);
  cloud(ctx, 700, 1500, 1.4);
  // speed lines (falling)
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 12; i++) line(ctx, 8, [[60 + i * 90, 1920], [60 + i * 90, 1650 - (i % 3) * 120]], "#f4f1ea");
  ctx.globalAlpha = 1;
  // stuff flying out of the opened school bag
  const items: [number, number, number, number][] = [
    [120, 260, -0.4, 0],
    [820, 300, 0.5, 1],
    [70, 1100, 0.3, 2],
    [880, 1080, -0.3, 3],
  ];
  for (const [bx, by, rot, k] of items) {
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(rot);
    shape(ctx, P.book[k], 12, () => rrect(ctx, -90, -120, 180, 240, 10));
    line(ctx, 8, [[-60, -70], [60, -70]]);
    line(ctx, 8, [[-60, -30], [40, -30]]);
    ctx.restore();
  }
  // pencils
  for (const [px, py, rot] of [
    [300, 160, 0.8],
    [760, 620, -0.6],
    [230, 1500, 0.3],
  ] as [number, number, number][]) {
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(rot);
    shape(ctx, "#e3b23c", 8, () => rrect(ctx, -110, -14, 200, 28, 4));
    shape(ctx, "#f1ddb4", 8, () => {
      ctx.moveTo(90, -14);
      ctx.lineTo(130, 0);
      ctx.lineTo(90, 14);
      ctx.closePath();
    });
    ctx.restore();
  }
  // lunch box
  shape(ctx, "#6aa36f", 12, () => rrect(ctx, 830, 1330, 180, 130, 20));
  line(ctx, 10, [[860, 1330], [880, 1290], [960, 1290], [980, 1330]]);
  // mom close-up holding the open red bag
  const x = 540;
  const hy = 720;
  const r = 330;
  head(ctx, x, hy, r, "deadpan", { hair: "bun", tilt: 0.05 });
  redBag(ctx, x - 190, 1150, 380, 0);
  // open flap
  shape(ctx, P.red, 14, () => {
    ctx.moveTo(x - 190, 1220);
    ctx.lineTo(x - 260, 1080);
    ctx.lineTo(x + 260, 1080);
    ctx.lineTo(x + 190, 1220);
    ctx.closePath();
  });
  hand(ctx, x - 230, 1300, 50, 14);
  hand(ctx, x + 230, 1300, 50, 14);
  return toBlob(c);
}

async function characterSheet(): Promise<Blob> {
  const [c, ctx] = newCanvas(1600, 1000);
  ctx.fillStyle = "#e9e4da";
  ctx.fillRect(0, 0, 1600, 1000);
  person(ctx, "captain", 230, 260, 110, "smile");
  person(ctx, "mom", 640, 260, 105, "smile");
  person(ctx, "kid1", 1010, 420, 85, "grin");
  person(ctx, "kid2", 1300, 420, 85, "grin");
  blackPack(ctx, 1420, 120, 120);
  redBag(ctx, 1420, 340, 120);
  return toBlob(c);
}

/* ------------------------------ project ------------------------------ */

export const PARACHUTE_CHARACTERS: Character[] = [
  {
    name: "Captain",
    description:
      "airline captain with round pure-white head, navy pilot cap with a gold badge and black brim, huge round cartoon eyes, white short-sleeve uniform shirt with gold shoulder stripes and a navy tie, thin black stick limbs",
  },
  {
    name: "Mom",
    description: "woman with round pure-white head, black hair in a bun, large eyes, muted magenta A-line dress, thin black stick arms and legs",
  },
  {
    name: "Kid 1",
    description: "small kid with round pure-white head, curly black hair, big eyes, muted green t-shirt, thin black stick limbs – owner of the red school backpack",
  },
  {
    name: "Kid 2",
    description: "small kid with round pure-white head, three short black spiky hair strands, big eyes, muted orange t-shirt, thin black stick limbs",
  },
];

const SCENES: (Omit<Scene, "imagePrompt" | "duration"> & { prompt: string })[] = [
  {
    id: 1,
    narration: "Mid-flight, both engines die. The plane starts falling!",
    shotType: "wide",
    cameraEffect: "dramatic_shake",
    sfx: "whoosh",
    prompt: "Tilted wide shot of an airplane cabin under red emergency light, smoke and fire outside the windows, Captain, Mom, Kid 1 and Kid 2 screaming with arms up",
  },
  {
    id: 2,
    narration: "The captain bursts in. Bad news. We have three parachutes, and four people.",
    shotType: "medium",
    cameraEffect: "punch_zoom_in",
    sfx: "record_scratch",
    prompt: "Medium shot, sweating Captain holds up three fingers, behind him a wall rack with three black parachute packs and one red backpack",
  },
  {
    id: 3,
    narration: "Three black packs hang by the door. Plus one red one. Same straps, same buckle.",
    shotType: "close_up",
    cameraEffect: "slow_zoom",
    sfx: "none",
    prompt: "Close-up of a cabin wall rack: three identical black parachute packs and one red backpack with the exact same straps and buckle, soft spotlight on the red one",
  },
  {
    id: 4,
    narration: "The captain grabs one. I'm the captain! I must survive! I go first!",
    shotType: "medium",
    cameraEffect: "punch_zoom_in",
    sfx: "pop",
    prompt: "Medium shot, smug Captain hugging a black parachute pack to his chest, Mom and the two kids gasping in the background",
  },
  {
    id: 5,
    narration: "And just like that, he's gone.",
    shotType: "wide",
    cameraEffect: "flash_cut",
    sfx: "whoosh",
    prompt: "Wide shot through the open airplane door, blue sky and clouds, the Captain tumbling away wearing a black parachute pack",
  },
  {
    id: 6,
    narration: "The mom grabs the red one. I'm a woman! Ladies get priority!",
    shotType: "medium",
    cameraEffect: "punch_zoom_in",
    sfx: "ding",
    prompt: "Medium shot, smug Mom holding the red backpack high above her head like a trophy, two black packs left on the rack, the kids staring",
  },
  {
    id: 7,
    narration: "And she jumps too.",
    shotType: "wide",
    cameraEffect: "flash_cut",
    sfx: "whoosh",
    prompt: "Wide shot through the open airplane door, Mom falling away happily with the red backpack on her back",
  },
  {
    id: 8,
    narration: "Two kids left. Two parachutes. Easy math.",
    shotType: "medium",
    cameraEffect: "static",
    sfx: "cricket",
    prompt: "Medium shot, Kid 1 and Kid 2 grinning calmly under the rack holding the last two black parachute packs",
  },
  {
    id: 9,
    narration: "Then one kid screams. Hey! That lady took my school bag!",
    shotType: "close_up",
    cameraEffect: "dramatic_shake",
    sfx: "record_scratch",
    prompt: "Close-up of Kid 1 in total panic pointing at the empty hook where the red backpack used to hang, sweat drops",
  },
  {
    id: 10,
    narration: "Somewhere below, she pulls the cord. Out come pencils, a lunchbox, and math homework.",
    shotType: "extreme_close_up",
    cameraEffect: "freeze_grayscale",
    sfx: "vine_boom",
    prompt: "Extreme close-up in the sky, Mom's deadpan face while falling, the opened red school backpack spilling textbooks, pencils and a lunchbox around her",
  },
];

/** Rough duration from word count – replaced by exact per-scene voice timing in Tab 3. */
const estimate = (text: string) => Math.max(1.8, Math.round((text.split(/\s+/).length / 2.6 + 0.6) * 10) / 10);

export async function buildParachuteProject(): Promise<{ project: Project; blobs: Record<string, Blob> }> {
  const painters = [s1, s2, s3, s4, () => fallingScene("captain"), s6, () => fallingScene("mom"), s8, s9, s10];
  const scenes: Scene[] = SCENES.map(({ prompt, ...rest }) => ({
    ...rest,
    duration: estimate(rest.narration),
    imagePrompt: `${prompt}, ${STYLE_LOCK}`,
  }));
  const blobs: Record<string, Blob> = {};
  const sceneAssets: Record<string, AssetRef> = {};
  for (let i = 0; i < painters.length; i++) {
    const b = await painters[i]();
    const key = uid("demo_");
    blobs[key] = b;
    sceneAssets[String(scenes[i].id)] = { key, kind: "image", mime: "image/png", name: `parachute-${String(i + 1).padStart(2, "0")}.png` };
  }
  const sheetKey = uid("demo_");
  blobs[sheetKey] = await characterSheet();
  const now = Date.now();
  return {
    project: {
      id: uid("p_"),
      name: "Demo – Three Parachutes",
      createdAt: now,
      updatedAt: now,
      script: {
        title: "Three Parachutes",
        topic: "Three black parachutes and one red school bag with the same pattern on a falling plane",
        language: "en",
        targetDuration: 40,
        voiceoverScript: scenes.map((s) => s.narration).join(" "),
        characters: PARACHUTE_CHARACTERS,
        scenes,
      },
      sceneAssets,
      characterRefs: [{ key: sheetKey, kind: "image", mime: "image/png", name: "parachute-characters.png" }],
      voiceover: null,
      customSfx: {},
      captions: { ...DEFAULT_CAPTIONS },
    },
    blobs,
  };
}

