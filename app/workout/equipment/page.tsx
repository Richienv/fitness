"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  EQUIPMENT,
  EQUIPMENT_CATEGORIES,
  searchEquipment,
  type Equipment,
  type EquipmentCategory,
} from "@/lib/equipment";
import { startQuickExercise } from "@/lib/workouts";
import { recordMachinePick, getPickRank } from "@/lib/machinePicks";
import { inferLevel } from "@/lib/difficulty";
import { inferFromLog, dimHint } from "@/lib/gymInventory";
import { todayKey } from "@/lib/targets";

type Filter = "ALL" | EquipmentCategory;

export default function EquipmentPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [openId, setOpenId] = useState<string | null>(null);
  const beginner = inferLevel() === "beginner";

  // Tap a machine → remember it, start (or append to) a quick single-exercise
  // session, and jump straight into logging sets. No session picking.
  const logMachine = (e: Equipment) => {
    recordMachinePick(e);
    inferFromLog(e.id); // learn what's in your gym, silently
    const { id } = startQuickExercise(e, todayKey());
    router.push(`/workout/session/${id}`);
  };

  const results = useMemo(() => {
    const base = filter === "ALL" ? EQUIPMENT : EQUIPMENT.filter((e) => e.category === filter);
    return searchEquipment(query, base, getPickRank());
  }, [query, filter]);

  return (
    <main className="equipment-page">
      <div className="equipment-top">
        <Link href="/workout" className="back-link">← LATIHAN</Link>
        <h1 className="section-title">EQUIPMENT</h1>
        <div className="eq-count mono">{results.length} / {EQUIPMENT.length}</div>
        <div
          className="mono"
          style={{
            fontSize: 10,
            letterSpacing: ".06em",
            color: "#8a837d",
            marginTop: 2,
          }}
        >
          Cari mesin · tap ＋CATAT buat langsung latihan
        </div>

        <input
          type="search"
          className="eq-search"
          placeholder="Cari mesin — inner thigh, chest, 内弯…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />

        <div className="eq-filters">
          <button
            type="button"
            className={`eq-chip${filter === "ALL" ? " active" : ""}`}
            onClick={() => setFilter("ALL")}
          >
            ALL
          </button>
          {EQUIPMENT_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              className={`eq-chip${filter === c ? " active" : ""}`}
              onClick={() => setFilter(c)}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="eq-list">
        {results.length === 0 ? (
          <div className="eq-empty mono">No equipment matches.</div>
        ) : (
          results.map((e) => {
            const hasHowTo = !!e.instructions;
            const open = openId === e.id;
            const dim = dimHint(e.id); // owned-gym evidence exists and this isn't in it
            const coach = beginner && e.category === "BARBELL"; // free-weight, needs a coach
            return (
              <div
                key={e.id}
                className="eq-card"
                onClick={hasHowTo ? () => setOpenId(open ? null : e.id) : undefined}
                style={{
                  ...(hasHowTo ? { cursor: "pointer" } : {}),
                  ...(dim ? { opacity: 0.5 } : {}),
                }}
              >
                <div className="eq-card-body">
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    <div className="eq-card-name" style={{ flex: 1, minWidth: 0 }}>
                      {e.name}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        flex: "none",
                      }}
                    >
                      <button
                        type="button"
                        className="mono eq-log-btn"
                        aria-label={`Catat latihan ${e.name}`}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          logMachine(e);
                        }}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 9.5,
                          fontWeight: 700,
                          letterSpacing: ".1em",
                          color: "#fff",
                          cursor: "pointer",
                          borderRadius: 999,
                          padding: "5px 11px",
                          whiteSpace: "nowrap",
                          background:
                            "linear-gradient(180deg,#ff8a52,#ee3c30 60%,#c01f12)",
                          border: "1px solid rgba(255,150,120,.5)",
                          boxShadow:
                            "inset 0 1px 1px rgba(255,225,205,.4),0 4px 10px rgba(238,60,48,.35)",
                        }}
                      >
                        ＋ CATAT
                      </button>
                    {hasHowTo && (
                      <span
                        className="mono eq-howto-chip"
                        aria-label={open ? "Tutup cara pakai" : "Lihat cara pakai"}
                        style={{
                          flex: "none",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          fontSize: 9,
                          letterSpacing: ".1em",
                          color: open ? "#ff8a72" : "#ffb59c",
                          background: open
                            ? "rgba(255,138,114,.14)"
                            : "rgba(255,138,114,.08)",
                          border: open
                            ? "1px solid rgba(255,150,120,.6)"
                            : "1px solid rgba(255,150,120,.32)",
                          borderRadius: 999,
                          padding: "4px 9px 4px 7px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            fontSize: 11,
                            lineHeight: 1,
                            fontStyle: "normal",
                          }}
                        >
                          ⓘ
                        </span>
                        {open ? "TUTUP ▴" : "CARA ▾"}
                      </span>
                    )}
                    </div>
                  </div>
                  <div className="eq-card-cn">
                    {e.hanzi} · {e.pinyin}
                  </div>
                  <div className="eq-card-meta mono">
                    <span className="eq-muscle">{e.muscleGroup}</span>
                    <span className="eq-dot">·</span>
                    <span className="eq-cat">{e.category}</span>
                    {e.secondary && e.secondary.length > 0 && (
                      <>
                        <span className="eq-dot">·</span>
                        <span className="eq-secondary">{e.secondary.join(", ")}</span>
                      </>
                    )}
                  </div>
                  {(coach || dim) && (
                    <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                      {coach && (
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
                            padding: "2px 7px",
                          }}
                        >
                          ⚠ PERLU COACH
                        </span>
                      )}
                      {dim && (
                        <span
                          className="mono"
                          style={{ fontSize: 8, letterSpacing: ".06em", color: "#8a837d" }}
                        >
                          mungkin nggak ada di gym-mu
                        </span>
                      )}
                    </div>
                  )}
                  {open && e.instructions && (
                    <div
                      style={{
                        marginTop: 10,
                        paddingTop: 10,
                        borderTop: "1px solid rgba(255,255,255,.1)",
                        fontFamily: "var(--font-dm-sans), sans-serif",
                        fontSize: 13,
                        lineHeight: 1.55,
                        color: "#d8d2cc",
                      }}
                    >
                      <div
                        className="mono"
                        style={{
                          fontSize: 9,
                          letterSpacing: ".14em",
                          color: "#ff8a72",
                          marginBottom: 5,
                        }}
                      >
                        CARA PAKAI
                      </div>
                      {e.instructions}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </main>
  );
}
