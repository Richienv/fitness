"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useSession } from "next-auth/react";
import AvatarPlayer from "./AvatarPlayer";
import {
  readCompanion,
  saveCompanion,
  type CompanionSettings,
} from "@/lib/companionSettings";
import {
  companionProgress,
  comparableLifts,
  weightSummary,
  type Character,
  type CompanionGoal,
} from "@/lib/companionProgress";
import { getAllMeasurements, type Measurement } from "@/lib/measurements";
import { getAllWorkouts, type WorkoutSession } from "@/lib/workouts";
import { todayKey } from "@/lib/targets";
import { useSoftRefresh } from "@/lib/useSoftRefresh";
import Icon from "../ui/Icon";

export default function CompanionPage() {
  const { data: session } = useSession();
  const [settings, setSettings] = useState<CompanionSettings>({
    character: "richie",
    goal: null,
  });
  const [character, setCharacter] = useState<Character>("richie"),
    [level, setLevel] = useState(1),
    [rows, setRows] = useState<Measurement[]>([]),
    [workouts, setWorkouts] = useState<WorkoutSession[]>([]),
    [date, setDate] = useState("");
  const [mode, setMode] = useState<"weight" | "recomp">("recomp"),
    [weightTarget, setWeightTarget] = useState(""),
    [waistTarget, setWaistTarget] = useState(""),
    [liftTarget, setLiftTarget] = useState(""),
    [exercise, setExercise] = useState(""),
    [reps, setReps] = useState("8"),
    [message, setMessage] = useState("");
  const refresh = useCallback(() => {
    setRows(getAllMeasurements());
    setWorkouts(getAllWorkouts());
    setDate(todayKey());
    setSettings(readCompanion(session?.user?.name));
  }, [session?.user?.name]);
  useEffect(() => {
    refresh();
    const s = readCompanion(session?.user?.name);
    setCharacter(s.character);
    setMode(s.goal?.mode ?? (s.character === "renita" ? "weight" : "recomp"));
    setWeightTarget(
      String(s.goal?.targetWeight ?? (s.character === "renita" ? 43 : "")),
    );
    setWaistTarget(String(s.goal?.targetWaist ?? ""));
    setLiftTarget(String(s.goal?.targetLift ?? ""));
    setExercise(s.goal?.exercise ?? "");
    setReps(String(s.goal?.reps ?? 8));
  }, [refresh, session?.user?.name]);
  useSoftRefresh(refresh);
  const summary = date
    ? weightSummary(rows, date)
    : { latest: null, mean: null, count: 0 };
  const progress = date
    ? companionProgress(settings.goal, rows, workouts, date)
    : { level: null, fraction: null };
  const names = [
    ...new Set(
      workouts.flatMap((w) =>
        w.exercises
          .filter((e) => !e.skipped)
          .map((e) => e.swappedTo || e.exerciseName),
      ),
    ),
  ].sort();
  const num = (s: string) =>
    s.trim() !== "" && Number.isFinite(Number(s)) && Number(s) > 0
      ? Number(s)
      : null;
  function saveGoal(e: FormEvent) {
    e.preventDefault();
    setMessage("");
    const old = settings.goal?.mode === mode ? settings.goal : null;
    const waist =
      rows
        .filter((r) => r.waistCm && r.date <= date)
        .sort((a, b) => a.date.localeCompare(b.date))
        .at(-1)?.waistCm ?? null;
    const lift =
      comparableLifts(workouts, exercise, Number(reps), date).at(-1)?.weight ??
      null;
    const goal: CompanionGoal = {
      mode,
      baselineDate: old?.baselineDate ?? date,
      baselineWeight: old?.baselineWeight ?? summary.mean,
      targetWeight: num(weightTarget),
      baselineWaist: old?.baselineWaist ?? waist,
      targetWaist: num(waistTarget),
      exercise,
      reps: Number(reps),
      baselineLift:
        old?.exercise === exercise && old.reps === Number(reps)
          ? old.baselineLift
          : lift,
      targetLift: num(liftTarget),
    };
    if (
      mode === "weight" &&
      (!goal.baselineWeight ||
        !goal.targetWeight ||
        goal.targetWeight === goal.baselineWeight)
    ) {
      setMessage(
        "Perlu 3 penimbangan dalam 7 hari dan target yang berbeda dari baseline.",
      );
      return;
    }
    if (
      mode === "recomp" &&
      (!goal.baselineWaist ||
        !goal.baselineLift ||
        !goal.targetWaist ||
        !goal.targetLift ||
        goal.targetWaist >= goal.baselineWaist ||
        goal.targetLift <= goal.baselineLift ||
        !Number.isInteger(goal.reps) ||
        goal.reps < 1)
    ) {
      setMessage(
        "Pilih latihan dengan set tercatat, target beban lebih tinggi, dan target pinggang lebih kecil dari baseline.",
      );
      return;
    }
    try {
      saveCompanion({ ...settings, goal });
      setMessage("Target tersimpan. Level mengikuti perubahan yang bertahan.");
    } catch {
      setMessage(
        "Penyimpanan perangkat tidak tersedia. Target belum disimpan.",
      );
    }
  }
  function useCharacter() {
    try {
      saveCompanion({ ...settings, character });
      setMessage(
        `Avatar ${character === "richie" ? "Richie" : "Renita"} dipakai. Catatan akun tetap sama.`,
      );
    } catch {
      setMessage("Avatar belum tersimpan. Coba lagi.");
    }
  }
  return (
    <main className="lean-home progress-home">
      <header className="lean-header">
        <h1>Progres</h1>
        <Link href="/settings" className="icon-button" aria-label="Pengaturan">
          <Icon name="settings" />
        </Link>
      </header>
      <div className="character-tabs" aria-label="Preview karakter">
        {(["richie", "renita"] as const).map((p) => (
          <button
            key={p}
            aria-pressed={character === p}
            onClick={() => setCharacter(p)}
          >
            {p === "richie" ? "Richie" : "Renita"}
          </button>
        ))}
      </div>
      <AvatarPlayer key={character} character={character} level={level} />
      <div className="avatar-status">
        <span>Preview level {level} / 12</span>
        <button onClick={useCharacter}>
          {settings.character === character ? "Dipakai" : "Gunakan avatar"}
        </button>
      </div>
      <div className="level-picker" aria-label="Dua belas level ilustrasi">
        {Array.from({ length: 12 }, (_, i) => (
          <button
            key={i}
            aria-pressed={level === i + 1}
            aria-label={`Preview level ${i + 1}`}
            onClick={() => setLevel(i + 1)}
          >
            {i + 1}
          </button>
        ))}
      </div>
      <p className="lean-note">
        Preview bentuk ilustratif. Pilihan level di sini tidak mengubah progres
        akun.
      </p>
      <div className="progress-readout">
        <span>Progres akun {session?.user?.name?.split(" ")[0] ?? ""}</span>
        <strong>
          {progress.level
            ? `Level ${progress.level} / 12`
            : "Belum terkalibrasi"}
        </strong>
      </div>
      <div className="lean-facts">
        <Link href="/dashboard/progress">
          <span>Berat terakhir</span>
          <strong>
            {summary.latest?.weightKg?.toFixed(1) ?? "—"}
            <small> kg</small>
          </strong>
          <small>{summary.latest?.date ?? "Belum tercatat"}</small>
        </Link>
        <div>
          <span>Tren 7 hari</span>
          <strong>
            {summary.mean?.toFixed(1) ?? "—"}
            <small> kg</small>
          </strong>
          <small>{summary.count} pengukuran</small>
        </div>
        <div>
          <span>Target berat</span>
          <strong>
            {settings.goal?.mode === "weight"
              ? (settings.goal.targetWeight ?? "—")
              : "—"}
            <small> kg</small>
          </strong>
          <small>
            {settings.goal?.mode === "recomp"
              ? "Rekomposisi"
              : "Target pribadi"}
          </small>
        </div>
      </div>
      <div className="progress-links">
        <Link href="/dashboard/progress">
          Catat ukuran <Icon name="plus" size={17} />
        </Link>
        <Link href="/dashboard">
          Riwayat lengkap <Icon name="arrow" size={17} />
        </Link>
      </div>
      <details id="goals" className="goal-details">
        <summary>Target avatar</summary>
        <p className="lean-note">
          Target disimpan untuk akun ini di perangkat ini. Baseline diambil dari
          catatan nyata; mengganti karakter tidak mengganti akun.
        </p>
        <form onSubmit={saveGoal} className="goal-form">
          <label>
            Fokus
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as "weight" | "recomp")}
            >
              <option value="recomp">Lebih kuat, pinggang mengecil</option>
              <option value="weight">Tren berat menuju target</option>
            </select>
          </label>
          {mode === "weight" ? (
            <label>
              Target berat (kg)
              <input
                type="number"
                min="1"
                step="0.1"
                value={weightTarget}
                onChange={(e) => setWeightTarget(e.target.value)}
                required
              />
            </label>
          ) : (
            <>
              <label>
                Target pinggang (cm)
                <input
                  type="number"
                  min="1"
                  step="0.1"
                  value={waistTarget}
                  onChange={(e) => setWaistTarget(e.target.value)}
                  required
                />
              </label>
              <label>
                Latihan pembanding
                <select
                  value={exercise}
                  onChange={(e) => setExercise(e.target.value)}
                  required
                >
                  <option value="">Pilih dari riwayat</option>
                  {names.map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <div className="goal-columns">
                <label>
                  Repetisi
                  <input
                    type="number"
                    min="1"
                    max="100"
                    step="1"
                    value={reps}
                    onChange={(e) => setReps(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Target beban (kg)
                  <input
                    type="number"
                    min="0.1"
                    step="0.5"
                    value={liftTarget}
                    onChange={(e) => setLiftTarget(e.target.value)}
                    required
                  />
                </label>
              </div>
            </>
          )}
          <button className="primary-button">Simpan target</button>
        </form>
        <p className="lean-note">
          Berat memakai dua rata-rata mingguan, minimal 3 pengukuran tiap
          minggu. Rekomposisi memakai dua catatan pinggang dan dua sesi dengan
          latihan serta repetisi yang sama dalam 28 hari. Level 12 berarti
          target pilihanmu tercapai; bukan skor kesehatan.
        </p>
        {settings.goal && (
          <p className="lean-note">
            Baseline {settings.goal.baselineDate}:{" "}
            {settings.goal.mode === "weight"
              ? `${settings.goal.baselineWeight?.toFixed(1)} kg`
              : `${settings.goal.baselineWaist} cm · ${settings.goal.baselineLift} kg × ${settings.goal.reps}`}
          </p>
        )}
      </details>
      {message && (
        <p className="companion-message" role="status">
          {message}
        </p>
      )}
      <details className="goal-details">
        <summary>Richie & Renita</summary>
        <AvatarPlayer duo />
      </details>
      <div className="utility-links">
        <Link href="/social">Teman</Link>
        <Link href="/sleep">Tidur</Link>
        <Link href="/install">Pasang di HP</Link>
      </div>
    </main>
  );
}
