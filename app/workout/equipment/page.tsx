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

  const results = useMemo(() => {
    const base = filter === "ALL" ? EQUIPMENT : EQUIPMENT.filter((e) => e.category === filter);
    return searchEquipment(query, base);
  }, [query, filter]);

  return (
    <main className="equipment-page">
      <div className="equipment-top">
        <Link href="/workout" className="back-link">← WORKOUT</Link>
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
          results.map((e) => (
            <div key={e.id} className="eq-card">
              <div className="eq-card-body">
                <div className="eq-card-name">{e.name}</div>
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
              </div>
            </div>
          ))
        )}
      </div>
    </main>
  );
}
