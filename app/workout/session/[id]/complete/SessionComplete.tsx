"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getAllWorkouts,
  getDefForWorkout,
  getWorkout,
  saveCustomTemplate,
  templateDraftFromWorkout,
  workoutVolume,
  type SessionDef,
  type SetLog,
  type WorkoutSession,
} from "@/lib/workouts";
import type { MuscleKey } from "@/lib/muscles";
import { getSettings } from "@/lib/settings";
import { renderWorkoutCard, shareBlob } from "@/lib/shareCards";
import {
  celebrationDiff,
  hasChanges,
  type Celebration,
} from "@/lib/motivation";
import { readSnapshot, takeBefore } from "@/lib/motivationData";
import { useSheetBack } from "@/lib/backSheet";
import { readBodyKg, workoutBurn } from "@/lib/burnData";
import { dayTarget } from "@/lib/dayBudgetData";
import ProgressCelebration from "../../../../_motion/ProgressCelebration";
import { toast } from "../../../../Toast";
import Icon from "../../../../ui/Icon";
import "../../../summary-calm.css";

const MUSCLE_ID: Record<MuscleKey, string> = {
  chest: "Dada",
  frontDelt: "Bahu depan",
  sideDelt: "Bahu samping",
  rearDelt: "Bahu belakang",
  tricep: "Trisep",
  bicep: "Bisep",
  lats: "Punggung (lat)",
  midBack: "Punggung tengah",
  traps: "Trapezius",
  quad: "Paha depan",
  hamstring: "Paha belakang",
  glute: "Bokong",
  calf: "Betis",
  abs: "Perut",
};

const nf = (n: number, digits = 1) =>
  n.toLocaleString("id-ID", { maximumFractionDigits: digits });
const kcalText = (n: number) => `≈ ${Math.round(n).toLocaleString("id-ID")} kkal`;
const riseStyle = (i: number) => ({ ["--i" as string]: i }) as CSSProperties;

/** "BESARIN DADA" becomes "Besarin dada"; a name someone typed is left alone. */
function niceName(raw: string): string {
  if (!raw || raw !== raw.toLocaleUpperCase("id-ID")) return raw;
  const lower = raw.toLocaleLowerCase("id-ID");
  return lower.charAt(0).toLocaleUpperCase("id-ID") + lower.slice(1);
}

/** A session's date is stored as YYYY-MM-DD; read it as that day, not as a
 *  moment in this phone's time zone. */
