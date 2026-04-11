"use client";

const BG = "#0a0a0a";
const ACCENT = "#e8ff47";
const TEXT = "#f0f0f0";
const MUTED = "#666666";
const DIVIDER = "#1f1f1f";

const BEBAS = 'Impact, "Arial Narrow", "Arial Black", sans-serif';
const MONO = '"Courier New", ui-monospace, Menlo, monospace';

async function ready(): Promise<void> {
  try {
    if (typeof document !== "undefined" && document.fonts?.ready) {
      await document.fonts.ready;
    }
  } catch {}
}

function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);
  ctx.textBaseline = "alphabetic";
  return { canvas, ctx };
}

function drawBrandTop(ctx: CanvasRenderingContext2D, week: number, w: number) {
  // 1080×80 top bar — matches brand spec
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, 80);

  const y = 60;
  ctx.font = `900 56px ${BEBAS}`;
  ctx.textAlign = "left";
  ctx.fillStyle = TEXT;
  ctx.fillText("R2", 48, y);
  ctx.fillStyle = ACCENT;
  ctx.fillText("·", 122, y);
  ctx.fillStyle = TEXT;
  ctx.fillText("FIT", 140, y);

  ctx.font = `13px ${MONO}`;
  ctx.fillStyle = MUTED;
  ctx.textAlign = "right";
  const label = `WK ${week} / 12`;
  // Approx letter-spacing: 2px per char
  ctx.save();
  let cursor = w - 48;
  for (let i = label.length - 1; i >= 0; i--) {
    const ch = label[i];
    const mw = ctx.measureText(ch).width + 2;
    ctx.fillText(ch, cursor, y);
    cursor -= mw;
  }
  ctx.restore();
}

function drawAccentLine(ctx: CanvasRenderingContext2D, y: number, w: number) {
  ctx.fillStyle = ACCENT;
  ctx.fillRect(80, y, w - 160, 4);
}

function drawBrandBottom(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // Matches 220×70 brand lockup (68px Impact 900)
  // Positioned bottom-right with 48px right margin, 40px bottom margin
  const y = h - 40;
  ctx.font = `900 68px ${BEBAS}`;
  ctx.textAlign = "left";

  // Mirror the exact x-offsets from the SVG (R2=0, ·=94, FIT=110) scaled against right edge
  const totalW = 220;
  const xLeft = w - 48 - totalW;
  ctx.fillStyle = TEXT;
  ctx.fillText("R2", xLeft, y);
  ctx.fillStyle = ACCENT;
  ctx.fillText("·", xLeft + 94, y);
  ctx.fillStyle = TEXT;
  ctx.fillText("FIT", xLeft + 110, y);
}

function drawFooter(ctx: CanvasRenderingContext2D, text: string, w: number, h: number) {
  ctx.fillStyle = MUTED;
  ctx.font = `22px ${MONO}`;
  ctx.textAlign = "left";
  ctx.fillText(text, 80, h - 70);
}

// ==================== Card 1: Post workout ====================

export type WorkoutCardData = {
  sessionName: string;
  sessionType: "push" | "pull" | "legs" | "other";
  isPR: boolean;
  prCount: number;
  volumeKg: number;
  durationMin: number;
  exerciseCount: number;
  week: number;
  dateLine: string;
};

function workoutTagline(d: WorkoutCardData): string {
  if (d.isPR) return "NEW PERSONAL RECORD.";
  if (d.sessionType === "push") return "CHEST AND SHOULDERS. DONE.";
  if (d.sessionType === "pull") return "BACK AND BICEPS. DONE.";
  if (d.sessionType === "legs") return "LEGS. ALWAYS LEGS.";
  return `${d.sessionName}. DONE.`;
}

