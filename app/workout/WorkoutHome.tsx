"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SESSIONS,
  femaleSessions,
  getAllWorkouts,
  getActiveWorkoutId,
  getCustomTemplates,
  getWorkout,
  saveCustomTemplate,
  deleteCustomTemplate,
  startCustomWorkout,
  startWorkout,
  startQuickExercise,
  weekNumber,
  type CustomTemplate,
  type ExerciseDef,
  type SessionDef,
  type SessionType,
  type WorkoutSession,
} from "@/lib/workouts";
import { getProfile } from "@/lib/settings";
import {
  MUSCLE_LABEL,
  MUSCLE_TO_GROUP,
  type MuscleColorGroup,
  type MuscleKey,
} from "@/lib/muscles";
import {
  EQUIPMENT,
  searchEquipment,
  type Equipment,
} from "@/lib/equipment";
import { recordMachinePick, getPickRank } from "@/lib/machinePicks";
import { needsCoach, inferLevel } from "@/lib/difficulty";
import { inferFromLog } from "@/lib/gymInventory";
import { useActiveDate } from "@/lib/activeDate";
import { useSheetBack } from "@/lib/backSheet";
import { useVTNavigate } from "@/lib/navigate";

// ── Fire tokens (reused from the app theme) ────────────────────────────────
const SANS = "var(--font-dm-sans), 'Plus Jakarta Sans', sans-serif";
const FIRE = "linear-gradient(180deg,#ff8a52,#ee3c30 55%,#c01f12)";

// Monday-first weekday labels (Bahasa) + the JS getDay() index each maps to.
const DOW_SHORT = ["SEN", "SEL", "RAB", "KAM", "JUM", "SAB", "MIN"];
const DOW_FULL = ["SENIN", "SELASA", "RABU", "KAMIS", "JUMAT", "SABTU", "MINGGU"];
const DOW_WEEKDAY = [1, 2, 3, 4, 5, 6, 0]; // getDay() value per Monday-first slot

function isRestSession(s: SessionDef): boolean {
  return s.id === "FEM_REST" || s.primaryMuscles.length === 0;
}