function dateLabel(date: string, fallback: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const when = y && m && d ? new Date(Date.UTC(y, m - 1, d, 12)) : new Date(fallback);
  return when.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function durationParts(min?: number): { value: string; unit: string } {
  if (!min || min <= 0) return { value: "—", unit: "" };
  if (min < 60) return { value: String(min), unit: "mnt" };
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? { value: `${h} j ${m}`, unit: "mnt" } : { value: String(h), unit: "jam" };
}

const fmtSet = (s: { weight: number; reps: number }) =>
  s.weight > 0 ? `${nf(s.weight)} kg × ${s.reps}` : `${s.reps} kali`;

function setsLine(sets: SetLog[]): string {
  const same = sets.every(
    (s) => s.weight === sets[0].weight && s.reps === sets[0].reps,
  );
  return same
    ? `${sets.length} set × ${fmtSet(sets[0])}`
    : `${sets.length} set: ${sets.map(fmtSet).join(", ")}`;
}

/** How good a set was: weight times reps, or reps alone for bodyweight. */
const setScore = (s: { weight: number; reps: number }) =>
  (s.weight > 0 ? s.weight : 1) * s.reps;
const best = <T extends { weight: number; reps: number }>(sets: T[]) =>
  sets.reduce((a, b) => (setScore(b) > setScore(a) ? b : a));

/** Week of the 12-week block, kept between 1 and 12 for the share image. */
function blockWeek(started: Date): number {
  const start = new Date(`${getSettings().startDate}T00:00:00`);
  const w = Math.floor((started.getTime() - start.getTime()) / (7 * 86_400_000)) + 1;
  return Math.min(12, Math.max(1, Number.isFinite(w) ? w : 1));
}

type Row = {
  name: string;
  sets: SetLog[];
  kcal: number | null;
  record: { now: SetLog; before: SetLog } | null;
};

export default function SessionComplete({ workoutId }: { workoutId: string }) {
  const [workout, setWorkout] = useState<WorkoutSession | null>(null);
  const [earlier, setEarlier] = useState<WorkoutSession[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [sharing, setSharing] = useState(false);
  // Save-as-session: a freestyle workout is otherwise a one-off. Prefilled
  // with the machines you actually did; renameable before saving.
  const [saveName, setSaveName] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // Only right after "Selesai" in the logger: the logger left the numbers
  // from before this session. Opening an old summary shows no celebration.
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const closeCelebration = useCallback(() => setCelebration(null), []);
  useSheetBack(!!celebration, closeCelebration);

  useEffect(() => {
    const w = getWorkout(workoutId);
    setWorkout(w);
    if (w) {
      // Only sessions before this one can hold a record this one beat.
      setEarlier(
        getAllWorkouts().filter(
          (x) => x.id !== w.id && x.completed && x.startedAt < w.startedAt,
        ),
      );
      try {
        setSaveName(templateDraftFromWorkout(w).name);
      } catch {}
    }
    const hasSets = !!w?.exercises.some((e) => e.sets.some((s) => s.reps > 0));
    const before = takeBefore(workoutId);
    // No celebration for a session without a single set.
    if (before && w?.completed && hasSets) {
      try {
        const c = celebrationDiff(before, readSnapshot(), "workout");
        if (hasChanges(c)) setCelebration(c);
      } catch {}
    }
    setLoaded(true);
  }, [workoutId]);

  // A session whose type no longer exists still gets a summary from its logs.
  const def = useMemo<SessionDef | null>(() => {
    if (!workout) return null;
    try {
      return getDefForWorkout(workout);
    } catch {
      return null;
    }
  }, [workout]);

  const summary = useMemo(() => {
    if (!workout) return null;
    let burn: ReturnType<typeof workoutBurn> | null = null;
    let kg = 0;
    try {
      kg = readBodyKg();
      burn = workoutBurn(workout, kg);
    } catch {}

    const rows: Row[] = [];
    const notLogged: string[] = [];
    const muscle = new Map<MuscleKey, number>();
    let burnAt = 0;
    workout.exercises.forEach((log, i) => {
      const planned = def?.exercises[i];
      const baseName = planned?.name ?? log.exerciseName;
      const name = log.swappedTo || baseName;
      const sets = log.sets.filter((s) => s.reps > 0);
      if (sets.length === 0) {
        notLogged.push(name);
        return;
      }
      // The burn list holds the same exercises in the same order.
      let kcal: number | null = null;
      if (!log.skipped) {
        const b = burn?.perExercise[burnAt++];
        if (b && b.sets === sets.length) kcal = b.kcal;
      }
      // A record: the best set beat everything done before in this exercise.
      let record: Row["record"] = null;
      const now = best(sets);
      let before: SetLog | null = null;
      for (const w of earlier) {
        for (const e of w.exercises) {
          if ((e.swappedTo || e.exerciseName) !== name) continue;
          const done = e.sets.filter((s) => s.reps > 0);
          if (done.length === 0) continue;
          const b = best(done);
          if (!before || setScore(b) > setScore(before)) before = b;
        }
      }
      if (before && setScore(now) > setScore(before)) record = { now, before };
      rows.push({ name, sets, kcal, record });
      if (planned) {
        for (const m of planned.primary) muscle.set(m, (muscle.get(m) ?? 0) + sets.length);
        for (const m of planned.secondary)
          muscle.set(m, (muscle.get(m) ?? 0) + sets.length * 0.5);
      }
    });

    const top = Array.from(muscle.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const max = top[0]?.[1] ?? 1;
    const muscles = top.map(([m, v]) => ({
      name: MUSCLE_ID[m],
      sets: v,
      pct: Math.max(0.08, v / max),
    }));

    const setsLogged = rows.reduce((a, r) => a + r.sets.length, 0);
    const volume = workoutVolume(workout) || workout.totalVolume || 0;
    const records = rows.filter((r) => r.record).length;
    const hasBaseline = earlier.some((w) => w.exercises.some((e) => e.sets.length > 0));
    return { rows, notLogged, muscles, setsLogged, volume, records, hasBaseline, burn, kg };
  }, [workout, def, earlier]);

  // What this day's training does to the eating target (lib/dayBudget).
  const eat = useMemo(() => {
    if (!workout) return null;
    try {
      return dayTarget(workout.date);
    } catch {
      return null;
    }
  }, [workout]);

  async function handleShare() {
    if (!workout || !summary || sharing) return;
    setSharing(true);
    try {
      const started = new Date(workout.startedAt);
      const title = niceName(
        workout.sessionType === "CUSTOM"
          ? workout.customName || "Catat bebas"
          : (def?.name ?? "Latihan"),
      );
      const lower = title.toLowerCase();
      const sessionType = lower.includes("push")
        ? "push"
        : lower.includes("pull")
          ? "pull"
          : lower.includes("kaki") || lower.includes("leg")
            ? "legs"
            : "other";
      const dateLine =
        started
          .toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" })
          .toUpperCase() + " · HANGZHOU";
      const blob = await renderWorkoutCard({
        sessionName: title,
        sessionType,
        isPR: summary.records > 0,
        prCount: summary.records,
        volumeKg: Math.round(summary.volume),
        durationMin: workout.durationMin ?? 0,
        exerciseCount: summary.rows.length,
        week: blockWeek(started),
        dateLine,
      });
      await shareBlob(blob, `r2fit-${title.replace(/\s+/g, "-").toLowerCase()}.png`, `${title} selesai.`);
    } catch {
      toast("Gambar belum bisa dibuat. Coba lagi.", "error");
    } finally {
      setSharing(false);
    }
  }

  function saveAsSession() {
    if (!workout) return;
    const draft = templateDraftFromWorkout(workout);
    saveCustomTemplate({ ...draft, name: (saveName ?? "").trim() || draft.name });
    setSaved(true);
  }

  if (!loaded) {
    return (
      <main className="lt-sum" aria-busy="true">
        <p className="lt-sum-date" role="status">
          Memuat ringkasan…
        </p>
      </main>
    );
  }

  if (!workout || !summary) {
    return (
      <main className="lt-sum">
        <div className="lt-sum-top">
          <Link href="/workout" className="lt-sum-close" aria-label="Tutup ringkasan">
            <Icon name="close" size={22} />
          </Link>
        </div>
        <h1>Sesi tidak ditemukan</h1>
        <p className="lt-sum-date">
          Sesi ini tidak ada di perangkat ini. Mungkin sudah dihapus.
        </p>
        <div className="lt-sum-actions">
          <Link href="/workout" className="lt-sum-btn primary">
            Kembali ke Latihan
          </Link>
        </div>
      </main>
    );
  }

  const title = niceName(
    workout.sessionType === "CUSTOM"
      ? workout.customName || "Catat bebas"
      : (def?.name ?? "Latihan"),
  );
  const hasSets = summary.setsLogged > 0;
  const duration = durationParts(workout.durationMin);
  const burn = summary.burn;
  const burnTotal = burn ? burn.total : 0;
  let n = 0;

  return (
    <main className="lt-sum">
      {celebration && (
        <ProgressCelebration
          c={celebration}
          title="Latihan selesai"
          onClose={closeCelebration}
        />
      )}

      <div className="lt-sum-top">
        <Link href="/workout" className="lt-sum-close" aria-label="Tutup ringkasan">
          <Icon name="close" size={22} />
        </Link>
        {hasSets && workout.completed ? (
          <span className="lt-sum-status done">
            <Icon name="check" size={16} />
            Sesi selesai
          </span>
        ) : (
          <span className="lt-sum-status">
            {hasSets ? "Belum diselesaikan" : "Belum ada set"}
          </span>
        )}
      </div>

      <header className="lt-sum-rise" style={riseStyle(n++)}>
        <h1>{title}</h1>
        <p className="lt-sum-date">{dateLabel(workout.date, workout.startedAt)}</p>
      </header>

      {!hasSets ? (
        <section className="lt-sum-card lt-sum-rise" style={riseStyle(n++)} aria-labelledby="lt-sum-empty">
          <h2 id="lt-sum-empty">Belum ada set tercatat</h2>
          <p>
            {workout.completed
              ? "Sesi ini ditutup tanpa satu set pun, jadi belum ada volume, kalori, atau rekor untuk ditampilkan."
              : "Sesi ini belum punya satu set pun, jadi belum ada volume, kalori, atau rekor untuk ditampilkan. Lanjutkan sesi untuk mencatat set."}
          </p>
        </section>
      ) : (
        <>
          <dl className="lt-sum-stats lt-sum-rise" style={riseStyle(n++)}>
            <div>
              <dt>Durasi</dt>
              <dd>
                {duration.value}
                {duration.unit && <small>{duration.unit}</small>}
              </dd>
            </div>
            <div>
              <dt>Total volume</dt>
              <dd>
                {nf(summary.volume, 0)}
                <small>kg</small>
              </dd>
            </div>
            <div>
              <dt>Set selesai</dt>
              <dd>{summary.setsLogged}</dd>
            </div>
            <div className={summary.records > 0 ? "record" : undefined}>
              <dt>Rekor baru</dt>
              <dd>{summary.records}</dd>
            </div>
          </dl>
          {!summary.hasBaseline && (
            <p className="lt-sum-hint">
              Rekor baru muncul setelah ada catatan sebelumnya untuk gerakan yang sama.
            </p>
          )}

          <section
            className="lt-sum-card lt-sum-rise"
            style={riseStyle(n++)}
            aria-labelledby="lt-sum-rows"
          >
            <h2 id="lt-sum-rows">Rincian latihan</h2>
            <ul className="lt-sum-rows">
              {summary.rows.map((r, i) => (
                <li key={`${r.name}-${i}`} className="lt-sum-row">
                  <strong>{r.name}</strong>
                  <span className="lt-sum-kcal">{r.kcal !== null ? kcalText(r.kcal) : ""}</span>
                  <p className="lt-sum-detail">{setsLine(r.sets)}</p>
                  {r.record && (
                    <p className="lt-sum-record">
                      Rekor baru: {fmtSet(r.record.now)} (sebelumnya {fmtSet(r.record.before)})
                    </p>
                  )}
                </li>
              ))}
            </ul>
            {summary.notLogged.length > 0 && (
              <p className="lt-sum-skipped">
                {workout.completed ? "Tidak dicatat" : "Belum dicatat"}:{" "}
                {summary.notLogged.join(", ")}
              </p>
            )}
            {burn && burnTotal > 0 && (
              <>
                <p className="lt-sum-total" aria-label="Kalori aktif terbakar">
                  <span>Kalori aktif terbakar</span>
                  <span>{kcalText(burnTotal)}</span>
                </p>
                <p className="lt-sum-note">
                  Perkiraan dari jumlah set, otot yang dilatih dan berat badanmu (
                  {nf(summary.kg)} kg), bisa meleset sekitar 20–30%. Sudah masuk ke
                  &quot;Hari ini&quot; di Latihan.
                </p>
                {eat && eat.eatBack > 0 && (
                  <>
                    <h3 className="lt-sum-sub">Target makan hari ini</h3>
                    <p className="lt-sum-note lt-sum-eat">
                      {eat.bonusKcal > 0
                        ? `+${eat.bonusKcal.toLocaleString("id-ID")} kkal ditambahkan ke target makan (jadi ${Math.round(eat.target.kcal).toLocaleString("id-ID")} kkal)`
                        : "Target makan hari latihan sudah termasuk kalori latihan seperti ini"}
                    </p>
                  </>
                )}
              </>
            )}
          </section>

          {summary.muscles.length > 0 && (
            <section
              className="lt-sum-card lt-sum-rise"
              style={riseStyle(n++)}
              aria-labelledby="lt-sum-muscles"
            >
              <h2 id="lt-sum-muscles">Otot yang dilatih</h2>
              <ul className="lt-sum-muscles">
                {summary.muscles.map((m, i) => (
                  <li key={m.name}>
                    <span>{m.name}</span>
                    <span className="lt-sum-bar" aria-hidden="true">
                      <span style={{ ["--p" as string]: m.pct, ["--i" as string]: i } as CSSProperties} />
                    </span>
                    <span className="lt-sum-vh">{nf(m.sets)} set</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {workout.completed && (
            <section
              className="lt-sum-card lt-sum-rise"
              style={riseStyle(n++)}
              aria-labelledby="lt-sum-save"
            >
              {saved ? (
                <>
                  <p className="lt-sum-saved" role="status">
                    <Icon name="check" size={18} />
                    Tersimpan di Sesi saya
                  </p>
                  <p>Buka Latihan, lalu ketuk sesinya untuk mengulang kapan saja.</p>
                </>
              ) : (
                <>
                  <h2 id="lt-sum-save">Simpan jadi sesi</h2>
                  <p>Simpan alat, jumlah set dan repetisi tadi, biar bisa diulang kapan saja.</p>
                  <label className="lt-sum-field">
                    Nama sesi
                    <input
                      type="text"
                      value={saveName ?? ""}
                      maxLength={60}
                      onChange={(e) => setSaveName(e.target.value)}
                      onFocus={(e) => e.currentTarget.select()}
                      placeholder="Kasih nama sesi ini"
                      autoComplete="off"
                    />
                  </label>
                  <button type="button" className="lt-sum-btn slim" onClick={saveAsSession}>
                    Simpan sesi
                  </button>
                </>
              )}
            </section>
          )}
        </>
      )}

      <div className="lt-sum-actions lt-sum-rise" style={riseStyle(n++)}>
        {workout.completed ? (
          <Link href="/workout" className="lt-sum-btn primary">
            {hasSets ? "Selesai" : "Kembali ke Latihan"}
          </Link>
        ) : (
          <>
            <Link href={`/workout/session/${workout.id}`} className="lt-sum-btn primary">
              Lanjutkan sesi
            </Link>
            <Link href="/workout" className="lt-sum-btn">
              Kembali ke Latihan
            </Link>
          </>
        )}
        {hasSets && workout.completed && (
          <button
            type="button"
            className="lt-sum-btn"
            onClick={handleShare}
            disabled={sharing}
            aria-busy={sharing}
          >
            {sharing ? "Membuat gambar…" : "Bagikan progres"}
          </button>
        )}
      </div>
    </main>
  );
}