export async function renderWorkoutCard(d: WorkoutCardData): Promise<Blob> {
  await ready();
  const W = 1080;
  const H = 1080;
  const { canvas, ctx } = makeCanvas(W, H);

  drawBrandTop(ctx, d.week, W);

  // Session name huge
  ctx.fillStyle = TEXT;
  ctx.font = `160px ${BEBAS}`;
  ctx.textAlign = "left";
  ctx.fillText(d.sessionName.toUpperCase(), 80, 340);
  ctx.fillText("DONE.", 80, 490);

  drawAccentLine(ctx, 540, W);

  // Two-column metrics
  ctx.fillStyle = ACCENT;
  ctx.font = `110px ${BEBAS}`;
  ctx.textAlign = "left";
  ctx.fillText(d.volumeKg.toLocaleString() + " KG", 80, 690);

  ctx.fillStyle = TEXT;
  ctx.fillText(`${d.durationMin} MIN`, 600, 690);

  ctx.fillStyle = MUTED;
  ctx.font = `22px ${MONO}`;
  ctx.fillText("TOTAL VOLUME", 80, 720);
  ctx.fillText("SESSION", 600, 720);

  // Tagline / meta
  ctx.fillStyle = TEXT;
  ctx.font = `34px ${BEBAS}`;
  ctx.fillText(workoutTagline(d), 80, 820);

  ctx.fillStyle = MUTED;
  ctx.font = `22px ${MONO}`;
  ctx.fillText(`${d.exerciseCount} EXERCISES COMPLETED`, 80, 860);
  if (d.prCount > 0) {
    ctx.fillStyle = ACCENT;
    ctx.fillText(`PROGRESSIVE OVERLOAD: +${d.prCount}`, 80, 892);
  }

  drawFooter(ctx, d.dateLine, W, H);
  drawBrandBottom(ctx, W, H);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
  });
}

// ==================== Card 2: Daily nutrition ====================

export type NutritionCardData = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  proteinTarget: number;
  kcalTarget: number;
  mealsLogged: number;
  week: number;
  dateLine: string;
  gymDay: boolean;
};

function nutritionTagline(d: NutritionCardData): string {
  const proteinHit = d.protein >= d.proteinTarget;
  const kcalHit = d.kcal >= d.kcalTarget * 0.9 && d.kcal <= d.kcalTarget * 1.1;
  if (proteinHit && kcalHit && d.gymDay) return "FED. TRAINED. RECOVERED.";
  if (proteinHit && kcalHit) return "DIALED IN.";
  if (proteinHit) return "PROTEIN. NEVER NEGOTIABLE.";
  if (kcalHit) return "MACROS ON POINT.";
  return "LOCKED IN.";
}

export async function renderNutritionCard(d: NutritionCardData): Promise<Blob> {
  await ready();
  const W = 1080;
  const H = 1080;
  const { canvas, ctx } = makeCanvas(W, H);

  drawBrandTop(ctx, d.week, W);

  // Giant kcal
  ctx.fillStyle = ACCENT;
  ctx.font = `260px ${BEBAS}`;
  ctx.textAlign = "left";
  ctx.fillText(Math.round(d.kcal).toLocaleString(), 80, 380);

  ctx.fillStyle = TEXT;
  ctx.font = `70px ${BEBAS}`;
  ctx.fillText("KCAL", 80, 450);

  ctx.fillStyle = TEXT;
  ctx.font = `54px ${BEBAS}`;
  ctx.fillText(nutritionTagline(d), 80, 520);

  drawAccentLine(ctx, 570, W);

  // 3-column macros
  ctx.fillStyle = MUTED;
  ctx.font = `24px ${MONO}`;
  ctx.textAlign = "left";
  ctx.fillText("PROTEIN", 80, 660);
  ctx.fillText("CARBS", 450, 660);
  ctx.fillText("FAT", 780, 660);

  ctx.fillStyle = TEXT;
  ctx.font = `90px ${BEBAS}`;
  ctx.fillText(`${Math.round(d.protein)}G`, 80, 750);
  ctx.fillText(`${Math.round(d.carbs)}G`, 450, 750);
  ctx.fillText(`${Math.round(d.fat)}G`, 780, 750);

  // Summary
  ctx.fillStyle = MUTED;
  ctx.font = `24px ${MONO}`;
  ctx.fillText(`${d.mealsLogged} MEALS · ALL LOGGED`, 80, 830);
  const proteinOk = d.protein >= d.proteinTarget;
  ctx.fillStyle = proteinOk ? ACCENT : MUTED;
  ctx.fillText(
    `${Math.round(d.proteinTarget)}G PROTEIN TARGET ${proteinOk ? "HIT ✓" : "MISSED"}`,
    80,
    864
  );

  drawFooter(ctx, d.dateLine, W, H);
  drawBrandBottom(ctx, W, H);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
  });
}

