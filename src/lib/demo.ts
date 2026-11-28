import { DEFAULT_CAPTIONS, STYLE_LOCK, VIDEO_H, VIDEO_W } from "./constants";
import { uid } from "./storage";
import type { AssetRef, Character, Project, Scene } from "./types";
import { audioBufferToWav } from "./wav";

/* =========================================================================
 * Built-in demo: "Chuyến bay định mệnh" – 5 scenes drawn procedurally with
 * Canvas 2D in the flat stickman style + a procedural "babble" voice track.
 * ========================================================================= */

const INK = "#111317";
const HEAD = "#fbfaf6";
const C = {
  ceiling: "#4b5f69",
  wall: "#6f8b94",
  wallDark: "#5d7781",
  bin: "#d3ccbc",
  floor: "#39434d",
  seat: "#8c4a4f",
  seatDark: "#733c41",
  headrest: "#e7dfcf",
  sky: "#a8cfe0",
  cloud: "#f4f1ea",
  frame: "#e8e2d4",
  mustard: "#d8a73a",
  navy: "#2f3e66",
  red: "#c2493d",
  hair: "#1b1b1f",
  food: "#b8733a",
  fish: "#e39a5b",
  plate: "#f1ece2",
  tray: "#9aa6ad",
  storm: "#454b63",
  bolt: "#f2d04b",
  purple: "#5b4e6e",
  sweat: "#7cc3e8",
  blush: "#f2a5a0",
};

type Ctx = CanvasRenderingContext2D;
type Expr = "smug" | "grin" | "panic" | "deadpan" | "full" | "smile" | "stare" | "sleep" | "gasp";

function newCanvas(w = VIDEO_W, h = VIDEO_H): [HTMLCanvasElement, Ctx] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D không khả dụng");
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  return [c, ctx];
}

function toBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob thất bại"))), "image/png"),
  );
}

function shape(ctx: Ctx, fill: string | null, lw: number, path: () => void) {
  ctx.beginPath();
  path();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (lw > 0) {
    ctx.lineWidth = lw;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }
}

function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function line(ctx: Ctx, lw: number, pts: [number, number][], color = INK) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
  ctx.lineWidth = lw;
  ctx.strokeStyle = color;
  ctx.stroke();
}

