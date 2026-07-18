"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  EQUIPMENT,
  EQUIPMENT_CATEGORIES,
  searchEquipment,
  type EquipmentCategory,
} from "@/lib/equipment";

type Filter = "ALL" | EquipmentCategory;

export default function EquipmentPage() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [openId, setOpenId] = useState<string | null>(null);

  const results = useMemo(() => {
    const base = filter === "ALL" ? EQUIPMENT : EQUIPMENT.filter((e) => e.category === filter);
    return searchEquipment(query, base);
  }, [query, filter]);

  return (
    <main className="equipment-page">
      <div className="equipment-top">
        <Link href="/workout" className="back-link">← LATIHAN</Link>
        <h1 className="section-title">EQUIPMENT</h1>
        <div className="eq-count mono">{results.length} / {EQUIPMENT.length}</div>

        <input
          type="search"
          className="eq-search"
          placeholder="Search English, 中文, or pinyin…"
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
            return (
              <div
                key={e.id}
                className="eq-card"
                onClick={hasHowTo ? () => setOpenId(open ? null : e.id) : undefined}
                style={hasHowTo ? { cursor: "pointer" } : undefined}
              >
                <div className="eq-card-body">
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    <div className="eq-card-name">{e.name}</div>
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
