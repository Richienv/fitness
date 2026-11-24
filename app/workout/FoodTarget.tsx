"use client";
// Latihan's answer to "what does today's training do to what I can eat?".
// The target is the day's own target plus what training earned (lib/dayBudget):
// a normal gym day adds nothing because its target already carries training;
// extra burn, or cardio on a rest day, adds a share the user picks here.
import { useId, useMemo, useState } from "react";
import { useActiveDate } from "@/lib/activeDate";
import { dayTarget } from "@/lib/dayBudgetData";
import { EAT_BACK_OPTIONS, MAX_BONUS_KCAL } from "@/lib/dayBudget";
import { patchSettings } from "@/lib/settings";
import { syncResolvedTargets } from "@/lib/targetSync";
import { TARGETS } from "@/lib/targets";

const fmt = (n: number) => Math.round(n).toLocaleString("id-ID");
const pct = (v: number) => (v === 0 ? "Tidak" : `${Math.round(v * 100)}%`);

export default function FoodTarget({ burnKcal }: { burnKcal: number }) {
  const { activeDate } = useActiveDate();
  const [tick, setTick] = useState(0);
  const labelId = useId();
  const adj = useMemo(
    () => (activeDate ? dayTarget(activeDate) : null),
    // burnKcal changes when an activity is added or removed
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeDate, tick, burnKcal],
  );
  if (!adj) return null;
  const { eatBack, bonusKcal, base } = adj;
  const restKcal = TARGETS.restDay.kcal;
  const isTrainingTarget = base.kcal > restKcal;
  // What the gym-day target already assumes, in kcal burned.
  const assumed = eatBack > 0 ? Math.round((base.kcal - restKcal) / eatBack / 10) * 10 : 0;

  let why: string;
  if (eatBack === 0) {
    why = "Kalori latihan tidak menambah target makan.";
  } else if (bonusKcal > 0) {
    why = isTrainingTarget
      ? `Target hari latihan sudah memperhitungkan latihan ±${fmt(assumed)} kkal. Kelebihannya ditambah ${pct(eatBack)}: +${fmt(bonusKcal)} kkal.`
      : `${pct(eatBack)} dari ≈ ${fmt(adj.burnKcal)} kkal yang terbakar ditambahkan: +${fmt(bonusKcal)} kkal.`;
  } else if (isTrainingTarget) {
    why = `Target hari latihan sudah memperhitungkan latihan ±${fmt(assumed)} kkal. Kalau terbakar lebih, kelebihannya ditambah ${pct(eatBack)} di sini.`;
  } else {
    why = `Hari istirahat. Catat langkah atau latihan: ${pct(eatBack)} dari kalori yang terbakar ditambahkan ke target.`;
  }

  if (bonusKcal >= MAX_BONUS_KCAL) why += ` Batas tambahan ${fmt(MAX_BONUS_KCAL)} kkal per hari.`;

  return (
    <div className="lt-food">
      <div className="lt-food-head">
        <h3>Target makan hari ini</h3>
        <strong>{fmt(adj.target.kcal)} kkal</strong>
      </div>
      <p>
        {bonusKcal > 0 && (
          <span className="lt-food-bonus">Termasuk +{fmt(bonusKcal)} kkal dari latihan. </span>
        )}
        {why}
      </p>
      <div className="lt-food-set">
        <span id={labelId}>Tambahkan kalori latihan ke target</span>
        <div className="segment" role="group" aria-labelledby={labelId}>
          {EAT_BACK_OPTIONS.map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={eatBack === v}
              onClick={() => {
                patchSettings({ exerciseEatBack: v });
                syncResolvedTargets();
                setTick((t) => t + 1);
                window.dispatchEvent(new Event("r2:data"));
              }}
            >
              {pct(v)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
