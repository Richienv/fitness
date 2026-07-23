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

  const ownedCount = Object.keys(owned).length;

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
    router.push("/workout");
  }

  return (
    <main className="equipment-page">
      <div className="equipment-top">
        <Link href="/workout" className="back-link">← LATIHAN</Link>
        <h1 className="section-title">ALAT GYM-KU</h1>
        <div
          className="mono"
          style={{ fontSize: 10, letterSpacing: ".06em", color: "#8a837d", marginTop: 2 }}
        >
          Pilih yang ada di gym-mu · {ownedCount} dipilih · rekomendasi bakal ngikut
        </div>
      </div>

      <div className="eq-list">
        {EQUIPMENT_CATEGORIES.map((cat) => {
          const rows = byCategory.get(cat) ?? [];
          if (rows.length === 0) return null;
          const allOn = rows.every((e) => owned[e.id]);
          return (
            <div key={cat} style={{ marginBottom: 18 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  margin: "6px 2px 8px",
                }}
              >
                <span
                  className="mono"
                  style={{ fontSize: 10, letterSpacing: ".14em", color: "#9a938d" }}
                >
                  {cat}
                </span>
                <button
                  type="button"
                  className="mono"
                  onClick={() => toggleCategory(cat, !allOn)}
                  style={{
                    fontSize: 9,
                    letterSpacing: ".1em",
                    padding: "5px 10px",
                    borderRadius: 999,
                    cursor: "pointer",
                    color: allOn ? "#ff8a72" : "#cfc8c2",
                    background: allOn ? "rgba(255,138,114,.12)" : "rgba(255,255,255,.04)",
                    border: allOn
                      ? "1px solid rgba(255,150,120,.5)"
                      : "1px solid rgba(255,255,255,.14)",
                  }}
                >
                  {allOn ? "✓ SEMUA" : "PILIH SEMUA"}
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {rows.map((e) => {
                  const on = !!owned[e.id];
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => toggleOne(e.id)}
                      aria-pressed={on}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                        width: "100%",
                        textAlign: "left",
                        cursor: "pointer",
                        padding: "11px 14px",
                        borderRadius: 12,
                        background: on
                          ? "linear-gradient(180deg,rgba(255,138,60,.12),rgba(255,138,60,.03))"
                          : "#0e0c0d",
                        border: on
                          ? "1px solid rgba(255,150,120,.45)"
                          : "1px solid rgba(255,255,255,.09)",
                      }}
                    >
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span
                          style={{
                            display: "block",
                            fontWeight: 700,
                            fontSize: 13.5,
                            color: on ? "#ffe3d3" : "#cfc8c2",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {e.name}
                        </span>
                        <span
                          className="mono"
                          style={{ display: "block", fontSize: 9, color: "#8a837d", marginTop: 2 }}
                        >
                          {e.muscleGroup}
                        </span>
                      </span>
                      <span
                        aria-hidden="true"
                        style={{
                          flex: "none",
                          width: 22,
                          height: 22,
                          borderRadius: 7,
                          display: "grid",
                          placeItems: "center",
                          fontSize: 13,
                          color: on ? "#fff" : "transparent",
                          background: on
                            ? "linear-gradient(180deg,#ff8a52,#ee3c30 60%,#c01f12)"
                            : "transparent",
                          border: on ? "none" : "1px solid rgba(255,255,255,.25)",
                        }}
                      >
                        ✓
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          position: "sticky",
          bottom: 0,
          display: "flex",
          gap: 10,
          padding: "12px 0 calc(18px + env(safe-area-inset-bottom))",
          background: "linear-gradient(180deg,transparent,#0a0809 40%)",
        }}
      >
        <Link
          href="/workout"
          className="mono"
          style={{
            flex: "0 0 auto",
            padding: "13px 18px",
            borderRadius: 13,
            fontSize: 12,
            letterSpacing: ".1em",
            color: "#cfc8c2",
            textDecoration: "none",
            background: "rgba(255,255,255,.05)",
            border: "1px solid rgba(255,255,255,.14)",
          }}
        >
          NANTI
        </Link>
        <button
          type="button"
          onClick={save}
          className="mono"
          style={{
            flex: 1,
            padding: "13px 0",
            borderRadius: 13,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: ".1em",
            color: "#fff",
            cursor: "pointer",
            background: "linear-gradient(180deg,#ff8a52,#ee3c30 60%,#c01f12)",
            border: "1px solid rgba(255,150,120,.5)",
          }}
        >
          SIMPAN ✓
        </button>
      </div>
    </main>
  );
}