type WeekDay = {
  short: string;
  full: string;
  weekday: number;
  session: SessionDef | null; // null = rest
  isToday: boolean;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export default function WorkoutHome() {
  const vtNavigate = useVTNavigate();
  const { activeDate } = useActiveDate();
  const [now, setNow] = useState<Date | null>(null);
  const [workouts, setWorkouts] = useState<WorkoutSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<CustomTemplate[]>([]);
  const [isFemale, setIsFemale] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [launched, setLaunched] = useState(false);
  const [launchName, setLaunchName] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const launchTimer = useRef<number | undefined>(undefined);

  useSheetBack(modalOpen, () => setModalOpen(false));
  useSheetBack(searchOpen, () => setSearchOpen(false));

  useEffect(() => {
    setNow(new Date());
    setWorkouts(getAllWorkouts());
    setActiveId(getActiveWorkoutId());
    setTemplates(getCustomTemplates());
    setIsFemale(getProfile().sex === "female");
  }, []);

  useEffect(() => () => window.clearTimeout(launchTimer.current), []);

  const today = activeDate;
  const wkNum = now ? weekNumber(now) : 1;

  const programSessions = useMemo(
    () => (isFemale ? femaleSessions() : SESSIONS.filter((s) => !s.program)),
    [isFemale]
  );

  // Session order → a stable two-digit tag for the watermark ("01"…).
  const sessionNum = useMemo(() => {
    const map = new Map<SessionType, string>();
    let n = 0;
    for (const s of programSessions) {
      if (isRestSession(s)) continue;
      n += 1;
      map.set(s.id, pad2(n));
    }
    return map;
  }, [programSessions]);

  // Completed session types in the current calendar week (Mon-anchored).
  const thisWeekDone = useMemo(() => {
    const set = new Set<SessionType>();
    if (!now) return set;
    const monday = new Date(now);
    monday.setHours(0, 0, 0, 0);
    const d = monday.getDay();
    monday.setDate(monday.getDate() + (d === 0 ? -6 : 1 - d));
    const mondayMs = monday.getTime();
    for (const w of workouts) {
      if (w.completed && w.startedAt >= mondayMs) set.add(w.sessionType);
    }
    return set;
  }, [workouts, now]);

  // Build the Monday-first week, one session per training day (dedup repeats).
  const week = useMemo<WeekDay[]>(() => {
    const todayWd = now ? now.getDay() : -1;
    const used = new Set<SessionType>();
    return DOW_WEEKDAY.map((wd, i) => {
      const candidates = programSessions.filter(
        (s) => s.recommendedDays.includes(wd) && !isRestSession(s)
      );
      let session: SessionDef | null = null;
      for (const c of candidates) {
        if (!used.has(c.id)) {
          session = c;
          used.add(c.id);
          break;
        }
      }
      return {
        short: DOW_SHORT[i],
        full: DOW_FULL[i],
        weekday: wd,
        session,
        isToday: wd === todayWd,
      };
    });
  }, [programSessions, now]);

  const todayIdx = useMemo(() => {
    const i = week.findIndex((d) => d.isToday);
    return i >= 0 ? i : 0;
  }, [week]);

  // Default the selection to today once the week is known.
  useEffect(() => {
    if (now && selectedIdx === null) setSelectedIdx(todayIdx);
  }, [now, todayIdx, selectedIdx]);

  const sel = selectedIdx ?? todayIdx;
  const cur = week[sel];

  const activeWorkout = useMemo(
    () => (activeId ? getWorkout(activeId) : null),
    [activeId]
  );
  const activeInProgress =
    activeWorkout && !activeWorkout.completed ? activeWorkout : null;

  const pickRank = useMemo(() => getPickRank(), [workouts]);

  function startOrResume(sessionType: SessionType): string {
    if (activeInProgress && activeInProgress.sessionType === sessionType) {
      return activeInProgress.id;
    }
    return startWorkout(sessionType, today).id;
  }

  function mulai(session: SessionDef) {
    setLaunchName(session.name);
    setLaunched(true);
    const id = startOrResume(session.id);
    window.clearTimeout(launchTimer.current);
    launchTimer.current = window.setTimeout(() => {
      vtNavigate(`/workout/session/${id}`);
    }, 950);
  }

  function logMachine(e: Equipment) {
    recordMachinePick(e);
    inferFromLog(e.id);
    const { id } = startQuickExercise(e, today);
    vtNavigate(`/workout/session/${id}`);
  }

  function viewDone(sessionType: SessionType) {
    const done = workouts
      .filter((w) => w.completed && w.sessionType === sessionType)
      .sort((a, b) => b.startedAt - a.startedAt)[0];
    if (done) vtNavigate(`/workout/session/${done.id}/complete`);
  }

  function pickCustom(template: CustomTemplate) {
    if (
      activeInProgress &&
      activeInProgress.sessionType === "CUSTOM" &&
      activeInProgress.customTemplateId === template.id
    ) {
      vtNavigate(`/workout/session/${activeInProgress.id}`);
      return;
    }
    const w = startCustomWorkout(template, today);
    vtNavigate(`/workout/session/${w.id}`);
  }

  function handleSaveTemplate(t: Omit<CustomTemplate, "id" | "createdAt">) {
    const saved = saveCustomTemplate(t);
    setTemplates(getCustomTemplates());
    setModalOpen(false);
    pickCustom(saved);
  }

  // ── derived: current day state ──
  const curSession = cur?.session ?? null;
  const curIsRest = !curSession;
  const curIsDone = !!curSession && thisWeekDone.has(curSession.id);
  const curIsToday = !!cur?.isToday;
  const canStart = !!curSession && !curIsDone;

  const chips = (curSession?.exercises ?? []).slice(0, 5);
  const trainingDays = week
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => d.session);

  return (
    <main
      className="page-rise"
      style={{
        maxWidth: 460,
        margin: "0 auto",
        minHeight: "100dvh",
        fontFamily: SANS,
        position: "relative",
        background:
          "radial-gradient(1100px 700px at 50% -8%, #17100f 0%, #0a0809 42%, #050406 100%)",
      }}
    >
      <div style={{ padding: "calc(14px + env(safe-area-inset-top)) 22px 130px" }}>
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
              color: "#f1ede9",
            }}
          >
            Program<span style={{ color: "#ee3c30" }}>.</span>
          </h1>
          <div className="mono" style={{ fontSize: 10, letterSpacing: "1.5px", color: "#7c736e" }}>
            MINGGU {wkNum} / 12
          </div>
        </div>

        {/* Resume pill for an in-progress session */}
        {activeInProgress && (
          <Link
            href={`/workout/session/${activeInProgress.id}`}
            className="tap-press"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 16,
              padding: "11px 15px",
              borderRadius: 14,
              textDecoration: "none",
              background:
                "linear-gradient(90deg,rgba(238,60,48,.14),rgba(238,60,48,.03))",
              border: "1px solid rgba(255,150,120,.32)",
            }}
          >
            <span style={{ fontSize: 15, color: "#ff8a72" }}>▶</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span
                className="mono"
                style={{ display: "block", fontSize: 9, letterSpacing: "1.5px", color: "#8a837d" }}
              >
                LANJUTKAN SESI
              </span>
              <span
                style={{
                  display: "block",
                  fontWeight: 700,
                  fontSize: 14,
                  color: "#f1ede9",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {activeInProgress.sessionType === "CUSTOM"
                  ? activeInProgress.customName ?? "Catat cepat"
                  : SESSIONS.find((s) => s.id === activeInProgress.sessionType)?.name}
              </span>
            </span>
            <span className="mono" style={{ fontSize: 20, color: "#5a524e" }}>›</span>
          </Link>
        )}

        {/* WEEK STRIP */}
        <div style={{ display: "flex", gap: 6, marginBottom: 22 }}>
          {week.map((d, i) => {
            const on = i === sel;
            const rest = !d.session;
            const done = !!d.session && thisWeekDone.has(d.session.id);
            let bg = "#0b0a0a";
            let border = "1px solid rgba(255,255,255,.05)";
            let shadow = "none";
            let labelColor = "#5a524e";
            let mark = "—";
            let markColor = "#3a3330";
            let markWeight = 400;
            if (done) {
              labelColor = "#22c55e";
              mark = "✓";
              markColor = "#5a524e";
              markWeight = 700;
              bg = "#0e0c0d";
              border = "1px solid rgba(255,255,255,.07)";
            } else if (!rest) {
              mark = "•";
              markColor = "#5a524e";
            }
            if (d.isToday) {
              labelColor = "#ff8a72";
              mark = "●";
              markColor = "#ff8a72";
              markWeight = 800;
            }
            if (on) {
              bg = FIRE;
              border = "1px solid rgba(255,150,120,.6)";
              shadow = "0 8px 22px rgba(238,60,48,.45)";
              labelColor = "#fff";
              markColor = "#fff";
            }
            return (
              <button
                key={i}
                type="button"
                className="tap-press"
                onClick={() => setSelectedIdx(i)}
                style={{
                  flex: 1,
                  cursor: "pointer",
                  padding: "11px 0 10px",
                  borderRadius: 13,
                  background: bg,
                  border,
                  boxShadow: shadow,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <span
                  className="mono"
                  style={{ fontSize: 8.5, letterSpacing: ".5px", fontWeight: 700, color: labelColor }}
                >
                  {d.short}
                </span>
                <span style={{ fontSize: 13, fontWeight: markWeight, color: markColor, lineHeight: 1 }}>
                  {mark}
                </span>
              </button>
            );
          })}
        </div>

        {/* STATEMENT CARD */}
        <div
          key={cur?.short ?? sel}
          style={{
            position: "relative",
            borderRadius: 24,
            overflow: "hidden",
            background: "linear-gradient(160deg,#1c1210,#0b0809)",
            border: "1px solid rgba(255,255,255,.08)",
            padding: "24px 22px 22px",
            minHeight: 250,
            animation: "wo-cardin .34s cubic-bezier(.22,.61,.36,1)",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: -34,
              right: -12,
              fontSize: 190,
              fontWeight: 800,
              lineHeight: 1,
              letterSpacing: "-4px",
              color: curIsRest ? "rgba(255,255,255,.05)" : "rgba(238,60,48,.07)",
            }}
          >
            {curSession ? sessionNum.get(curSession.id) ?? "–" : "–"}
          </div>
          <div style={{ position: "relative" }}>
            <div
              className="mono"
              style={{
                fontSize: 10,
                letterSpacing: "2px",
                color: curIsToday ? "#ff8a72" : curIsDone ? "#22c55e" : "#8a837d",
              }}
            >
              {curIsToday
                ? `${cur.full} · HARI INI`
                : curIsDone
                ? `${cur.full} · SELESAI`
                : cur?.full}
            </div>
            <div
              style={{
                fontSize: 40,
                fontWeight: 800,
                lineHeight: ".98",
                letterSpacing: ".3px",
                color: "#f1ede9",
                marginTop: 10,
                textWrap: "balance",
              }}
            >
              {curSession ? curSession.name : "Hari Istirahat"}
            </div>
            <div
              style={{
                width: 52,
                height: 4,
                borderRadius: 2,
                background: "linear-gradient(90deg,#ff8a3d,#ee2f1f)",
                margin: "15px 0",
              }}
            />
            <div style={{ fontSize: 13.5, lineHeight: 1.55, color: "#cfc8c2", fontWeight: 500 }}>
              {curSession
                ? curSession.aesthetic ?? curSession.focus
                : "Istirahat dan pulihkan — target 8–10rb langkah biar tetap gerak dan kaki recovery."}
            </div>
            {chips.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 16 }}>
                {chips.map((e, i) => (
                  <span
                    key={e.name}
                    className="mono"
                    style={{
                      fontSize: 9.5,
                      letterSpacing: ".3px",
                      padding: "6px 11px",
                      borderRadius: 8,
                      color: i < 4 ? "#e8ddd6" : "#8a837d",
                      background: i < 4 ? "rgba(255,255,255,.06)" : "rgba(255,255,255,.03)",
                      border: i < 4 ? "1px solid rgba(255,255,255,.1)" : "1px solid rgba(255,255,255,.07)",
                    }}
                  >
                    {e.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ACTION ZONE */}
        {curIsRest && (
          <div
            style={{
              marginTop: 16,
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "16px 18px",
              borderRadius: 16,
              background: "#0e0c0d",
              border: "1px solid rgba(255,255,255,.08)",
            }}
          >
            <span style={{ fontSize: 22 }}>🌙</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#f1ede9" }}>Hari istirahat</div>
              <div className="mono" style={{ fontSize: 10, color: "#8a837d", marginTop: 3 }}>
                JALAN 8–10K LANGKAH
              </div>
            </div>
          </div>
        )}

        {curIsDone && curSession && (
          <>
            <div
              style={{
                marginTop: 16,
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "15px 18px",
                borderRadius: 16,
                background: "rgba(34,197,94,.08)",
                border: "1px solid rgba(34,197,94,.3)",
              }}
            >
              <span style={{ fontSize: 18 }}>✓</span>
              <div
                className="mono"
                style={{ flex: 1, fontWeight: 700, fontSize: 13, letterSpacing: "1px", color: "#ff8a72" }}
              >
                SUDAH SELESAI {cur.full}
              </div>
              <button
                type="button"
                className="mono tap-press"
                onClick={() => viewDone(curSession.id)}
                style={{
                  fontSize: 11,
                  letterSpacing: "1px",
                  color: "#22c55e",
                  background: "transparent",
                  border: "none",
                  textDecoration: "underline",
                  cursor: "pointer",
                }}
              >
                LIHAT
              </button>
            </div>
            <button
              type="button"
              className="mono tap-press"
              onClick={() => mulai(curSession)}
              style={{
                marginTop: 10,
                width: "100%",
                background: "#0e0c0d",
                border: "1px solid rgba(255,255,255,.12)",
                borderRadius: 15,
                padding: 15,
                color: "#cfc8c2",
                fontSize: 12,
                letterSpacing: "1.5px",
                cursor: "pointer",
              }}
            >
              ↻ ULANGI SESI INI
            </button>
          </>
        )}

        {canStart && curSession && (
          <>
            <button
              type="button"
              className="tap-press"
              onClick={() => mulai(curSession)}
              style={{
                marginTop: 16,
                width: "100%",
                border: "1px solid rgba(255,150,120,.6)",
                borderRadius: 18,
                padding: 19,
                color: "#fff",
                fontSize: 20,
                fontWeight: 800,
                letterSpacing: "2px",
                background: FIRE,
                textShadow: "0 1px 2px rgba(120,15,5,.5)",
                cursor: "pointer",
                animation: curIsToday ? "wo-firepulse 2.4s ease-in-out infinite" : undefined,
                boxShadow: curIsToday
                  ? undefined
                  : "inset 0 1.5px 1px rgba(255,225,205,.7),0 10px 26px rgba(238,60,48,.42)",
              }}
            >
              {curIsToday ? "MULAI · HARI INI ▶" : "MULAI LEBIH AWAL ▶"}
            </button>
            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
              <button
                type="button"
                className="mono tap-press"
                onClick={() => setSearchOpen(true)}
                style={ghostBtn}
              >
                🔍 CARI / TUKAR
              </button>
              <button
                type="button"
                className="mono tap-press"
                onClick={() => setModalOpen(true)}
                style={ghostBtn}
              >
                ＋ SESI SAYA
              </button>
            </div>
          </>
        )}

        {/* MINGGU INI */}
        <div
          className="mono"
          style={{ fontSize: 10, letterSpacing: "2px", color: "#7c736e", margin: "26px 0 10px" }}
        >
          MINGGU INI
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {trainingDays.map(({ d, i }) => {
            const on = i === sel;
            const done = !!d.session && thisWeekDone.has(d.session.id);
            return (
              <button
                key={i}
                type="button"
                className="tap-press"
                onClick={() => setSelectedIdx(i)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "14px 16px",
                  borderRadius: 15,
                  cursor: "pointer",
                  background: on ? "rgba(238,60,48,.1)" : "#0e0c0d",
                  border: on ? "1px solid rgba(255,150,120,.4)" : "1px solid rgba(255,255,255,.08)",
                  opacity: done && !on ? 0.55 : 1,
                }}
              >
                <span
                  className="mono"
                  style={{
                    width: 38,
                    flex: "none",
                    fontSize: 9,
                    letterSpacing: "1px",
                    color: on ? "#ff8a72" : "#7c736e",
                    textAlign: "left",
                  }}
                >
                  {d.short}
                </span>
                <span
                  style={{ flex: 1, textAlign: "left", fontWeight: 700, fontSize: 15, color: "#f1ede9" }}
                >
                  {d.session!.name}
                </span>
                {done ? (
                  <span style={{ fontSize: 13, color: "#22c55e", flex: "none" }}>✓</span>
                ) : (
                  <span style={{ fontSize: 20, color: "#5a524e", lineHeight: 1, flex: "none" }}>›</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Quiet utility line */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexWrap: "wrap",
            gap: 12,
            rowGap: 10,
            marginTop: 18,
            padding: 14,
            borderRadius: 14,
            border: "1px dashed rgba(255,255,255,.12)",
            color: "#8a837d",
          }}
        >
          <button
            type="button"
            className="mono tap-press"
            onClick={() => setModalOpen(true)}
            style={utilBtn}
          >
            ＋ CATAT BEBAS
          </button>
          <span style={{ color: "#3a3330" }}>|</span>
          <button
            type="button"
            className="mono tap-press"
            onClick={() => setSearchOpen(true)}
            style={utilBtn}
          >
            🔍 CARI
          </button>
          <span style={{ color: "#3a3330" }}>|</span>
          <Link href="/workout/equipment" className="mono" style={{ ...utilBtn, textDecoration: "none" }}>
            🏋️ ALAT
          </Link>
        </div>

        {/* SESI SAYA (custom templates) */}
        {templates.length > 0 && (
          <>
            <div
              className="mono"
              style={{ fontSize: 10, letterSpacing: "2px", color: "#7c736e", margin: "26px 0 10px" }}
            >
              SESI SAYA
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {templates.map((t) => (
                <div
                  key={t.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "13px 15px",
                    borderRadius: 14,
                    background: "#0e0c0d",
                    border: "1px solid rgba(255,255,255,.08)",
                  }}
                >
                  <button
                    type="button"
                    className="tap-press"
                    onClick={() => pickCustom(t)}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      textAlign: "left",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 15, color: "#f1ede9" }}>{t.name}</div>
                    <div className="mono" style={{ fontSize: 9.5, color: "#8a837d", marginTop: 3 }}>
                      {t.focus || "CUSTOM"} · {t.exercises.length} gerakan
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      deleteCustomTemplate(t.id);
                      setTemplates(getCustomTemplates());
                    }}
                    aria-label={`Hapus ${t.name}`}
                    style={{
                      flex: "none",
                      width: 30,
                      height: 30,
                      borderRadius: 9,
                      color: "#8a837d",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      fontSize: 16,
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* LAUNCH OVERLAY */}
      {launched && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 50,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 18,
            background: "rgba(5,4,6,.82)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
          }}
        >
          <div
            style={{
              animation: "wo-launchpop .5s cubic-bezier(.34,1.56,.64,1)",
              width: 96,
              height: 96,
              borderRadius: "50%",
              background: FIRE,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 46,
              color: "#fff",
              boxShadow: "0 14px 50px rgba(238,60,48,.6)",
            }}
          >
            ▶
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "1px", color: "#f1ede9" }}>
            {launchName}
          </div>
          <div className="mono" style={{ fontSize: 11, letterSpacing: "2px", color: "#ff8a72" }}>
            MEMBUKA SESI…
          </div>
        </div>
      )}

      {searchOpen && (
        <SearchModal
          onClose={() => setSearchOpen(false)}
          onLogMachine={(e) => {
            setSearchOpen(false);
            logMachine(e);
          }}
          onPickSession={(s) => {
            setSearchOpen(false);
            const id = startOrResume(s.id);
            vtNavigate(`/workout/session/${id}`);
          }}
          sessions={programSessions.filter((s) => !isRestSession(s))}
          pickRank={pickRank}
        />
      )}

      {modalOpen && (
        <CustomSessionModal onClose={() => setModalOpen(false)} onSave={handleSaveTemplate} />
      )}
    </main>
  );
}

const ghostBtn: React.CSSProperties = {
  flex: 1,
  background: "#0e0c0d",
  border: "1px solid rgba(255,255,255,.08)",
  borderRadius: 14,
  padding: 13,
  color: "#cfc8c2",
  fontSize: 10,
  letterSpacing: "1.5px",
  cursor: "pointer",
};

const utilBtn: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: "1.5px",
  color: "#8a837d",
  background: "transparent",
  border: "none",
  cursor: "pointer",
};

