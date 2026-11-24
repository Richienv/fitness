"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  SESSIONS,
  femaleSessions,
  getAllWorkouts,
  getActiveWorkoutId,
  getCustomTemplates,
  getDefForWorkout,
  saveCustomTemplate,
  deleteCustomTemplate,
  renameCustomTemplate,
  startCustomWorkout,
  startWorkout,
  startQuickExercise,
  appendExerciseToWorkout,
  exerciseDefFromEquipment,
  type CustomTemplate,
  type ExerciseDef,
  type SessionDef,
  type SessionType,
  type WorkoutSession,
} from "@/lib/workouts";
import { getProfile, getSettings } from "@/lib/settings";
import type { Equipment } from "@/lib/equipment";
import { recordMachinePick } from "@/lib/machinePicks";
import { inferFromLog } from "@/lib/gymInventory";
import { useSheetBack } from "@/lib/backSheet";
import { useVTNavigate } from "@/lib/navigate";
import { useSoftRefresh } from "@/lib/useSoftRefresh";
import { haptic } from "@/lib/haptics";
import { todayKey } from "@/lib/targets";
import {
  ACTIVITY_BY_KEY,
  activityKcal,
  plannedWorkoutKcal,
  type ActivityKey,
  type Intensity,
} from "@/lib/burn";
import { addActivity, deleteActivity, getActivities } from "@/lib/activity";
import { readDayBurn, sessionTitle, workoutBurn, type DayBurn } from "@/lib/burnData";
import { setsByMuscleThisWeek } from "@/lib/todayVolume";
import {
  BAR_GROUPS,
  countedSets,
  groupLoad,
  sameWeek,
  sentenceCase,
  shortDateLabel,
  weekdayOfKey,
  withinLastDays,
  type MuscleBarGroup,
} from "@/lib/trainingLoad";
import Icon from "../ui/Icon";
import { toast } from "../Toast";
import TodayBurn, { activityAmount } from "./TodayBurn";
import ActivitySheet from "./ActivitySheet";
import ExerciseGuide from "./ExerciseGuide";
import FreeLogSheet from "./FreeLogSheet";
import CustomSessionSheet from "./CustomSessionSheet";
import SheetFrame from "./SheetFrame";
import "./sheets-calm.css";

// Monday-first weekday names (Bahasa) and the Date.getDay() value of each.
const DOW_NAME = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
const DOW_WEEKDAY = [1, 2, 3, 4, 5, 6, 0];

/** A session left open for longer than this, on an earlier day, is not "now". */
const FRESH_MS = 12 * 3_600_000;

const fmt = (n: number) => Math.round(n).toLocaleString("id-ID");

/** What a session is called: a saved session keeps the capitals its owner typed. */
function titleOf(w: WorkoutSession): string {
  return w.sessionType === "CUSTOM" ? w.customName || "Catat bebas" : sessionTitle(w);
}

function isRestSession(s: SessionDef): boolean {
  return s.id === "FEM_REST" || s.primaryMuscles.length === 0;
}

/** The burn estimate knows sets and reps, not minutes: a timed block
 *  ("40 min" on a treadmill) would count as one tiny set. Leave it out. */
const isTimed = (e: ExerciseDef) => /\b(min|menit)\b/i.test(e.repsLabel);
function plannedKcal(exercises: ExerciseDef[], kg: number): number {
  return plannedWorkoutKcal(exercises.filter((e) => !isTimed(e)), kg).total;
}

type WeekDay = {
  name: string;
  weekday: number;
  session: SessionDef | null; // null = rest
  isToday: boolean;
};

