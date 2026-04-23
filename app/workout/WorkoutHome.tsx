"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  SESSIONS,
  getAllWorkouts,
  getActiveWorkoutId,
  getCustomTemplates,
  getWorkout,
  recommendedSessionFor,
  saveCustomTemplate,
  deleteCustomTemplate,
  startCustomWorkout,
  startWorkout,
  weekNumber,
  type CustomTemplate,
  type ExerciseDef,
  type SessionType,
  type WorkoutSession,
} from "@/lib/workouts";
import { MUSCLE_LABEL, type MuscleKey } from "@/lib/muscles";
import { EQUIPMENT } from "@/lib/equipment";
import { useActiveDate } from "@/lib/activeDate";
import SessionSilhouette from "./SessionSilhouette";

function mondayOf(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

function sessionMatches(query: string, s: (typeof SESSIONS)[number]): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  if (s.name.toLowerCase().includes(q)) return true;
  if (s.focus.toLowerCase().includes(q)) return true;
  if (s.blurb.toLowerCase().includes(q)) return true;
  return s.exercises.some((e) => e.name.toLowerCase().includes(q));
}

function templateMatches(query: string, t: CustomTemplate): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  if (t.name.toLowerCase().includes(q)) return true;
  if (t.focus.toLowerCase().includes(q)) return true;
  return t.exercises.some((e) => e.name.toLowerCase().includes(q));
}

