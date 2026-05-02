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
import {
  MUSCLE_LABEL,
  MUSCLE_TO_GROUP,
  type MuscleColorGroup,
  type MuscleKey,
} from "@/lib/muscles";
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

        {/* Compact toolbar — search input + browse-equipment chip on the
            same row, with a resume strip slotting in only when a workout
            is mid-flight. */}
        <div className="wo-toolbar">
          <div className="wo-search wo-toolbar-search">
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
          <Link
            href="/workout/equipment"
            className="wo-equip-link wo-toolbar-equip mono"
            aria-label="Browse equipment"
          >
            <span aria-hidden="true">🏋️</span>
            <span className="wo-toolbar-equip-text">EQUIPMENT</span>
          </Link>
        </div>

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
                  {s.aesthetic && (
                    <div className="wo-sc-aesthetic">{s.aesthetic}</div>
                  )}
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

        <div className="wo-pick-label">MY SESSIONS</div>

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
          <button
            type="button"
            className="wo-add-card"
            onClick={() => setModalOpen(true)}
          >
            <span className="wo-add-card-plus" aria-hidden="true">+</span>
            <span className="wo-add-card-title">ADD CUSTOM</span>
            <span className="wo-add-card-sub mono">
              {filteredTemplates.length === 0
                ? "Build your first"
                : "Build another"}
            </span>
          </button>
        </div>
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

type CatalogEntry = { name: string; primary: MuscleKey };

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
  { key: "chest",     label: "Chest",     emoji: "💪" },
  { key: "back",      label: "Back",      emoji: "🦾" },
  { key: "shoulders", label: "Shoulders", emoji: "🛡️" },
  { key: "arms",      label: "Arms",      emoji: "💥" },
  { key: "legs",      label: "Legs",      emoji: "🦵" },
  { key: "abs",       label: "Abs",       emoji: "🔥" },
];

function buildCatalog(): CatalogEntry[] {
  const seen = new Map<string, CatalogEntry>();
  for (const s of SESSIONS) {
    for (const e of s.exercises) {
      const entry = { name: e.name, primary: e.primary[0] };
      if (!seen.has(entry.name)) seen.set(entry.name, entry);
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

  function toggleGroup(g: MuscleColorGroup) {
    setSelectedGroups((list) =>
      list.includes(g) ? list.filter((x) => x !== g) : [...list, g]
    );
  }

  const added = useMemo(() => new Set(drafts.map((d) => d.name.toLowerCase())), [drafts]);

  const recommendations = useMemo<CatalogEntry[]>(() => {
    if (selectedGroups.length === 0) return [];
    const set = new Set<MuscleColorGroup>(selectedGroups);
    return catalog
      .filter((c) => set.has(MUSCLE_TO_GROUP[c.primary]))
      .filter((c) => !added.has(c.name.toLowerCase()));
  }, [catalog, selectedGroups, added]);

  const searchMatches = useMemo<CatalogEntry[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return catalog
      .filter((c) => c.name.toLowerCase().includes(q))
      .filter((c) => !added.has(c.name.toLowerCase()))
      .slice(0, 12);
  }, [catalog, query, added]);

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
      ? "Pick a focus muscle"
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
      <div
        className="modal wo-modal wo-modal-fast"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head wo-modal-head-sticky">
          <div className="modal-title-block">
            <input
              type="text"
              className="wo-modal-name"
              value={name}
              placeholder="Session name"
              onChange={(e) => setNameOverride(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
            />
            <div className="wo-modal-focus mono">{focusLabel}</div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="wo-modal-scroll">
          <div className="wo-step-label mono">1 · PICK MUSCLES</div>
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
              <div className="wo-step-label mono">2 · RECOMMENDED · TAP TO ADD</div>
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
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="wo-step-label mono">
            {selectedGroups.length > 0 ? "3 · " : ""}OR SEARCH ANYTHING
          </div>
          <div className="wo-search-row">
            <input
              type="search"
              placeholder="Search exercise or equipment"
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
                <div className="wo-reco-empty mono">No matches</div>
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
                </button>
              ))}
            </div>
          )}

          <div className="wo-step-label mono">
            {drafts.length > 0 ? `IN YOUR SESSION (${drafts.length})` : "NOTHING ADDED YET"}
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
            Cancel
          </button>
          <button className="save" disabled={!canSave} onClick={handleSave}>
            {canSave ? `Start · ${drafts.length}` : "Add one exercise"}
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