function cloud(ctx: Ctx, x: number, y: number, s: number) {
  ctx.fillStyle = C.cloud;
  ctx.beginPath();
  ctx.arc(x, y, 34 * s, 0, Math.PI * 2);
  ctx.arc(x + 40 * s, y - 14 * s, 42 * s, 0, Math.PI * 2);
  ctx.arc(x + 86 * s, y, 32 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(x, y, 86 * s, 30 * s);
}

function sweat(ctx: Ctx, x: number, y: number, s: number) {
  shape(ctx, C.sweat, 6 * s, () => {
    ctx.moveTo(x, y - 30 * s);
    ctx.quadraticCurveTo(x + 22 * s, y + 4 * s, x, y + 14 * s);
    ctx.quadraticCurveTo(x - 22 * s, y + 4 * s, x, y - 30 * s);
  });
}

/* ------------------------------ heads ------------------------------ */

interface HeadOpts {
  hair?: "teo" | "hoa" | "bun" | "captain" | "none" | "bald" | "curly";
  lookX?: number;
  lookY?: number;
  tilt?: number;
}

function head(ctx: Ctx, cx: number, cy: number, r: number, expr: Expr, o: HeadOpts = {}) {
  const lw = Math.max(8, r * 0.075);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(o.tilt ?? 0);
  // hair behind head
  if (o.hair === "hoa" || o.hair === "bun") {
    shape(ctx, C.hair, lw, () => ctx.arc(r * 0.72, -r * 0.62, r * 0.36, 0, Math.PI * 2));
  }
  shape(ctx, HEAD, lw, () => ctx.arc(0, 0, r, 0, Math.PI * 2));
  if (o.hair === "teo") {
    line(ctx, lw, [
      [-r * 0.28, -r * 0.93],
      [-r * 0.36, -r * 1.32],
    ]);
    line(ctx, lw, [
      [0, -r],
      [r * 0.04, -r * 1.42],
    ]);
    line(ctx, lw, [
      [r * 0.28, -r * 0.93],
      [r * 0.42, -r * 1.3],
    ]);
  } else if (o.hair === "captain") {
    // pilot cap: crown, brim and gold badge
    shape(ctx, C.navy, lw, () => {
      ctx.moveTo(-r * 0.95, -r * 0.55);
      ctx.quadraticCurveTo(-r * 1.05, -r * 1.25, 0, -r * 1.3);
      ctx.quadraticCurveTo(r * 1.05, -r * 1.25, r * 0.95, -r * 0.55);
      ctx.closePath();
    });
    shape(ctx, INK, 0, () => ctx.ellipse(0, -r * 0.55, r * 1.02, r * 0.16, 0, 0, Math.PI * 2));
    shape(ctx, "#e7c14d", lw * 0.6, () => ctx.arc(0, -r * 0.92, r * 0.14, 0, Math.PI * 2));
  } else if (o.hair === "hoa" || o.hair === "bun") {
    shape(ctx, C.hair, lw, () => {
      ctx.moveTo(-r * 0.98, -r * 0.1);
      ctx.quadraticCurveTo(-r * 0.9, -r * 1.05, 0, -r * 1.02);
      ctx.quadraticCurveTo(r * 0.95, -r * 1.0, r * 0.98, -r * 0.1);
      ctx.quadraticCurveTo(r * 0.4, -r * 0.62, -r * 0.98, -r * 0.1);
    });
    if (o.hair === "hoa") {
      // pillbox cap
      ctx.save();
      ctx.rotate(-0.2);
      shape(ctx, C.navy, lw, () => rrect(ctx, -r * 0.45, -r * 1.25, r * 0.8, r * 0.32, r * 0.08));
      ctx.restore();
    }
  } else if (o.hair === "curly") {
    for (let i = -3; i <= 3; i++) {
      const a = -Math.PI / 2 + i * 0.32;
      shape(ctx, C.hair, lw * 0.6, () => ctx.arc(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95, r * 0.2, 0, Math.PI * 2));
    }
  }

  const ex = r * 0.34;
  const ey = -r * 0.08;
  const lx = (o.lookX ?? 0) * r * 0.08;
  const ly = (o.lookY ?? 0) * r * 0.08;
  const eyeW = r * 0.24;
  const eyeH = r * 0.3;
  const eyeLw = lw * 0.8;

  const openEyes = (scale = 1, pupil = 0.45) => {
    for (const sx of [-1, 1]) {
      shape(ctx, "#fff", eyeLw, () => ctx.ellipse(sx * ex, ey, eyeW * scale, eyeH * scale, 0, 0, Math.PI * 2));
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(sx * ex + lx, ey + ly, eyeW * scale * pupil, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(sx * ex + lx - eyeW * scale * pupil * 0.35, ey + ly - eyeW * scale * pupil * 0.35, eyeW * scale * pupil * 0.28, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  const brows = (angle: number, dy: number) => {
    for (const sx of [-1, 1]) {
      ctx.save();
      ctx.translate(sx * ex, ey - eyeH - dy);
      ctx.rotate(sx * angle);
      line(ctx, lw * 0.9, [
        [-eyeW * 0.9, 0],
        [eyeW * 0.9, 0],
      ]);
      ctx.restore();
    }
  };

  switch (expr) {
    case "smug": {
      openEyes(1, 0.42);
      // heavy lids
      for (const sx of [-1, 1]) {
        shape(ctx, HEAD, 0, () => ctx.rect(sx * ex - eyeW * 1.1, ey - eyeH * 1.15, eyeW * 2.2, eyeH * 0.95));
        line(ctx, eyeLw, [
          [sx * ex - eyeW, ey - eyeH * 0.2],
          [sx * ex + eyeW, ey - eyeH * 0.2],
        ]);
      }
      ctx.save();
      ctx.translate(-ex, ey - eyeH - r * 0.12);
      ctx.rotate(-0.25);
      line(ctx, lw * 0.9, [
        [-eyeW, 0],
        [eyeW, 0],
      ]);
      ctx.restore();
      ctx.beginPath();
      ctx.moveTo(-r * 0.25, r * 0.42);
      ctx.quadraticCurveTo(r * 0.15, r * 0.55, r * 0.42, r * 0.3);
      ctx.lineWidth = lw;
      ctx.strokeStyle = INK;
      ctx.stroke();
      break;
    }
    case "grin": {
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(sx * ex, ey + eyeH * 0.2, eyeW * 0.9, Math.PI * 1.1, Math.PI * 1.9);
        ctx.lineWidth = lw;
        ctx.strokeStyle = INK;
        ctx.stroke();
      }
      shape(ctx, "#3a1f1f", lw, () => {
        ctx.moveTo(-r * 0.5, r * 0.22);
        ctx.quadraticCurveTo(0, r * 0.28, r * 0.5, r * 0.22);
        ctx.quadraticCurveTo(r * 0.45, r * 0.8, 0, r * 0.8);
        ctx.quadraticCurveTo(-r * 0.45, r * 0.8, -r * 0.5, r * 0.22);
      });
      shape(ctx, "#fff", 0, () => rrect(ctx, -r * 0.38, r * 0.25, r * 0.76, r * 0.13, r * 0.04));
      shape(ctx, C.red, 0, () => ctx.ellipse(0, r * 0.66, r * 0.2, r * 0.1, 0, 0, Math.PI * 2));
      ctx.globalAlpha = 0.7;
      shape(ctx, C.blush, 0, () => {
        ctx.ellipse(-r * 0.62, r * 0.22, r * 0.14, r * 0.08, 0, 0, Math.PI * 2);
        ctx.ellipse(r * 0.62, r * 0.22, r * 0.14, r * 0.08, 0, 0, Math.PI * 2);
      });
      ctx.globalAlpha = 1;
      break;
    }
    case "panic": {
      openEyes(1.25, 0.18);
      brows(-0.45, r * 0.1);
      shape(ctx, "#3a1f1f", lw, () => {
        ctx.moveTo(-r * 0.32, r * 0.5);
        for (let i = 0; i <= 8; i++) ctx.lineTo(-r * 0.32 + (i * r * 0.64) / 8, r * 0.42 + (i % 2 ? -r * 0.06 : r * 0.02));
        ctx.lineTo(r * 0.28, r * 0.75);
        ctx.quadraticCurveTo(0, r * 0.85, -r * 0.28, r * 0.75);
        ctx.closePath();
      });
      break;
    }
    case "deadpan": {
      openEyes(1.35, 0.1);
      line(ctx, lw, [
        [-r * 0.2, r * 0.5],
        [r * 0.2, r * 0.5],
      ]);
      break;
    }
    case "gasp": {
      openEyes(1.15, 0.22);
      brows(-0.2, r * 0.14);
      shape(ctx, "#3a1f1f", lw, () => ctx.ellipse(0, r * 0.52, r * 0.16, r * 0.22, 0, 0, Math.PI * 2));
      break;
    }
    case "full": {
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(sx * ex, ey - eyeH * 0.1, eyeW * 0.85, Math.PI * 0.1, Math.PI * 0.9);
        ctx.lineWidth = lw;
        ctx.strokeStyle = INK;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(0, r * 0.25, r * 0.32, Math.PI * 0.15, Math.PI * 0.85);
      ctx.lineWidth = lw;
      ctx.stroke();
      ctx.globalAlpha = 0.75;
      shape(ctx, C.blush, 0, () => {
        ctx.ellipse(-r * 0.6, r * 0.25, r * 0.15, r * 0.09, 0, 0, Math.PI * 2);
        ctx.ellipse(r * 0.6, r * 0.25, r * 0.15, r * 0.09, 0, 0, Math.PI * 2);
      });
      ctx.globalAlpha = 1;
      // crumbs
      ctx.fillStyle = C.food;
      for (const [x, y] of [
        [-0.35, 0.72],
        [0.25, 0.78],
        [0.4, 0.62],
      ])
        shape(ctx, C.food, 3, () => ctx.arc(x * r, y * r, r * 0.04, 0, Math.PI * 2));
      break;
    }
    case "smile": {
      openEyes(1, 0.45);
      ctx.beginPath();
      ctx.arc(0, r * 0.2, r * 0.32, Math.PI * 0.2, Math.PI * 0.8);
      ctx.lineWidth = lw;
      ctx.strokeStyle = INK;
      ctx.stroke();
      // lashes
      for (const sx of [-1, 1])
        line(ctx, lw * 0.6, [
          [sx * (ex + eyeW * 0.7), ey - eyeH * 0.8],
          [sx * (ex + eyeW * 1.15), ey - eyeH * 1.15],
        ]);
      break;
    }
    case "stare": {
      for (const sx of [-1, 1]) {
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.arc(sx * ex * 0.8 + lx, ey + ly, r * 0.08, 0, Math.PI * 2);
        ctx.fill();
      }
      line(ctx, lw, [
        [-r * 0.15 + lx, r * 0.45],
        [r * 0.15 + lx, r * 0.45],
      ]);
      break;
    }
    case "sleep": {
      for (const sx of [-1, 1])
        line(ctx, lw, [
          [sx * ex - eyeW * 0.7, ey],
          [sx * ex + eyeW * 0.7, ey + 4],
        ]);
      shape(ctx, "#3a1f1f", lw * 0.8, () => ctx.ellipse(0, r * 0.45, r * 0.1, r * 0.14, 0, 0, Math.PI * 2));
      shape(ctx, C.sweat, 4, () => ctx.ellipse(r * 0.16, r * 0.62, r * 0.05, r * 0.09, 0, 0, Math.PI * 2));
      break;
    }
  }
  ctx.restore();
}

function hand(ctx: Ctx, x: number, y: number, r: number, lw: number) {
  shape(ctx, HEAD, lw, () => ctx.arc(x, y, r, 0, Math.PI * 2));
}

function shirt(ctx: Ctx, cx: number, top: number, w: number, h: number, color: string, lw: number) {
  shape(ctx, color, lw, () => {
    ctx.moveTo(cx - w * 0.4, top);
    ctx.lineTo(cx + w * 0.4, top);
    ctx.lineTo(cx + w * 0.55, top + h * 0.35);
    ctx.lineTo(cx + w * 0.42, top + h * 0.4);
    ctx.lineTo(cx + w * 0.42, top + h);
    ctx.lineTo(cx - w * 0.42, top + h);
    ctx.lineTo(cx - w * 0.42, top + h * 0.4);
    ctx.lineTo(cx - w * 0.55, top + h * 0.35);
    ctx.closePath();
  });
}

function dress(ctx: Ctx, cx: number, top: number, w: number, h: number, lw: number, color: string = C.navy) {
  shape(ctx, color, lw, () => {
    ctx.moveTo(cx - w * 0.3, top);
    ctx.lineTo(cx + w * 0.3, top);
    ctx.lineTo(cx + w * 0.6, top + h);
    ctx.lineTo(cx - w * 0.6, top + h);
    ctx.closePath();
  });
  shape(ctx, C.red, lw * 0.8, () => {
    ctx.moveTo(cx - w * 0.28, top + 4);
    ctx.lineTo(cx + w * 0.28, top + 4);
    ctx.lineTo(cx + w * 0.08, top + h * 0.22);
    ctx.lineTo(cx, top + h * 0.12);
    ctx.closePath();
  });
}

function tray(ctx: Ctx, x: number, y: number, w: number, lw: number, contents: "chicken" | "fish" | "empty" | "bone") {
  shape(ctx, C.tray, lw, () => rrect(ctx, x, y, w, w * 0.18, w * 0.03));
  const cx = x + w / 2;
  const py = y - w * 0.02;
  if (contents === "empty" || contents === "bone") {
    shape(ctx, C.plate, lw * 0.8, () => ctx.ellipse(cx, py + w * 0.04, w * 0.32, w * 0.08, 0, 0, Math.PI * 2));
    if (contents === "bone") {
      line(ctx, lw * 1.6, [
        [cx - w * 0.15, py],
        [cx + w * 0.15, py - w * 0.03],
      ]);
      line(ctx, lw * 1.1, [
        [cx - w * 0.15, py],
        [cx + w * 0.15, py - w * 0.03],
      ], C.plate);
    }
    return;
  }
  shape(ctx, C.plate, lw * 0.8, () => ctx.ellipse(cx, py + w * 0.02, w * 0.36, w * 0.1, 0, 0, Math.PI * 2));
  if (contents === "chicken") {
    shape(ctx, C.food, lw * 0.8, () => ctx.ellipse(cx - w * 0.05, py - w * 0.06, w * 0.17, w * 0.11, -0.3, 0, Math.PI * 2));
    line(ctx, lw * 1.8, [
      [cx + w * 0.08, py - w * 0.1],
      [cx + w * 0.22, py - w * 0.17],
    ]);
    line(ctx, lw, [
      [cx + w * 0.08, py - w * 0.1],
      [cx + w * 0.22, py - w * 0.17],
    ], C.plate);
  } else {
    shape(ctx, C.fish, lw * 0.8, () => {
      ctx.ellipse(cx - w * 0.04, py - w * 0.06, w * 0.2, w * 0.09, 0, 0, Math.PI * 2);
    });
    shape(ctx, C.fish, lw * 0.8, () => {
      ctx.moveTo(cx + w * 0.14, py - w * 0.06);
      ctx.lineTo(cx + w * 0.28, py - w * 0.14);
      ctx.lineTo(cx + w * 0.28, py + w * 0.02);
      ctx.closePath();
    });
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(cx - w * 0.15, py - w * 0.08, w * 0.018, 0, Math.PI * 2);
    ctx.fill();
  }
}

function cabinBackdrop(ctx: Ctx, windows: { x: number; y: number; s: number }[]) {
  ctx.fillStyle = C.wall;
  ctx.fillRect(0, 0, VIDEO_W, VIDEO_H);
  ctx.fillStyle = C.ceiling;
  ctx.fillRect(0, 0, VIDEO_W, 330);
  // overhead bins
  for (let i = 0; i < 3; i++) shape(ctx, C.bin, 12, () => rrect(ctx, 20 + i * 350, 110, 330, 230, 40));
  for (let i = 0; i < 3; i++)
    shape(ctx, C.wallDark, 8, () => rrect(ctx, 145 + i * 350, 285, 80, 26, 12));
  for (const w of windows) {
    shape(ctx, C.frame, 12, () => ctx.ellipse(w.x, w.y, 120 * w.s, 165 * w.s, 0, 0, Math.PI * 2));
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(w.x, w.y, 88 * w.s, 132 * w.s, 0, 0, Math.PI * 2);
    ctx.fillStyle = C.sky;
    ctx.fill();
    ctx.clip();
    cloud(ctx, w.x - 70 * w.s, w.y + 40 * w.s, 0.9 * w.s);
    cloud(ctx, w.x - 10 * w.s, w.y - 70 * w.s, 0.6 * w.s);
    ctx.restore();
    shape(ctx, null, 12, () => ctx.ellipse(w.x, w.y, 88 * w.s, 132 * w.s, 0, 0, Math.PI * 2));
  }
}

function seatBack(ctx: Ctx, x: number, y: number, w: number, h: number) {
  shape(ctx, C.seat, 12, () => rrect(ctx, x, y, w, h, 60));
  shape(ctx, C.headrest, 10, () => rrect(ctx, x + w * 0.12, y + 22, w * 0.76, h * 0.18, 26));
}

/* ------------------------------ scenes ------------------------------ */

async function scene1(): Promise<Blob> {
  const [c, ctx] = newCanvas();
  cabinBackdrop(ctx, [
    { x: 200, y: 640, s: 1 },
    { x: 880, y: 640, s: 1 },
  ]);
  ctx.fillStyle = C.floor;
  ctx.fillRect(0, 1600, VIDEO_W, 320);
  line(ctx, 10, [
    [0, 1600],
    [VIDEO_W, 1600],
  ]);
  // three seats
  const xs = [30, 375, 720];
  xs.forEach((x) => seatBack(ctx, x, 900, 330, 620));
  // Teo (window seat) – arms behind head
  const tx = 195;
  line(ctx, 14, [
    [tx - 70, 1150],
    [tx - 175, 1010],
    [tx - 110, 950],
  ]);
  line(ctx, 14, [
    [tx + 70, 1150],
    [tx + 175, 1010],
    [tx + 110, 950],
  ]);
  shirt(ctx, tx, 1100, 200, 300, C.mustard, 12);
  head(ctx, tx, 975, 125, "smug", { hair: "teo", lookX: 0.6 });
  // legs to camera
  line(ctx, 14, [
    [tx - 45, 1400],
    [tx - 70, 1660],
  ]);
  line(ctx, 14, [
    [tx + 45, 1400],
    [tx + 80, 1660],
  ]);
  shape(ctx, INK, 0, () => {
    ctx.ellipse(tx - 85, 1675, 46, 22, 0, 0, Math.PI * 2);
    ctx.ellipse(tx + 95, 1675, 46, 22, 0, 0, Math.PI * 2);
  });
  // sleeping middle passenger
  const mx = 540;
  shirt(ctx, mx, 1120, 200, 280, "#6c8f6a", 12);
  line(ctx, 14, [
    [mx - 60, 1240],
    [mx - 10, 1330],
    [mx + 50, 1320],
  ]);
  head(ctx, mx + 20, 1000, 115, "sleep", { hair: "curly", tilt: 0.35 });
  line(ctx, 14, [
    [mx - 40, 1400],
    [mx - 50, 1660],
  ]);
  line(ctx, 14, [
    [mx + 40, 1400],
    [mx + 50, 1660],
  ]);
  // empty aisle seat cushion
  shape(ctx, C.seatDark, 12, () => rrect(ctx, 735, 1400, 300, 130, 40));
  // armrests
  for (const x of [355, 700])
    shape(ctx, C.seatDark, 10, () => rrect(ctx, x, 1330, 45, 220, 18));
  return toBlob(c);
}

async function scene2(): Promise<Blob> {
  const [c, ctx] = newCanvas();
  cabinBackdrop(ctx, [{ x: 250, y: 560, s: 1.1 }]);
  ctx.fillStyle = C.floor;
  ctx.fillRect(0, 1650, VIDEO_W, 270);
  seatBack(ctx, 40, 860, 470, 900);
  // Teo seated, thumbs up
  const tx = 290;
  shirt(ctx, tx, 1120, 280, 420, C.mustard, 14);
  line(ctx, 16, [
    [tx + 110, 1190],
    [tx + 210, 1080],
    [tx + 230, 960],
  ]);
  hand(ctx, tx + 232, 935, 34, 12);
  line(ctx, 14, [
    [tx + 232, 905],
    [tx + 232, 855],
  ]);
  line(ctx, 16, [
    [tx - 110, 1190],
    [tx - 150, 1380],
    [tx - 60, 1440],
  ]);
  head(ctx, tx, 920, 175, "grin", { hair: "teo" });
  // Hoa, flight attendant
  const hx = 800;
  dress(ctx, hx, 830, 260, 760, 14);
  line(ctx, 14, [
    [hx - 30, 1590],
    [hx - 40, 1800],
  ]);
  line(ctx, 14, [
    [hx + 30, 1590],
    [hx + 40, 1800],
  ]);
  shape(ctx, INK, 0, () => {
    ctx.ellipse(hx - 55, 1810, 40, 18, 0, 0, Math.PI * 2);
    ctx.ellipse(hx + 55, 1810, 40, 18, 0, 0, Math.PI * 2);
  });
  head(ctx, hx, 660, 150, "smile", { hair: "hoa", lookX: -0.8 });
  // trays held out
  tray(ctx, 560, 1080, 230, 10, "chicken");
  tray(ctx, 780, 1150, 230, 10, "fish");
  line(ctx, 14, [
    [hx - 60, 900],
    [hx - 180, 1010],
    [hx - 230, 1090],
  ]);
  hand(ctx, 670, 1100, 26, 10);
  line(ctx, 14, [
    [hx + 60, 900],
    [hx + 120, 1050],
    [hx + 100, 1160],
  ]);
  hand(ctx, hx + 100, 1170, 26, 10);
  return toBlob(c);
}

async function scene3(): Promise<Blob> {
  const [c, ctx] = newCanvas();
  ctx.save();
  ctx.translate(540, 960);
  ctx.rotate(-0.12);
  ctx.translate(-540, -960);
  ctx.fillStyle = C.wall;
  ctx.fillRect(-300, -300, VIDEO_W + 600, VIDEO_H + 600);
  // stormy window
  shape(ctx, C.frame, 14, () => ctx.ellipse(820, 420, 200, 290, 0, 0, Math.PI * 2));
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(820, 420, 155, 240, 0, 0, Math.PI * 2);
  ctx.fillStyle = C.storm;
  ctx.fill();
  ctx.clip();
  shape(ctx, C.bolt, 8, () => {
    ctx.moveTo(840, 200);
    ctx.lineTo(760, 420);
    ctx.lineTo(830, 410);
    ctx.lineTo(780, 640);
    ctx.lineTo(900, 360);
    ctx.lineTo(830, 370);
    ctx.lineTo(880, 200);
    ctx.closePath();
  });
  ctx.restore();
  shape(ctx, null, 14, () => ctx.ellipse(820, 420, 155, 240, 0, 0, Math.PI * 2));
  ctx.restore();
  // motion lines
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 9; i++) {
    const y = 250 + i * 190;
    line(ctx, 10, [
      [i % 2 ? 20 : 60, y],
      [i % 2 ? 150 : 200, y + 20],
    ], "#e8e2d4");
    line(ctx, 10, [
      [VIDEO_W - (i % 2 ? 20 : 70), y + 60],
      [VIDEO_W - (i % 2 ? 160 : 210), y + 80],
    ], "#e8e2d4");
  }
  ctx.globalAlpha = 1;
  // Teo hugging trays
  shirt(ctx, 540, 1220, 520, 700, C.mustard, 16);
  tray(ctx, 300, 1420, 470, 14, "chicken");
  tray(ctx, 320, 1560, 450, 14, "fish");
  line(ctx, 20, [
    [300, 1300],
    [250, 1500],
    [480, 1640],
  ]);
  line(ctx, 20, [
    [780, 1300],
    [830, 1480],
    [620, 1640],
  ]);
  hand(ctx, 490, 1645, 40, 12);
  hand(ctx, 610, 1645, 40, 12);
  head(ctx, 540, 860, 300, "panic", { hair: "teo", tilt: 0.08 });
  sweat(ctx, 210, 640, 2.2);
  sweat(ctx, 880, 760, 1.8);
  sweat(ctx, 860, 560, 1.4);
  return toBlob(c);
}

async function scene4(): Promise<Blob> {
  const [c, ctx] = newCanvas();
  ctx.fillStyle = C.purple;
  ctx.fillRect(0, 0, VIDEO_W, VIDEO_H);
  // radial speed rays
  ctx.save();
  ctx.translate(540, 900);
  ctx.globalAlpha = 0.18;
  for (let i = 0; i < 24; i++) {
    ctx.rotate((Math.PI * 2) / 24);
    shape(ctx, "#ffffff", 0, () => {
      ctx.moveTo(0, 0);
      ctx.lineTo(-60, -1600);
      ctx.lineTo(60, -1600);
      ctx.closePath();
    });
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  shirt(ctx, 540, 1560, 900, 600, C.mustard, 18);
  head(ctx, 540, 920, 560, "deadpan", { hair: "teo" });
  sweat(ctx, 930, 520, 2.6);
  return toBlob(c);
}

async function scene5(): Promise<Blob> {
  const [c, ctx] = newCanvas();
  cabinBackdrop(ctx, [{ x: 160, y: 560, s: 0.9 }]);
  ctx.fillStyle = C.floor;
  ctx.fillRect(0, 1700, VIDEO_W, 220);
  // passengers in the row in front peeking back over seats, staring
  seatBack(ctx, 330, 420, 300, 420);
  seatBack(ctx, 680, 420, 300, 420);
  head(ctx, 480, 430, 110, "stare", { hair: "curly", lookX: -1, lookY: 0.6 });
  head(ctx, 830, 440, 105, "stare", { hair: "bald", lookX: -1.2, lookY: 0.8 });
  hand(ctx, 400, 480, 28, 10);
  hand(ctx, 920, 480, 28, 10);
  // Teo, full and happy, big belly, stacked empty trays
  seatBack(ctx, 60, 840, 560, 920);
  const tx = 340;
  shape(ctx, C.mustard, 16, () => ctx.ellipse(tx, 1390, 250, 260, 0, 0, Math.PI * 2));
  for (let i = 0; i < 4; i++) tray(ctx, tx - 210 + i * 6, 1560 - i * 52, 330, 10, i === 3 ? "bone" : "empty");
  line(ctx, 16, [
    [tx + 200, 1250],
    [tx + 300, 1380],
    [tx + 250, 1470],
  ]);
  hand(ctx, tx + 250, 1480, 32, 12);
  line(ctx, 16, [
    [tx - 200, 1250],
    [tx - 250, 1150],
    [tx - 170, 1020],
  ]);
  hand(ctx, tx - 170, 1010, 32, 12);
  head(ctx, tx, 1000, 180, "full", { hair: "teo", tilt: -0.12 });
  // Hoa, shocked, empty hands
  const hx = 870;
  dress(ctx, hx, 1120, 230, 620, 14);
  line(ctx, 14, [
    [hx - 50, 1180],
    [hx - 150, 1050],
  ]);
  line(ctx, 14, [
    [hx + 50, 1180],
    [hx + 140, 1040],
  ]);
  hand(ctx, hx - 155, 1040, 26, 10);
  hand(ctx, hx + 145, 1030, 26, 10);
  line(ctx, 14, [
    [hx - 30, 1740],
    [hx - 35, 1880],
  ]);
  line(ctx, 14, [
    [hx + 30, 1740],
    [hx + 35, 1880],
  ]);
  head(ctx, hx, 965, 135, "gasp", { hair: "hoa", lookX: -1 });
  return toBlob(c);
}

async function characterSheet(): Promise<Blob> {
  const [c, ctx] = newCanvas(1600, 1200);
  ctx.fillStyle = "#e9e4da";
  ctx.fillRect(0, 0, 1600, 1200);
  // Teo full body
  const tx = 330;
  shirt(ctx, tx, 470, 230, 300, C.mustard, 12);
  line(ctx, 14, [
    [tx - 95, 560],
    [tx - 160, 720],
  ]);
  line(ctx, 14, [
    [tx + 95, 560],
    [tx + 160, 720],
  ]);
  hand(ctx, tx - 162, 735, 26, 10);
  hand(ctx, tx + 162, 735, 26, 10);
  line(ctx, 14, [
    [tx - 45, 770],
    [tx - 70, 1010],
  ]);
  line(ctx, 14, [
    [tx + 45, 770],
    [tx + 70, 1010],
  ]);
  shape(ctx, INK, 0, () => {
    ctx.ellipse(tx - 90, 1020, 44, 20, 0, 0, Math.PI * 2);
    ctx.ellipse(tx + 90, 1020, 44, 20, 0, 0, Math.PI * 2);
  });
  head(ctx, tx, 330, 150, "smile", { hair: "teo" });
  // Hoa full body
  const hx = 1270;
  dress(ctx, hx, 470, 240, 470, 12);
  line(ctx, 14, [
    [hx - 60, 520],
    [hx - 140, 700],
  ]);
  line(ctx, 14, [
    [hx + 60, 520],
    [hx + 140, 700],
  ]);
  hand(ctx, hx - 142, 715, 26, 10);
  hand(ctx, hx + 142, 715, 26, 10);
  line(ctx, 14, [
    [hx - 30, 940],
    [hx - 35, 1030],
  ]);
  line(ctx, 14, [
    [hx + 30, 940],
    [hx + 35, 1030],
  ]);
  head(ctx, hx, 330, 140, "smile", { hair: "hoa" });
  // expression heads
  head(ctx, 650, 330, 95, "grin", { hair: "teo" });
  head(ctx, 920, 330, 95, "panic", { hair: "teo" });
  head(ctx, 650, 700, 95, "deadpan", { hair: "teo" });
  head(ctx, 920, 700, 95, "smug", { hair: "teo" });
  head(ctx, 785, 1010, 95, "full", { hair: "teo" });
  return toBlob(c);
}

/* ------------------------------ babble voice ------------------------------ */

const VOWELS: [number, number][] = [
  [800, 1200], // a
  [500, 1900], // e
  [300, 2300], // i
  [500, 900], // o
  [330, 800], // u
];

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

async function renderBabble(scenes: Scene[]): Promise<Blob> {
  const sr = 22050;
  const total = scenes.reduce((a, s) => a + s.duration, 0);
  const ctx = new OfflineAudioContext(1, Math.ceil(total * sr), sr);
  const comp = ctx.createDynamicsCompressor();
  comp.connect(ctx.destination);
  let t0 = 0;
  for (const s of scenes) {
    const words = s.narration.split(/\s+/).filter(Boolean);
    const avail = s.duration - 0.55;
    const per = Math.min(0.34, avail / Math.max(1, words.length));
    let t = t0 + 0.2;
    words.forEach((w, wi) => {
      const h = hash(w + wi);
      const syl = Math.min(2, Math.max(1, Math.round(w.length / 4)));
      const sd = (per * 0.82) / syl;
      const question = /\?$/.test(w);
      const excl = /!$/.test(w);
      for (let k = 0; k < syl; k++) {
        const st = t + k * sd;
        const base = 175 + h * 70 + (excl ? 50 : 0);
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(base * (1 + (k % 2) * 0.06), st);
        osc.frequency.linearRampToValueAtTime(base * (question ? 1.35 : 0.92), st + sd);
        const [f1, f2] = VOWELS[Math.floor(hash(w + k) * VOWELS.length) % VOWELS.length];
        const b1 = ctx.createBiquadFilter();
        b1.type = "bandpass";
        b1.frequency.value = f1;
        b1.Q.value = 6;
        const b2 = ctx.createBiquadFilter();
        b2.type = "bandpass";
        b2.frequency.value = f2;
        b2.Q.value = 9;
        const env = ctx.createGain();
        env.gain.setValueAtTime(0, st);
        env.gain.linearRampToValueAtTime(0.9, st + 0.015);
        env.gain.setValueAtTime(0.75, st + sd * 0.6);
        env.gain.linearRampToValueAtTime(0, st + sd * 0.95);
        osc.connect(b1).connect(env);
        osc.connect(b2).connect(env);
        env.connect(comp);
        osc.start(st);
        osc.stop(st + sd);
      }
      t += per + (/[,.:!?]$/.test(w) ? 0.12 : 0);
    });
    t0 += s.duration;
  }
  const buf = await ctx.startRendering();
  // normalise
  const d = buf.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  if (peak > 0) for (let i = 0; i < d.length; i++) d[i] = (d[i] / peak) * 0.8;
  return audioBufferToWav(buf);
}

/* ------------------------------ project ------------------------------ */

export const DEMO_CHARACTERS: Character[] = [
  {
    name: "Tèo",
    description:
      "round pure-white head as wide as his shoulders, three short black spiky hair strands on top, huge round cartoon eyes with small black pupils, thin black stick arms and legs with round white hands, mustard-yellow short-sleeve t-shirt, goofy confident vibe",
  },
  {
    name: "Chị Hoa (tiếp viên)",
    description:
      "flight attendant with round pure-white head, black hair in a neat bun, small navy-blue pillbox cap, large eyes with long lashes, navy-blue A-line uniform dress, red neck scarf, thin black stick arms and legs",
  },
];

const DEMO_SCENES: (Omit<Scene, "imagePrompt"> & { prompt: string })[] = [
  {
    id: 1,
    duration: 6,
    narration: "Tèo lần đầu đi máy bay, chọn ngay ghế cạnh cửa sổ, ngả lưng tự tin như cơ trưởng.",
    shotType: "wide",
    cameraEffect: "slow_zoom",
    sfx: "whoosh",
    prompt:
      "Wide frontal shot of an airplane cabin row with oval windows and overhead bins, Tèo sits in the window seat with both hands behind his head and a smug half-lidded smirk, a curly-haired passenger sleeps in the middle seat, empty aisle seat",
  },
  {
    id: 2,
    duration: 6.5,
    narration: "Tiếp viên hỏi anh dùng gà hay cá. Tèo đáp: cho em cả hai, vé đắt lắm đó!",
    shotType: "medium",
    cameraEffect: "punch_zoom_in",
    sfx: "pop",
    prompt:
      "Medium shot inside airplane cabin, Chị Hoa the flight attendant offers two meal trays (chicken drumstick and fish), Tèo seated grins widely with eyes squeezed shut and gives a big thumbs up",
  },
  {
    id: 3,
    duration: 5.5,
    narration: "Bỗng máy bay rung lắc dữ dội. Tèo ôm chặt hai suất ăn như ôm cả gia tài.",
    shotType: "close_up",
    cameraEffect: "dramatic_shake",
    sfx: "record_scratch",
    prompt:
      "Dutch-angle close-up of Tèo in total panic hugging two meal trays to his chest, huge eyes with tiny pupils, wavy screaming mouth, sweat drops flying, stormy window with lightning behind him, motion lines",
  },
  {
    id: 4,
    duration: 6,
    narration: "Loa vang lên: xin lỗi quý khách, vừa rồi chỉ là cơ trưởng hắt hơi.",
    shotType: "extreme_close_up",
    cameraEffect: "freeze_grayscale",
    sfx: "vine_boom",
    prompt:
      "Extreme close-up of Tèo's face filling the frame, deadpan stunned expression, enormous eyes with pin-point pupils, flat straight mouth, single sweat drop, muted purple background with radial speed rays",
  },
  {
    id: 5,
    duration: 6.5,
    narration: "Cả khoang thở phào. Quay sang thì Tèo đã ăn sạch bốn suất, kể cả suất của người bên cạnh.",
    shotType: "medium",
    cameraEffect: "flash_cut",
    sfx: "cricket",
    prompt:
      "Medium shot, Tèo leans back blissfully with a huge round belly, eyes closed, crumbs on his face, a tall stack of four empty meal trays with a chicken bone on his lap, two passengers peek over the seats staring at him, Chị Hoa gasps with empty hands",
  },
];

export async function buildDemoProject(): Promise<{ project: Project; blobs: Record<string, Blob> }> {
  const painters = [scene1, scene2, scene3, scene4, scene5];
  const scenes: Scene[] = DEMO_SCENES.map((s) => {
    const { prompt, ...rest } = s;
    return { ...rest, imagePrompt: `${prompt}, ${STYLE_LOCK}` };
  });
  const blobs: Record<string, Blob> = {};
  const sceneAssets: Record<string, AssetRef> = {};
  for (let i = 0; i < painters.length; i++) {
    const b = await painters[i]();
    const key = uid("demo_");
    blobs[key] = b;
    sceneAssets[String(scenes[i].id)] = { key, kind: "image", mime: "image/png", name: `demo-${String(i + 1).padStart(2, "0")}.png` };
  }
  const sheet = await characterSheet();
  const sheetKey = uid("demo_");
  blobs[sheetKey] = sheet;
  const voice = await renderBabble(scenes);
  const voiceKey = uid("demo_");
  blobs[voiceKey] = voice;
  const now = Date.now();
  const project: Project = {
    id: uid("p_"),
    name: "Demo – Chuyến bay định mệnh",
    createdAt: now,
    updatedAt: now,
    script: {
      title: "Chuyến bay định mệnh",
      topic: "Lần đầu đi máy bay, Tèo gọi cả gà lẫn cá rồi gặp sự cố rung lắc",
      language: "vi",
      targetDuration: 30,
      voiceoverScript: scenes.map((s) => s.narration).join(" "),
      characters: DEMO_CHARACTERS,
      scenes,
    },
    sceneAssets,
    characterRefs: [{ key: sheetKey, kind: "image", mime: "image/png", name: "teo-hoa-character-sheet.png" }],
    voiceover: { key: voiceKey, kind: "audio", mime: "audio/wav", name: "giong-demo-bap-be (khong phai giong that).wav" },
    customSfx: {},
    captions: { ...DEFAULT_CAPTIONS },
  };
  return { project, blobs };
}

/** Drawing kit shared with other built-in stories. */
export const kit = { INK, HEAD, C, newCanvas, toBlob, shape, rrect, line, cloud, sweat, head, hand, shirt, dress };
export type KitCtx = Ctx;
export type KitExpr = Expr;