export default function WorkoutHome() {
  const vtNavigate = useVTNavigate();
  // Today in China time, like the rest of the app. "" until the page is on
  // the screen, so the server render never shows a guess.
  const [today, setToday] = useState("");
  const [workouts, setWorkouts] = useState<WorkoutSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<CustomTemplate[]>([]);
  const [isFemale, setIsFemale] = useState(false);
  const [routineDays, setRoutineDays] = useState<number[] | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [freeOpen, setFreeOpen] = useState(false);
  const [burn, setBurn] = useState<DayBurn | null>(null);
  const [bars, setBars] = useState<Record<MuscleBarGroup, number> | null>(null);
  const [activityOpen, setActivityOpen] = useState(false);
  const [guide, setGuide] = useState<{ name: string; sets?: string } | null>(null);
  const [renaming, setRenaming] = useState<CustomTemplate | null>(null);
  const [deleting, setDeleting] = useState<CustomTemplate | null>(null);
  // A tap on a result starts a session and navigates; a second tap while the
  // next screen loads must not start another one.
  const starting = useRef(false);

  // The two big sheets run useSheetBack themselves (they can ask before closing).
  useSheetBack(activityOpen, () => setActivityOpen(false));
  useSheetBack(!!guide, () => setGuide(null));
  useSheetBack(!!renaming, () => setRenaming(null));
  useSheetBack(!!deleting, () => setDeleting(null));

  useEffect(() => {
    setIsFemale(getProfile().sex === "female");
    setRoutineDays(getSettings().routine?.trainingDays ?? null);
  }, []);

  // What the page shows, re-read whenever the stores change (a save here, a
  // sync, another tab) and whenever the app comes back to the screen.
  const refresh = useCallback(() => {
    if (!today) return;
    setWorkouts(getAllWorkouts());
    setActiveId(getActiveWorkoutId());
    setTemplates(getCustomTemplates());
    setBurn(readDayBurn(today));
    setBars(groupLoad(setsByMuscleThisWeek(today)));
  }, [today]);
  useEffect(() => {
    refresh();
  }, [refresh]);
  useSoftRefresh(refresh);

  // A phone keeps this app alive for days: when it returns to the screen the
  // date may have moved on, and "hari ini" must move with it.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    const sync = () => {
      if (document.visibilityState === "hidden") return;
      setToday(todayKey());
      refreshRef.current();
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("pageshow", sync);
    window.addEventListener("focus", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("pageshow", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);

  const saveActivity = (a: {
    kind: ActivityKey;
    steps?: number;
    minutes?: number;
    reps?: number;
    intensity?: Intensity;
  }) => {
    addActivity({ ...a, date: today });
    setActivityOpen(false);
    haptic("success");
    const kcal = activityKcal(a, burn?.kg ?? 70);
    toast(
      `${ACTIVITY_BY_KEY[a.kind].label} tercatat · ≈ ${fmt(kcal)} kkal`,
      "success",
    );
    refresh();
  };
  const removeActivity = (id: string) => {
    const a = getActivities(today).find((x) => x.id === id);
    deleteActivity(id);
    refresh();
    if (a)
      toast(
        `${ACTIVITY_BY_KEY[a.kind].label} ${activityAmount(a)} dihapus`,
        "success",
      );
  };

  const programSessions = useMemo(
    () => (isFemale ? femaleSessions() : SESSIONS.filter((s) => !s.program)),
    [isFemale],
  );

  // The Monday-first week, one session per training day.
  const week = useMemo<WeekDay[]>(() => {
    const todayWd = today ? weekdayOfKey(today) : null;
    const used = new Set<SessionType>();
    const scheduled = programSessions.filter((s) => !isRestSession(s));
    let slot = 0;
    return DOW_WEEKDAY.map((wd, i) => {
      let session: SessionDef | null = null;
      if (routineDays !== null) {
        session =
          routineDays.includes(wd) && scheduled.length
            ? scheduled[slot++ % scheduled.length]
            : null;
      } else {
        for (const c of programSessions) {
          if (c.recommendedDays.includes(wd) && !isRestSession(c) && !used.has(c.id)) {
            session = c;
            used.add(c.id);
            break;
          }
        }
      }
      return { name: DOW_NAME[i], weekday: wd, session, isToday: wd === todayWd };
    });
  }, [programSessions, today, routineDays]);

  // Sessions finished this week, by Monday-to-Sunday dates (not by the phone's
  // clock). Matched to the week's slots one by one, so a session that appears
  // twice in a week is "Selesai" only as often as it was really done.
  const doneByIdx = useMemo(() => {
    const left = new Map<SessionType, number>();
    if (today) {
      for (const w of workouts) {
        if (w.completed && sameWeek(w.date, today)) {
          left.set(w.sessionType, (left.get(w.sessionType) ?? 0) + 1);
        }
      }
    }
    return week.map((d) => {
      const id = d.session?.id;
      const n = id ? (left.get(id) ?? 0) : 0;
      if (!id || n === 0) return false;
      left.set(id, n - 1);
      return true;
    });
  }, [week, workouts, today]);

  const todayIdx = useMemo(() => {
    const i = week.findIndex((d) => d.isToday);
    return i >= 0 ? i : 0;
  }, [week]);
  const sel = Math.min(selectedIdx ?? todayIdx, week.length - 1);
  const cur = week[sel];

  // A session that is open now: started today, or within the last hours. One
  // left open on an earlier day is not "now"; it must not hide today's Mulai.
  const openWorkout = useMemo(() => {
    const w = activeId ? workouts.find((x) => x.id === activeId) : undefined;
    return w && !w.completed ? w : null;
  }, [activeId, workouts]);
  const activeInProgress = useMemo(
    () =>
      openWorkout &&
      today &&
      (openWorkout.date === today || Date.now() - openWorkout.startedAt < FRESH_MS)
        ? openWorkout
        : null,
    [openWorkout, today],
  );
  // A session with sets in it that is no longer the open one: left on an
  // earlier day, or replaced when another session was started. Without this
  // line there is no way back to it.
  const unfinished = useMemo(
    () =>
      today
        ? (workouts
            .filter(
              (w) =>
                !w.completed &&
                w.id !== activeInProgress?.id &&
                withinLastDays(w.date, today, 7) &&
                w.exercises.some((e) => countedSets(e.sets) > 0),
            )
            .sort((a, b) => b.startedAt - a.startedAt)[0] ?? null)
        : null,
    [workouts, activeInProgress, today],
  );

  const latestDone = useCallback(
    (sessionType: SessionType) =>
      workouts
        .filter(
          (w) =>
            w.completed && w.sessionType === sessionType && !!today && sameWeek(w.date, today),
        )
        .sort((a, b) => b.startedAt - a.startedAt)[0],
    [workouts, today],
  );

  function startOrResume(sessionType: SessionType): string {
    if (activeInProgress && activeInProgress.sessionType === sessionType) {
      return activeInProgress.id;
    }
    return startWorkout(sessionType, today).id;
  }

  function go(href: string) {
    starting.current = true;
    vtNavigate(href);
    window.setTimeout(() => {
      starting.current = false;
    }, 2500);
  }

  function mulai(session: SessionDef) {
    if (starting.current) return;
    go(`/workout/session/${startOrResume(session.id)}`);
  }

  function logMachine(e: Equipment) {
    if (starting.current) return;
    recordMachinePick(e);
    inferFromLog(e.id);
    let id: string;
    if (
      activeInProgress &&
      !(activeInProgress.sessionType === "CUSTOM" && activeInProgress.date === today)
    ) {
      // A program session is running: the machine joins it as an extra
      // exercise, instead of starting a second session and leaving this one
      // with no way back.
      const def = exerciseDefFromEquipment(e);
      const has = getDefForWorkout(activeInProgress).exercises.some(
        (x) => x.name === def.name,
      );
      if (!has) appendExerciseToWorkout(activeInProgress, def);
      id = activeInProgress.id;
    } else {
      id = startQuickExercise(e, today).id;
    }
    go(`/workout/session/${id}`);
  }

  function viewDone(sessionType: SessionType) {
    const done = latestDone(sessionType);
    if (done) go(`/workout/session/${done.id}/complete`);
  }

  function pickCustom(template: CustomTemplate) {
    if (starting.current) return;
    if (
      activeInProgress &&
      activeInProgress.sessionType === "CUSTOM" &&
      activeInProgress.customTemplateId === template.id
    ) {
      go(`/workout/session/${activeInProgress.id}`);
      return;
    }
    go(`/workout/session/${startCustomWorkout(template, today).id}`);
  }

  function handleSaveTemplate(t: Omit<CustomTemplate, "id" | "createdAt">) {
    if (starting.current) return;
    const saved = saveCustomTemplate(t);
    setTemplates(getCustomTemplates());
    haptic("success");
    toast(`Sesi "${saved.name}" disimpan`, "success");
    pickCustom(saved);
  }

  // ── derived: the day shown in the Gym card ──
  const curSession = cur?.session ?? null;
  const curIsDone = !!curSession && !!doneByIdx[sel];
  const curIsToday = !!cur?.isToday;

  // What the shown session burns: the estimate for its planned sets, or the
  // real number once it is done. Active calories, like "Hari ini".
  const gymKcal = useMemo(() => {
    if (!burn) return null;
    const kg = burn.kg;
    if (activeInProgress) {
      const n = plannedKcal(getDefForWorkout(activeInProgress).exercises, kg);
      return n > 0 ? { kcal: n, real: false } : null;
    }
    if (!curSession) return null;
    if (curIsDone) {
      const w = latestDone(curSession.id);
      const real = w ? workoutBurn(w, kg).total : 0;
      if (real > 0) return { kcal: real, real: true };
    }
    const n = plannedKcal(curSession.exercises, kg);
    return n > 0 ? { kcal: n, real: false } : null;
  }, [burn, activeInProgress, curSession, curIsDone, latestDone]);
  const kcalNote = gymKcal && (
    <span className="lt-sh-nowrap">
      ≈ {fmt(gymKcal.kcal)} kkal {gymKcal.real ? "terbakar" : "(perkiraan)"}
    </span>
  );

  const trainingDays = week.map((d, i) => ({ d, i })).filter(({ d }) => d.session);
  const barTotal = bars ? Object.values(bars).reduce((a, b) => a + b, 0) : 0;
  const barMax = Math.max(10, ...Object.values(bars ?? {}));

  // What "Catat bebas" will do with the machine you pick.
  const freeNote = activeInProgress
    ? `Alat yang kamu pilih ditambahkan ke "${titleOf(activeInProgress)}" yang sedang berjalan.`
    : null;

  return (
    <main
      className="page-rise"
      style={{
        maxWidth: 560,
        margin: "0 auto",
        minHeight: "100dvh",
        fontFamily: "var(--font-dm-sans), 'Plus Jakarta Sans', sans-serif",
        position: "relative",
        background: "var(--bg)",
      }}
    >
      <div
        style={{ padding: "calc(14px + env(safe-area-inset-top)) 22px 130px" }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            margin: "8px 0 16px",
          }}
        >
          <h1
            style={{
              fontSize: 27,
              fontWeight: 800,
              letterSpacing: ".3px",
              color: "var(--text)",
            }}
          >
            Latihan
          </h1>
        </div>

        <section className="lt-card" aria-labelledby="lt-gym-title">
          <div className="lt-head">
            <h2 id="lt-gym-title">Gym</h2>
            {today && cur && (
              <span className="lt-note">
                {cur.name}
                {curIsToday ? " · hari ini" : ""}
              </span>
            )}
          </div>
          {!today ? (
            <p className="lt-empty">Memuat latihan…</p>
          ) : activeInProgress ? (
            <>
              <p className="lt-gym-title">
                <strong>{titleOf(activeInProgress)}</strong>
                <span>Sedang berlangsung</span>
                {kcalNote && <span>{kcalNote}</span>}
              </p>
              <Link
                href={`/workout/session/${activeInProgress.id}`}
                className="primary-button lt-primary"
              >
                Lanjutkan latihan
              </Link>
            </>
          ) : curSession ? (
            <>
              <p className="lt-gym-title">
                <strong>{sentenceCase(curSession.name)}</strong>
                <span>
                  {curSession.exercises.length} latihan ·{" "}
                  {sentenceCase(curSession.focus)}
                  {kcalNote && <> · {kcalNote}</>}
                </span>
              </p>
              {curIsDone ? (
                <div className="lt-done-row">
                  <span className="lt-status done">
                    <Icon name="check" size={16} />
                    Selesai minggu ini
                  </span>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => viewDone(curSession.id)}
                  >
                    Lihat ringkasan
                  </button>
                  <button
                    type="button"
                    className="mk-text-btn"
                    onClick={() => mulai(curSession)}
                  >
                    Ulangi
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="primary-button lt-primary"
                  onClick={() => mulai(curSession)}
                >
                  {curIsToday
                    ? "Mulai latihan"
                    : `Mulai ${sentenceCase(curSession.name)}`}
                </button>
              )}
              <ul className="lt-exercises" aria-label="Daftar latihan">
                {curSession.exercises.map((ex) => (
                  <li key={ex.name}>
                    <span>
                      <strong>{ex.name}</strong>
                      <small>
                        {ex.sets} set × {ex.repsLabel}
                      </small>
                    </span>
                    <button
                      type="button"
                      className="mk-text-btn"
                      aria-label={`Cara melakukan ${ex.name}`}
                      onClick={() =>
                        setGuide({
                          name: ex.name,
                          sets: `${ex.sets} set × ${ex.repsLabel} repetisi`,
                        })
                      }
                    >
                      Cara
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="lt-gym-title">
              <strong>Hari istirahat</strong>
              <span>
                Jalan 8–10 ribu langkah membantu pemulihan. Tetap mau latihan?
                Pilih sesinya di bawah.
              </span>
            </p>
          )}

          {unfinished && (
            <p className="lt-stale">
              <span>
                Belum selesai: {titleOf(unfinished)},{" "}
                {unfinished.date === today ? "hari ini" : shortDateLabel(unfinished.date)}.
              </span>
              <Link href={`/workout/session/${unfinished.id}`}>Lanjutkan</Link>
            </p>
          )}

          <h3 className="lt-sub-title">Minggu ini</h3>
          {trainingDays.length ? (
            <ul className="lt-week">
              {trainingDays.map(({ d, i }) => {
                const done = doneByIdx[i];
                const missed = !done && !d.isToday && !!today && i < todayIdx;
                const selected = i === sel;
                return (
                  <li key={i}>
                    <button
                      type="button"
                      className={`lt-week-row${selected ? " selected" : ""}`}
                      aria-pressed={selected}
                      onClick={() => setSelectedIdx(i)}
                    >
                      <span className="lt-week-day">{d.name}</span>
                      <span className="lt-week-name">
                        {sentenceCase(d.session!.name)}
                      </span>
                      <span
                        className={`lt-status${done ? " done" : d.isToday ? " today" : ""}`}
                      >
                        {done ? (
                          <>
                            <Icon name="check" size={16} />
                            Selesai
                          </>
                        ) : d.isToday ? (
                          "Hari ini"
                        ) : missed ? (
                          "Terlewat"
                        ) : (
                          "Belum"
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="lt-empty">Atur hari latihan di Pengaturan.</p>
          )}

          <h3 className="lt-sub-title">Otot 7 hari terakhir</h3>
          <ul className="lt-muscles" aria-label="Set per kelompok otot, 7 hari terakhir">
            {BAR_GROUPS.map(({ key, label }) => {
              const sets = bars?.[key] ?? 0;
              return (
                <li key={key}>
                  <span>{label}</span>
                  <span className="lt-bar" aria-hidden="true">
                    <span style={{ ["--p" as string]: sets / barMax } as CSSProperties} />
                  </span>
                  <strong>{sets} set</strong>
                </li>
              );
            })}
          </ul>
          <p className="lt-foot">
            {bars && barTotal === 0
              ? "Belum ada set tercatat dalam 7 hari terakhir. Set yang kamu selesaikan muncul di sini."
              : "Set per kelompok otot dalam 7 hari terakhir. Sekitar 10–20 set seminggu umum dipakai untuk membangun otot."}
          </p>

          <div className="lt-links">
            <button
              type="button"
              className="mk-text-btn"
              onClick={() => setFreeOpen(true)}
            >
              Catat bebas
            </button>
            <button
              type="button"
              className="mk-text-btn"
              onClick={() => setCustomOpen(true)}
            >
              Buat sesi sendiri
            </button>
            <Link className="mk-text-btn" href="/workout/equipment">
              Alat gym
            </Link>
          </div>
        </section>

        <TodayBurn
          burn={burn}
          onAdd={() => setActivityOpen(true)}
          onDelete={removeActivity}
        />

        {templates.length > 0 && (
          <section className="lt-card" aria-labelledby="lt-tpl-title">
            <div className="lt-head">
              <h2 id="lt-tpl-title">Sesi saya</h2>
              <span className="lt-note">{templates.length} sesi</span>
            </div>
            <ul className="lt-tpl">
              {templates.map((t) => {
                const running =
                  activeInProgress?.sessionType === "CUSTOM" &&
                  activeInProgress.customTemplateId === t.id;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      className="lt-tpl-start"
                      onClick={() => pickCustom(t)}
                    >
                      <span className="lt-sh-row-main">
                        <strong>{t.name}</strong>
                        <small>
                          {t.exercises.length} gerakan · {t.focus || "Latihan bebas"}
                        </small>
                      </span>
                      <span className="lt-sh-act">
                        {running ? "Lanjutkan" : "Mulai"}
                      </span>
                    </button>
                    <div className="lt-tpl-actions">
                      <button
                        type="button"
                        className="lt-tpl-link"
                        aria-label={`Ubah nama ${t.name}`}
                        onClick={() => setRenaming(t)}
                      >
                        Ubah nama
                      </button>
                      <button
                        type="button"
                        className="lt-tpl-link danger"
                        aria-label={`Hapus ${t.name}`}
                        onClick={() => setDeleting(t)}
                      >
                        Hapus
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>

      {activityOpen && (
        <ActivitySheet
          kg={burn?.kg ?? 70}
          onSave={saveActivity}
          onClose={() => setActivityOpen(false)}
        />
      )}
      {guide && (
        <ExerciseGuide
          name={guide.name}
          sets={guide.sets}
          onClose={() => setGuide(null)}
        />
      )}
      {freeOpen && (
        <FreeLogSheet
          sessions={programSessions.filter((s) => !isRestSession(s))}
          note={freeNote}
          onClose={() => setFreeOpen(false)}
          onLogMachine={logMachine}
          onPickSession={mulai}
        />
      )}
      {customOpen && (
        <CustomSessionSheet
          onClose={() => setCustomOpen(false)}
          onSave={handleSaveTemplate}
        />
      )}
      {renaming && (
        <RenameDialog
          template={renaming}
          onClose={() => setRenaming(null)}
          onSave={(name) => {
            renameCustomTemplate(renaming.id, name);
            setTemplates(getCustomTemplates());
            setRenaming(null);
            toast("Nama sesi diubah", "success");
          }}
        />
      )}
      {deleting && (
        <DeleteDialog
          template={deleting}
          onClose={() => setDeleting(null)}
          onDelete={() => {
            deleteCustomTemplate(deleting.id);
            setTemplates(getCustomTemplates());
            setDeleting(null);
            toast(`Sesi "${deleting.name}" dihapus`, "success");
          }}
        />
      )}
    </main>
  );
}

function RenameDialog({
  template,
  onClose,
  onSave,
}: {
  template: CustomTemplate;
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState(template.name);
  const blank = !name.trim();
  return (
    <SheetFrame variant="dialog" title="Ubah nama sesi" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!blank) onSave(name);
        }}
      >
        <label className="lt-sh-field">
          Nama sesi
          <input
            data-autofocus
            type="text"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
          />
        </label>
        {blank && (
          <p className="lt-sh-hint" role="alert">
            Isi nama sesi dulu.
          </p>
        )}
        <div className="lt-sh-actions">
          <button type="button" className="lt-sh-secondary" onClick={onClose}>
            Batal
          </button>
          <button type="submit" className="lt-sh-primary" disabled={blank}>
            Simpan nama
          </button>
        </div>
      </form>
    </SheetFrame>
  );
}

function DeleteDialog({
  template,
  onClose,
  onDelete,
}: {
  template: CustomTemplate;
  onClose: () => void;
  onDelete: () => void;
}) {
  return (
    <SheetFrame
      variant="dialog"
      title={`Hapus "${template.name}"?`}
      description="Sesi ini hilang dari daftar. Latihan yang sudah kamu catat tetap ada di riwayat."
      onClose={onClose}
    >
      <div className="lt-sh-actions">
        <button
          type="button"
          className="lt-sh-secondary"
          data-autofocus
          onClick={onClose}
        >
          Batal
        </button>
        <button type="button" className="lt-sh-danger" onClick={onDelete}>
          Hapus sesi
        </button>
      </div>
    </SheetFrame>
  );
}