export default function WorkoutHome() {
  const router = useRouter();
  const { activeDate, label: dateLabel } = useActiveDate();
  const [now, setNow] = useState<Date | null>(null);
  const [workouts, setWorkouts] = useState<WorkoutSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<CustomTemplate[]>([]);
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    setNow(new Date());
    setWorkouts(getAllWorkouts());
    setActiveId(getActiveWorkoutId());
    setTemplates(getCustomTemplates());
  }, []);

  const recommended: SessionType | null = now ? recommendedSessionFor(now) : null;
  const today = activeDate;

  const todaysLogged = useMemo(
    () => workouts.find((w) => w.date === today && w.completed),
    [workouts, today]
  );

  const thisWeekDone = useMemo(() => {
    if (!now) return new Set<SessionType>();
    const monday = mondayOf(now).getTime();
    const set = new Set<SessionType>();
    for (const w of workouts) {
      if (!w.completed) continue;
      if (w.startedAt >= monday) set.add(w.sessionType);
    }
    return set;
  }, [workouts, now]);

  const activeWorkout = useMemo(
    () => (activeId ? getWorkout(activeId) : null),
    [activeId]
  );
  const activeInProgress = activeWorkout && !activeWorkout.completed ? activeWorkout : null;

  const wkNum = now ? weekNumber(now) : 1;
  const dateStr = dateLabel;

  const filteredSessions = useMemo(
    () => SESSIONS.filter((s) => sessionMatches(query, s)),
    [query]
  );
  const filteredTemplates = useMemo(
    () => templates.filter((t) => templateMatches(query, t)),
    [templates, query]
  );

  function pickPreset(sessionType: SessionType) {
    if (activeInProgress && activeInProgress.sessionType === sessionType) {
      router.push(`/workout/session/${activeInProgress.id}`);
      return;
    }
    const w = startWorkout(sessionType, today);
    router.push(`/workout/session/${w.id}`);
  }

  function pickCustom(template: CustomTemplate) {
    if (
      activeInProgress &&
      activeInProgress.sessionType === "CUSTOM" &&
      activeInProgress.customTemplateId === template.id
    ) {
      router.push(`/workout/session/${activeInProgress.id}`);
      return;
    }
    const w = startCustomWorkout(template, today);
    router.push(`/workout/session/${w.id}`);
  }

  function handleSaveTemplate(t: Omit<CustomTemplate, "id" | "createdAt">) {
    const saved = saveCustomTemplate(t);
    setTemplates(getCustomTemplates());
    setModalOpen(false);
    pickCustom(saved);
  }

  function handleDeleteTemplate(id: string) {
    deleteCustomTemplate(id);
    setTemplates(getCustomTemplates());
  }

  return (
    <main className="workout-home">
      <div className="workout-home-top">
        <Link href="/" className="back-link">← Back</Link>
        <h1 className="section-title">LOG <span>WORKOUT</span></h1>
        <div className="wo-date mono">{dateStr} · WK {wkNum} / 12</div>

        <Link href="/workout/equipment" className="wo-equip-link mono">
          🏋️ BROWSE EQUIPMENT · 设备
        </Link>

        {todaysLogged && (
          <div className="wo-logged-banner">
            ✓ SESSION LOGGED TODAY
            <Link href={`/workout/session/${todaysLogged.id}`} className="wo-logged-link">
              VIEW
            </Link>
          </div>
        )}

        {activeInProgress && (
          <Link href={`/workout/session/${activeInProgress.id}`} className="wo-resume">
            ▶ RESUME {activeInProgress.sessionType === "CUSTOM"
              ? activeInProgress.customName ?? "CUSTOM"
              : SESSIONS.find((s) => s.id === activeInProgress.sessionType)?.name}
          </Link>
        )}

        <div className="wo-search">
          <input
            type="search"
            inputMode="search"
            placeholder="Search sessions or exercises"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="wo-search-input mono"
          />
          {query && (
            <button
              type="button"
              className="wo-search-clear"
              onClick={() => setQuery("")}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>
      </div>

      <div className="workout-home-bottom">
        <div className="wo-pick-label">PICK YOUR SESSION</div>

        {filteredSessions.length === 0 && filteredTemplates.length === 0 && (
          <div className="wo-empty mono">No sessions match &ldquo;{query}&rdquo;.</div>
        )}

        <div className="wo-session-grid">
          {filteredSessions.map((s, idx) => {
            const isRec = s.id === recommended;
            const done = thisWeekDone.has(s.id);
            const isLast = idx === filteredSessions.length - 1 && filteredSessions.length % 2 === 1;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => pickPreset(s.id)}
                className={`wo-sc${isRec ? " rec" : ""}${done ? " done" : ""}${isLast ? " wide" : ""}`}
              >
                <div className="wo-sc-top">
                  <div className="wo-sc-name">{s.name}</div>
                  <div className="wo-sc-focus mono">{s.focus}</div>
                </div>
                <div className="wo-sc-silhouette">
                  <SessionSilhouette highlight={s.primaryMuscles} />
                </div>
                <div className="wo-sc-bottom mono">
                  <span>{s.dayLabel}</span>
                  {done && <span className="wo-sc-done">✓ DONE</span>}
                </div>
              </button>
            );
          })}
        </div>

        <div className="wo-custom-head">
          <div className="wo-pick-label">MY SESSIONS</div>
          <button
            type="button"
            className="wo-add-custom mono"
            onClick={() => setModalOpen(true)}
          >
            + ADD CUSTOM
          </button>
        </div>

        {filteredTemplates.length === 0 ? (
          <button
            type="button"
            className="wo-custom-empty mono"
            onClick={() => setModalOpen(true)}
          >
            {query ? "No custom sessions match — " : "Build your own — "}
            <span className="wo-custom-empty-cta">tap to create</span>
          </button>
        ) : (
          <div className="wo-custom-grid">
            {filteredTemplates.map((t) => (
              <div key={t.id} className="wo-custom-card">
                <button
                  type="button"
                  className="wo-custom-body"
                  onClick={() => pickCustom(t)}
                >
                  <div className="wo-custom-name">{t.name}</div>
                  <div className="wo-custom-focus mono">{t.focus || "CUSTOM"}</div>
                  <div className="wo-custom-meta mono">
                    {t.exercises.length} exercise{t.exercises.length === 1 ? "" : "s"}
                  </div>
                </button>
                <button
                  type="button"
                  className="wo-custom-del"
                  onClick={() => handleDeleteTemplate(t.id)}
                  aria-label={`Delete ${t.name}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {modalOpen && (
        <CustomSessionModal
          onClose={() => setModalOpen(false)}
          onSave={handleSaveTemplate}
        />
      )}
    </main>
  );
}

// ---------------- Custom session modal ----------------

type DraftExercise = {
  name: string;
  sets: number;
  repsLabel: string;
  targetReps: number;
  restSec: number;
  primary: MuscleKey;
};

function defaultDraftExercise(name = ""): DraftExercise {
  return {
    name,
    sets: 3,
    repsLabel: "10",
    targetReps: 10,
    restSec: 60,
    primary: "chest",
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

const MUSCLE_OPTIONS: MuscleKey[] = [
  "chest",
  "frontDelt",
  "sideDelt",
  "rearDelt",
  "tricep",
  "bicep",
  "lats",
  "midBack",
  "traps",
  "quad",
  "hamstring",
  "glute",
  "calf",
  "abs",
];

function CustomSessionModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (t: Omit<CustomTemplate, "id" | "createdAt">) => void;
}) {
  const [name, setName] = useState("");
  const [focus, setFocus] = useState("");
  const [drafts, setDrafts] = useState<DraftExercise[]>([defaultDraftExercise()]);
  const [pickerFor, setPickerFor] = useState<number | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");

  const canSave =
    name.trim().length > 0 &&
    drafts.some((d) => d.name.trim().length > 0);

  function updateDraft(i: number, patch: Partial<DraftExercise>) {
    setDrafts((list) => list.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }
  function removeDraft(i: number) {
    setDrafts((list) => list.filter((_, idx) => idx !== i));
  }
  function addDraft() {
    setDrafts((list) => [...list, defaultDraftExercise()]);
  }

  const pickerMatches = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    const presetExercises = SESSIONS.flatMap((s) =>
      s.exercises.map((e) => ({ name: e.name, primary: e.primary[0] }))
    );
    const equipmentExercises = EQUIPMENT.map((e) => ({
      name: e.name,
      primary: muscleFromEquipmentGroup(e.muscleGroup),
    }));
    const all = [...presetExercises, ...equipmentExercises];
    const unique = new Map<string, { name: string; primary: MuscleKey }>();
    for (const x of all) if (!unique.has(x.name)) unique.set(x.name, x);
    const list = Array.from(unique.values());
    if (!q) return list.slice(0, 24);
    return list.filter((x) => x.name.toLowerCase().includes(q)).slice(0, 24);
  }, [pickerQuery]);

  function applyPick(i: number, name: string, primary: MuscleKey) {
    updateDraft(i, { name, primary });
    setPickerFor(null);
    setPickerQuery("");
  }

  function handleSave() {
    const exercises = drafts
      .filter((d) => d.name.trim().length > 0)
      .map(draftToExerciseDef);
    onSave({ name: name.trim(), focus: focus.trim() || "CUSTOM", exercises });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal wo-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">NEW CUSTOM SESSION</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <label className="field">
          <span>Name</span>
          <input
            type="text"
            placeholder="e.g. Arm blast"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </label>
        <label className="field">
          <span>Focus</span>
          <input
            type="text"
            placeholder="e.g. Biceps + triceps"
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
          />
        </label>

        <div className="field-label">Exercises</div>
        <div className="wo-draft-list">
          {drafts.map((d, i) => (
            <div key={i} className="wo-draft">
              <div className="wo-draft-row">
                <input
                  type="text"
                  className="wo-draft-name"
                  placeholder="Exercise name"
                  value={d.name}
                  onChange={(e) => updateDraft(i, { name: e.target.value })}
                />
                <button
                  type="button"
                  className="wo-draft-pick mono"
                  onClick={() => {
                    setPickerFor(i);
                    setPickerQuery("");
                  }}
                >
                  PICK
                </button>
                <button
                  type="button"
                  className="wo-draft-remove"
                  onClick={() => removeDraft(i)}
                  aria-label="Remove"
                >
                  ×
                </button>
              </div>
              <div className="wo-draft-row wo-draft-row-split">
                <label className="wo-draft-mini">
                  <span className="mono">SETS</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={d.sets}
                    onChange={(e) =>
                      updateDraft(i, { sets: Math.max(1, Number(e.target.value) || 1) })
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
                  <span className="mono">REST</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={15}
                    value={d.restSec}
                    onChange={(e) =>
                      updateDraft(i, { restSec: Math.max(0, Number(e.target.value) || 0) })
                    }
                  />
                </label>
              </div>
              <label className="wo-draft-muscle">
                <span className="mono">PRIMARY MUSCLE</span>
                <select
                  value={d.primary}
                  onChange={(e) => updateDraft(i, { primary: e.target.value as MuscleKey })}
                >
                  {MUSCLE_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {MUSCLE_LABEL[m]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ))}
        </div>

        <button type="button" className="wo-add-draft" onClick={addDraft}>
          + ADD EXERCISE
        </button>

        <div className="modal-actions">
          <button className="save ghost" onClick={onClose}>Cancel</button>
          <button className="save" disabled={!canSave} onClick={handleSave}>
            Save &amp; start
          </button>
        </div>

        {pickerFor !== null && (
          <div className="wo-picker-overlay" onClick={() => setPickerFor(null)}>
            <div className="wo-picker" onClick={(e) => e.stopPropagation()}>
              <div className="wo-picker-head">
                <input
                  type="search"
                  placeholder="Search exercises"
                  value={pickerQuery}
                  onChange={(e) => setPickerQuery(e.target.value)}
                  autoFocus
                />
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => setPickerFor(null)}
                >
                  ×
                </button>
              </div>
              <div className="wo-picker-list">
                {pickerMatches.length === 0 && (
                  <div className="wo-picker-empty mono">No matches.</div>
                )}
                {pickerMatches.map((m) => (
                  <button
                    key={m.name}
                    type="button"
                    className="wo-picker-row"
                    onClick={() => applyPick(pickerFor, m.name, m.primary)}
                  >
                    <span>{m.name}</span>
                    <span className="mono wo-picker-muscle">{MUSCLE_LABEL[m.primary]}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function muscleFromEquipmentGroup(group: string): MuscleKey {
  const g = group.toUpperCase();
  if (g.includes("CHEST")) return "chest";
  if (g.includes("UPPER CHEST")) return "chest";
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