// ==================== Card 3: Weekly progress (portrait) ====================

export type WeeklyCardData = {
  week: number;
  sessionsDone: number;
  sessionsTarget: number;
  avgKcal: number;
  avgProtein: number;
  bestLiftName: string;
  bestLiftDetail: string;
  weeksToGo: number;
  dateRange: string;
};

export async function renderWeeklyCard(d: WeeklyCardData): Promise<Blob> {
  await ready();
  const W = 1080;
  const H = 1350;
  const { canvas, ctx } = makeCanvas(W, H);

  drawBrandTop(ctx, d.week, W);

  ctx.fillStyle = TEXT;
  ctx.font = `170px ${BEBAS}`;
  ctx.textAlign = "left";
  ctx.fillText(`WEEK ${d.week}`, 80, 360);
  ctx.fillText("IN THE BOOKS.", 80, 520);

  drawAccentLine(ctx, 580, W);

  // Stats columns
  ctx.fillStyle = MUTED;
  ctx.font = `24px ${MONO}`;
  ctx.fillText("SESSIONS", 80, 680);
  ctx.fillText("AVG KCAL", 430, 680);
  ctx.fillText("AVG P", 780, 680);

  ctx.fillStyle = TEXT;
  ctx.font = `90px ${BEBAS}`;
  ctx.fillText(`${d.sessionsDone}/${d.sessionsTarget}`, 80, 770);
  ctx.fillText(d.avgKcal.toLocaleString(), 430, 770);
  ctx.fillText(`${Math.round(d.avgProtein)}G`, 780, 770);

  // Divider
  ctx.fillStyle = DIVIDER;
  ctx.fillRect(80, 830, W - 160, 2);

  // Best lift
  ctx.fillStyle = MUTED;
  ctx.font = `24px ${MONO}`;
  ctx.fillText("BEST LIFT THIS WEEK", 80, 900);
  ctx.fillStyle = TEXT;
  ctx.font = `72px ${BEBAS}`;
  ctx.fillText(d.bestLiftName.toUpperCase(), 80, 975);
  ctx.fillStyle = ACCENT;
  ctx.fillText(d.bestLiftDetail.toUpperCase(), 80, 1045);

  ctx.fillStyle = DIVIDER;
  ctx.fillRect(80, 1090, W - 160, 2);

  // Motivational
  ctx.fillStyle = TEXT;
  ctx.font = `72px ${BEBAS}`;
  ctx.fillText(`${d.weeksToGo} WEEKS TO GO.`, 80, 1165);
  ctx.fillStyle = ACCENT;
  ctx.fillText("KEEP THE STANDARD.", 80, 1230);

  drawFooter(ctx, d.dateRange, W, H);
  drawBrandBottom(ctx, W, H);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
  });
}

// ==================== Share helpers ====================

export async function shareBlob(blob: Blob, filename: string, text?: string): Promise<void> {
  const file = new File([blob], filename, { type: "image/png" });
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean;
    share?: (data: ShareData) => Promise<void>;
  };
  if (nav.share && nav.canShare && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], text });
      return;
    } catch (err) {
      const e = err as DOMException;
      if (e.name === "AbortError") return;
    }
  }
  // Fallback: trigger download
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