// ---------------- Search modal (machines + sessions) ----------------

function SearchModal({
  onClose,
  onLogMachine,
  onPickSession,
  sessions,
  pickRank,
}: {
  onClose: () => void;
  onLogMachine: (e: Equipment) => void;
  onPickSession: (s: SessionDef) => void;
  sessions: SessionDef[];
  pickRank: Map<string, number>;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const machines = useMemo(
    () => (q ? searchEquipment(query, EQUIPMENT, pickRank).slice(0, 8) : []),
    [query, q, pickRank]
  );
  const sessionMatches = useMemo(() => {
    if (!q) return [];
    return sessions.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.focus.toLowerCase().includes(q) ||
        s.exercises.some((e) => e.name.toLowerCase().includes(q))
    );
  }, [sessions, q]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 120,
        background: "rgba(4,3,5,.74)",
        backdropFilter: "blur(9px)",
        WebkitBackdropFilter: "blur(9px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "calc(60px + env(safe-area-inset-top)) 18px 18px",
        animation: "wo-fadein .2s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          animation: "wo-popin .34s cubic-bezier(.34,1.56,.64,1)",
          width: "100%",
          maxWidth: 420,
          maxHeight: "80%",
          overflowY: "auto",
          background: "linear-gradient(180deg,rgba(46,34,31,.5),rgba(14,12,13,.42))",
          backdropFilter: "blur(30px) saturate(1.5)",
          WebkitBackdropFilter: "blur(30px) saturate(1.5)",
          border: "1px solid rgba(255,255,255,.18)",
          borderRadius: 26,
          padding: "18px 16px 20px",
          boxShadow:
            "0 30px 80px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.22),0 0 60px rgba(238,60,48,.1)",
        }}
      >
        <input
          autoFocus
          type="search"
          inputMode="search"
          placeholder="Cari mesin, sesi, atau gerakan…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="mono"
          style={{
            width: "100%",
            background: "rgba(0,0,0,.3)",
            border: "1px solid rgba(255,150,120,.3)",
            borderRadius: 13,
            padding: "13px 14px",
            color: "#f1ede9",
            fontSize: 14,
            outline: "none",
          }}
        />

        {!q && (
          <div
            className="mono"
            style={{ textAlign: "center", fontSize: 10, color: "#8a837d", marginTop: 18, lineHeight: 1.6 }}
          >
            Ketik nama mesin (mis. &ldquo;chest&rdquo;, &ldquo;inner thigh&rdquo;)
            <br />
            atau sesi buat langsung mulai.
          </div>
        )}

        {sessionMatches.length > 0 && (
          <>
            <div className="mono" style={sectionLabel}>
              SESI
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {sessionMatches.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="tap-press"
                  onClick={() => onPickSession(s)}
                  style={resultRow}
                >
                  <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                    <span style={{ display: "block", fontWeight: 700, fontSize: 14, color: "#f1ede9" }}>
                      {s.name}
                    </span>
                    <span className="mono" style={{ display: "block", fontSize: 9.5, color: "#8a837d", marginTop: 3 }}>
                      {s.focus}
                    </span>
                  </span>
                  <span className="mono" style={pillFire}>MULAI ▶</span>
                </button>
              ))}
            </div>
          </>
        )}

        {machines.length > 0 && (
          <>
            <div className="mono" style={sectionLabel}>
              MESIN · CATAT LANGSUNG
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {machines.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  className="tap-press"
                  onClick={() => onLogMachine(e)}
                  style={resultRow}
                >
                  <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                    <span
                      style={{
                        display: "block",
                        fontWeight: 700,
                        fontSize: 14,
                        color: "#f1ede9",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {e.name}
                    </span>
                    <span className="mono" style={{ display: "block", fontSize: 9.5, color: "#8a837d", marginTop: 3 }}>
                      {e.muscleGroup} · {e.category}
                    </span>
                  </span>
                  <span className="mono" style={pillFire}>＋ CATAT</span>
                </button>
              ))}
            </div>
          </>
        )}

        {q && machines.length === 0 && sessionMatches.length === 0 && (
          <div className="mono" style={{ textAlign: "center", fontSize: 11, color: "#8a837d", marginTop: 22 }}>
            Nggak ada yang cocok &ldquo;{query}&rdquo;.
          </div>
        )}
      </div>
    </div>
  );
}

