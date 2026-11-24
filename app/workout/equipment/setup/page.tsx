"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  EQUIPMENT,
  EQUIPMENT_CATEGORIES,
  type EquipmentCategory,
} from "@/lib/equipment";
import {
  getInventory,
  setOwned,
  toggleAll,
  markPicked,
} from "@/lib/gymInventory";
import Icon from "../../../ui/Icon";
import "../../equipment-calm.css";

const CATEGORY_ID: Record<EquipmentCategory, string> = {
  MACHINE: "Mesin",
  CABLE: "Kabel",
  BARBELL: "Barbel",
  DUMBBELL: "Dumbel",
  BODYWEIGHT: "Berat badan",
  CARDIO: "Kardio",
};
const MUSCLE_ID: Record<string, string> = {
  CHEST: "Dada",
  "UPPER CHEST": "Dada atas",
  LATS: "Punggung (lat)",
  "MIDDLE BACK": "Punggung tengah",
  "LOWER BACK": "Punggung bawah",
  "FRONT DELT": "Bahu depan",
  "SIDE DELT": "Bahu samping",
  "REAR DELT": "Bahu belakang",
  BICEPS: "Bisep",
  TRICEPS: "Trisep",
  QUADS: "Paha depan",
  GLUTES: "Bokong",
  HAMSTRINGS: "Paha belakang",
  "INNER THIGH": "Paha dalam",
  CALVES: "Betis",
  ABS: "Perut",
  "LOWER ABS": "Perut bawah",
  CARDIO: "Kardio",
};

export default function GymSetupPage() {
  const router = useRouter();
  // Local mirror so toggles feel instant; writes go straight to the store too.
  const [owned, setOwnedState] = useState<Record<string, true>>(
    () => getInventory().owned
  );

  const byCategory = useMemo(() => {
    const m = new Map<EquipmentCategory, typeof EQUIPMENT>();
    for (const c of EQUIPMENT_CATEGORIES) m.set(c, []);
    for (const e of EQUIPMENT) m.get(e.category)?.push(e);
    return m;
  }, []);

  const ownedCount = EQUIPMENT.filter((e) => owned[e.id]).length;

  function toggleOne(id: string) {
    const on = !owned[id];
    setOwned(id, on);
    setOwnedState((prev) => {
      const next = { ...prev };
      if (on) next[id] = true;
      else delete next[id];
      return next;
    });
  }

  function toggleCategory(cat: EquipmentCategory, on: boolean) {
    toggleAll(cat, on);
    setOwnedState((prev) => {
      const next = { ...prev };
      for (const e of byCategory.get(cat) ?? []) {
        if (on) next[e.id] = true;
        else delete next[e.id];
      }
      return next;
    });
  }

  function save() {
    markPicked();
    router.push("/workout/equipment");
  }

  return (
    <main className="lt-eq">
      <div className="lt-eq-hero">
        <Link href="/workout/equipment" className="lt-eq-back">
          <Icon name="arrow" size={18} />
          Alat gym
        </Link>
        <h1>Alat gym-ku</h1>
        <p className="lt-eq-lead">
          Pilih alat yang ada di gym-mu. Alat lainnya ditandai di daftar alat.
        </p>
      </div>

      {EQUIPMENT_CATEGORIES.map((cat) => {
        const rows = byCategory.get(cat) ?? [];
        if (rows.length === 0) return null;
        const chosen = rows.filter((e) => owned[e.id]).length;
        const allOn = chosen === rows.length;
        const label = CATEGORY_ID[cat];
        return (
          <section key={cat} className="lt-eq-group" aria-labelledby={`lt-eq-g-${cat}`}>
            <div className="lt-eq-grouphead">
              <h2 id={`lt-eq-g-${cat}`}>
                {label}{" "}
                <small>
                  {chosen} dari {rows.length}
                </small>
              </h2>
              <button
                type="button"
                aria-label={`${allOn ? "Kosongkan" : "Pilih semua"} ${label.toLowerCase()}`}
                onClick={() => toggleCategory(cat, !allOn)}
              >
                {allOn ? "Kosongkan" : "Pilih semua"}
              </button>
            </div>
            <ul className="lt-eq-checks">
              {rows.map((e) => {
                const on = !!owned[e.id];
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      className="lt-eq-check"
                      onClick={() => toggleOne(e.id)}
                    >
                      <span className="lt-eq-check-text">
                        <strong>{e.name}</strong>
                        <small>{MUSCLE_ID[e.muscleGroup] ?? e.muscleGroup}</small>
                      </span>
                      <span className="lt-eq-box" aria-hidden="true">
                        <Icon name="check" size={18} />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <div className="lt-eq-bar">
        <p role="status" aria-live="polite">
          Dipilih {ownedCount} dari {EQUIPMENT.length}
        </p>
        <button type="button" className="lt-eq-btn primary" onClick={save}>
          Simpan
        </button>
      </div>
    </main>
  );
}