const sectionLabel: React.CSSProperties = {
  fontSize: 9,
  letterSpacing: "2px",
  color: "#7c736e",
  margin: "18px 0 9px",
};
const resultRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  width: "100%",
  cursor: "pointer",
  padding: "12px 14px",
  borderRadius: 13,
  background: "linear-gradient(180deg,rgba(255,255,255,.045),transparent 55%),#0e0c0d",
  border: "1px solid rgba(255,255,255,.1)",
};
const pillFire: React.CSSProperties = {
  flex: "none",
  fontSize: 9.5,
  fontWeight: 700,
  letterSpacing: ".1em",
  color: "#fff",
  borderRadius: 999,
  padding: "6px 12px",
  whiteSpace: "nowrap",
  background: FIRE,
  border: "1px solid rgba(255,150,120,.5)",
};

// ---------------- Custom session modal ----------------

type DraftExercise = {
  name: string;
  sets: number;
  repsLabel: string;
  targetReps: number;
  restSec: number;
  primary: MuscleKey;
};

type CatalogEntry = { name: string; primary: MuscleKey };

/** Small amber warning shown on coach-required lifts for beginners. */
function CoachChip() {
  return (
    <span
      className="mono"
      style={{
        fontSize: 8,
        letterSpacing: ".08em",
        fontWeight: 700,
        color: "#ffcf8a",
        background: "rgba(240,180,60,.14)",
        border: "1px solid rgba(240,180,60,.4)",
        borderRadius: 999,
        padding: "2px 6px",
        marginTop: 4,
        whiteSpace: "nowrap",
      }}
    >
      ⚠ PERLU COACH
    </span>
  );
}

function newDraft(name: string, primary: MuscleKey): DraftExercise {
  return {
    name,
    sets: 3,
    repsLabel: "10",
    targetReps: 10,
    restSec: 60,
    primary,
  };
}

function draftToExerciseDef(d: DraftExercise): ExerciseDef {
  return {
    name: d.name.trim(),
    sets: d.sets,
    repsLabel: d.repsLabel.trim() || String(d.targetReps),
    targetReps: d.targetReps,
    increment: 2.5,
    restSec: d.restSec,
    primary: [d.primary],
    secondary: [],
  };
}

const GROUP_META: { key: MuscleColorGroup; label: string; emoji: string }[] = [
  { key: "chest",     label: "Dada",     emoji: "💪" },
  { key: "back",      label: "Punggung", emoji: "🦾" },
  { key: "shoulders", label: "Bahu",     emoji: "🛡️" },
  { key: "arms",      label: "Lengan",   emoji: "💥" },
  { key: "legs",      label: "Kaki",     emoji: "🦵" },
  { key: "abs",       label: "Perut",    emoji: "🔥" },
];

function buildCatalog(): CatalogEntry[] {
  const seen = new Map<string, CatalogEntry>();
  for (const s of SESSIONS) {
    for (const e of s.exercises) {
      const entry = { name: e.name, primary: e.primary[0] };
      if (entry.primary && !seen.has(entry.name)) seen.set(entry.name, entry);
    }
  }
  for (const e of EQUIPMENT) {
    const entry = { name: e.name, primary: muscleFromEquipmentGroup(e.muscleGroup) };
    if (!seen.has(entry.name)) seen.set(entry.name, entry);
  }
  return Array.from(seen.values());
}

function autoName(groups: MuscleColorGroup[]): string {
  if (groups.length === 0) return "Custom Session";
  const labels = groups.map((g) => GROUP_META.find((m) => m.key === g)?.label ?? g);
  return labels.join(" + ");
}

function CustomSessionModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (t: Omit<CustomTemplate, "id" | "createdAt">) => void;
}) {
  const [selectedGroups, setSelectedGroups] = useState<MuscleColorGroup[]>([]);
  const [drafts, setDrafts] = useState<DraftExercise[]>([]);
  const [query, setQuery] = useState("");
  const [nameOverride, setNameOverride] = useState<string | null>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  const catalog = useMemo(buildCatalog, []);
  const beginner = useMemo(() => inferLevel() === "beginner", []);
  const demote = useCallback(
    (list: CatalogEntry[]) =>
      beginner
        ? [...list].sort(
            (a, b) => Number(needsCoach(a.name)) - Number(needsCoach(b.name))
          )
        : list,
    [beginner]
  );

  function toggleGroup(g: MuscleColorGroup) {
    setSelectedGroups((list) =>
      list.includes(g) ? list.filter((x) => x !== g) : [...list, g]
    );
  }

  const added = useMemo(() => new Set(drafts.map((d) => d.name.toLowerCase())), [drafts]);

  const recommendations = useMemo<CatalogEntry[]>(() => {
    if (selectedGroups.length === 0) return [];
    const set = new Set<MuscleColorGroup>(selectedGroups);
    return demote(
      catalog
        .filter((c) => set.has(MUSCLE_TO_GROUP[c.primary]))
        .filter((c) => !added.has(c.name.toLowerCase()))
    );
  }, [catalog, selectedGroups, added, demote]);

  const searchMatches = useMemo<CatalogEntry[]>(() => {
    const qq = query.trim().toLowerCase();
    if (!qq) return [];
    return demote(
      catalog
        .filter((c) => c.name.toLowerCase().includes(qq))
        .filter((c) => !added.has(c.name.toLowerCase()))
    ).slice(0, 12);
  }, [catalog, query, added, demote]);

  function addEntry(entry: CatalogEntry) {
    setDrafts((list) => [...list, newDraft(entry.name, entry.primary)]);
  }

  function removeDraft(i: number) {
    setDrafts((list) => list.filter((_, idx) => idx !== i));
    if (editingIdx === i) setEditingIdx(null);
  }

  function updateDraft(i: number, patch: Partial<DraftExercise>) {
    setDrafts((list) => list.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }

  const name = nameOverride ?? autoName(selectedGroups);
  const focusLabel =
    selectedGroups.length === 0
      ? "Pilih otot fokus"
      : selectedGroups
          .map((g) => GROUP_META.find((m) => m.key === g)?.label ?? g)
          .join(" · ");

  const canSave = drafts.length > 0;

  function handleSave() {
    onSave({
      name: (name.trim() || autoName(selectedGroups)).slice(0, 60),
      focus: focusLabel,
      exercises: drafts.map(draftToExerciseDef),
    });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal wo-modal wo-modal-fast" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head wo-modal-head-sticky">
          <div className="modal-title-block">
            <input
              type="text"
              className="wo-modal-name"
              value={name}
              placeholder="Nama sesi"
              onChange={(e) => setNameOverride(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
            />
            <div className="wo-modal-focus mono">{focusLabel}</div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="wo-modal-scroll">
          <div className="wo-step-label mono">1 · PILIH OTOT</div>
          <div className="wo-group-grid">
            {GROUP_META.map((g) => {
              const on = selectedGroups.includes(g.key);
              return (
                <button
                  key={g.key}
                  type="button"
                  className={`wo-group-chip${on ? " on" : ""}`}
                  onClick={() => toggleGroup(g.key)}
                >
                  <span className="wo-group-emoji">{g.emoji}</span>
                  <span className="wo-group-label">{g.label}</span>
                </button>
              );
            })}
          </div>

          {selectedGroups.length > 0 && recommendations.length > 0 && (
            <>
              <div className="wo-step-label mono">2 · REKOMENDASI · TAP UNTUK TAMBAH</div>
              <div className="wo-reco-grid">
                {recommendations.slice(0, 16).map((r) => (
                  <button
                    key={r.name}
                    type="button"
                    className="wo-reco-chip"
                    onClick={() => addEntry(r)}
                  >
                    <span className="wo-reco-plus">+</span>
                    <span className="wo-reco-name">{r.name}</span>
                    <span className="wo-reco-muscle mono">{MUSCLE_LABEL[r.primary]}</span>
                    {beginner && needsCoach(r.name) && <CoachChip />}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="wo-step-label mono">
            {selectedGroups.length > 0 ? "3 · " : ""}ATAU CARI APA SAJA
          </div>
          <div className="wo-search-row">
            <input
              type="search"
              placeholder="Cari gerakan atau alat"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="wo-modal-search"
            />
            {query && (
              <button
                type="button"
                className="wo-search-clear wo-search-clear-inline"
                onClick={() => setQuery("")}
                aria-label="Clear"
              >
                ×
              </button>
            )}
          </div>
          {query.trim() && (
            <div className="wo-reco-grid">
              {searchMatches.length === 0 && (
                <div className="wo-reco-empty mono">Nggak ada hasil</div>
              )}
              {searchMatches.map((m) => (
                <button
                  key={m.name}
                  type="button"
                  className="wo-reco-chip"
                  onClick={() => {
                    addEntry(m);
                    setQuery("");
                  }}
                >
                  <span className="wo-reco-plus">+</span>
                  <span className="wo-reco-name">{m.name}</span>
                  <span className="wo-reco-muscle mono">{MUSCLE_LABEL[m.primary]}</span>
                  {beginner && needsCoach(m.name) && <CoachChip />}
                </button>
              ))}
            </div>
          )}

          <div className="wo-step-label mono">
            {drafts.length > 0 ? `DI SESI KAMU (${drafts.length})` : "BELUM ADA YANG DITAMBAH"}
          </div>
          <div className="wo-added-list">
            {drafts.map((d, i) => {
              const expanded = editingIdx === i;
              return (
                <div key={`${d.name}-${i}`} className={`wo-added${expanded ? " expanded" : ""}`}>
                  <div className="wo-added-top">
                    <button
                      type="button"
                      className="wo-added-name"
                      onClick={() => setEditingIdx(expanded ? null : i)}
                    >
                      <span>{d.name}</span>
                      <span className="wo-added-meta mono">
                        {d.sets}×{d.repsLabel} · {MUSCLE_LABEL[d.primary]}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="wo-added-remove"
                      onClick={() => removeDraft(i)}
                      aria-label="Remove"
                    >
                      ×
                    </button>
                  </div>
                  {expanded && (
                    <div className="wo-added-edit">
                      <label className="wo-draft-mini">
                        <span className="mono">SETS</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          value={d.sets}
                          onChange={(e) =>
                            updateDraft(i, {
                              sets: Math.max(1, Number(e.target.value) || 1),
                            })
                          }
                        />
                      </label>
                      <label className="wo-draft-mini">
                        <span className="mono">REPS</span>
                        <input
                          type="text"
                          value={d.repsLabel}
                          onChange={(e) => {
                            const v = e.target.value;
                            const n = parseInt(v, 10);
                            updateDraft(i, {
                              repsLabel: v,
                              targetReps: Number.isFinite(n) && n > 0 ? n : d.targetReps,
                            });
                          }}
                        />
                      </label>
                      <label className="wo-draft-mini">
                        <span className="mono">REST (S)</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          step={15}
                          value={d.restSec}
                          onChange={(e) =>
                            updateDraft(i, {
                              restSec: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                        />
                      </label>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="wo-modal-footer">
          <button className="save ghost" onClick={onClose}>
            Batal
          </button>
          <button className="save" disabled={!canSave} onClick={handleSave}>
            {canSave ? `Mulai · ${drafts.length}` : "Tambah satu gerakan"}
          </button>
        </div>
      </div>
    </div>
  );
}

function muscleFromEquipmentGroup(group: string): MuscleKey {
  const g = group.toUpperCase();
  if (g.includes("UPPER CHEST")) return "chest";
  if (g.includes("CHEST")) return "chest";
  if (g.includes("LATS")) return "lats";
  if (g.includes("MIDDLE BACK")) return "midBack";
  if (g.includes("LOWER BACK")) return "midBack";
  if (g.includes("FRONT DELT")) return "frontDelt";
  if (g.includes("SIDE DELT")) return "sideDelt";
  if (g.includes("REAR DELT")) return "rearDelt";
  if (g.includes("BICEPS")) return "bicep";
  if (g.includes("TRICEPS")) return "tricep";
  if (g.includes("QUADS")) return "quad";
  if (g.includes("HAMSTRINGS")) return "hamstring";
  if (g.includes("GLUTES")) return "glute";
  if (g.includes("INNER THIGH")) return "quad";
  if (g.includes("CALVES")) return "calf";
  if (g.includes("ABS") || g.includes("LOWER ABS")) return "abs";
  return "chest";
}
