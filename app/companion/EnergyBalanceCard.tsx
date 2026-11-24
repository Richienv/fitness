"use client";
// The Home screen's main feature: real-time body weight AND pure fat change
// per second and per meal. Pure physiology maths in lib/energyBalance.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  GLYCOGEN_MAX_KCAL,
  KCAL_PER_KG_FAT,
  KCAL_PER_KG_TISSUE,
  dayFractionCST,
  energyBalance,
  type WeightDelta,
} from "@/lib/energyBalance";
import type { EnergyView } from "@/lib/energyBalanceData";
import "./energy-balance.css";

type BalanceMode = "stop" | "now" | "target";

const idInt = (n: number) => Math.round(Math.abs(n)).toLocaleString("id-ID");
const dec = (n: number, d = 2) =>
  Math.abs(n).toLocaleString("id-ID", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });

/** Signed kg string, e.g. "−0,41" (2 dp) or "−0,1842" (4 dp for live ticking). */
function signedKg(kg: number, digits = 2): string {
  if (Math.abs(kg) < Math.pow(10, -digits) / 2) return dec(0, digits);
  const sign = kg > 0 ? "−" : "+";
  return `${sign}${dec(kg, digits)}`;
}

/** "−65 g" under a kilo, "−1,2 kg" above it; positive input = lost. */
function massText(grams: number): string {
  const a = Math.abs(grams);
  if (a < 0.5) return "0 g";
  const sign = grams > 0 ? "−" : "+";
  return a >= 1000 ? `${sign}${dec(a / 1000, 2)} kg` : `${sign}${Math.round(a)} g`;
}

/** "+152 g" or "+0,15 kg" for meal additions. */
function addedKgText(grams: number): string {
  if (grams < 1) return "+0 g";
  return grams >= 100 ? `+${dec(grams / 1000, 2)} kg` : `+${Math.round(grams)} g`;
}

function durationText(minutes: number): string {
  if (minutes <= 0) return "0 mnt";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} mnt`;
  return m === 0 ? `${h} jam` : `${h}j ${m}m`;
}

function formatKgPerSec(kgPerSec: number): string {
  const mg = kgPerSec * 1_000_000;
  return `−${kgPerSec.toLocaleString("id-ID", {
    minimumFractionDigits: 6,
    maximumFractionDigits: 6,
  })} kg/dtk (−${mg.toLocaleString("id-ID", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} mg/dtk)`;
}

export default function EnergyBalanceCard({ view }: { view: EnergyView }) {
  const [mode, setMode] = useState<BalanceMode>("stop");
  const [tick, setTick] = useState<number | null>(null);

  const isToday = view.status === "ok" && view.isToday;

  // Lightweight 1-second clock tick for live per-second burn without re-reading localStorage.
  useEffect(() => {
    if (!isToday) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      setTick(Date.now());
      timer = setInterval(() => setTick(Date.now()), 1000);
    };
    const stop = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };
    if (!document.hidden) start();
    const onVis = () => {
      if (document.hidden) stop();
      else start();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [isToday]);

  const liveBalance = useMemo(() => {
    if (view.status !== "ok") return null;
    if (!view.isToday || tick === null) return view.balance;
    return (
      energyBalance({
        ...view.input,
        dayFraction: dayFractionCST(new Date(tick)),
      }) ?? view.balance
    );
  }, [view, tick]);

  if (view.status === "profile" || !liveBalance) {
    return (
      <section className="eb" aria-labelledby="eb-title">
        <h2 id="eb-title">Perkiraan berat badan real time</h2>
        <p className="eb-lead">
          Lengkapi jenis kelamin, tinggi dan umur untuk melihat berapa kg berat badan &amp; lemak
          yang turun per detik dan setiap kali kamu makan.
        </p>
        <Link href="/settings" className="primary-button eb-cta">
          Lengkapi data tubuh
        </Link>
      </section>
    );
  }

  const b = liveBalance;
  const { weeks, targetKg, fromHealth, kg, meals, foodMassGrams } = view;
  const activeMode: BalanceMode = !view.isToday && mode === "now" ? "stop" : mode;

  const current: WeightDelta =
    activeMode === "now"
      ? b.soFar.weight
      : activeMode === "target"
        ? b.onPlan
        : b.stopEating;

  const isLiveMode = activeMode === "now" && view.isToday;
  const heroDigits = isLiveMode ? 4 : 2;
  const near = !isLiveMode && Math.abs(current.kcal) < 30;
  const losing = current.kcal > 0;
  const direction = near
    ? "seimbang"
    : losing
      ? "berat turun"
      : "berat naik";

  const modeSubtitle =
    activeMode === "stop"
      ? view.isToday
        ? "Kalau tidak makan lagi sampai malam"
        : "Dari total makan & bakar hari itu"
      : activeMode === "now"
        ? "Akumulasi bakar s.d. detik ini dikurangi makan"
        : b.intakeFrom === "eaten"
          ? "Dari makanan yang tercatat"
          : "Kalau sisa makan hari ini sesuai target";

  const closing = b.intakeFrom === "eaten";
  const shownIntake =
    activeMode === "target" ? b.intake : b.soFar.eaten;
  const shownBurn =
    activeMode === "now" ? b.soFar.burn : b.burnDay;
  const shownBalance =
    activeMode === "now"
      ? b.soFar.balance
      : activeMode === "target"
        ? b.balance
        : Math.round(b.stopEating.kcal);

  return (
    <section className="eb" aria-labelledby="eb-title">
      <div className="eb-head">
        <h2 id="eb-title">Berat badan real time</h2>
        {view.isToday ? (
          <span className="eb-live" aria-label="Diperbarui tiap detik">
            <span className="eb-dot" aria-hidden="true" />
            Live · per detik
          </span>
        ) : (
          <span className="eb-tag">Arsip hari ini</span>
        )}
      </div>

      <div className="eb-tabs" role="tablist" aria-label="Mode perhitungan berat badan">
        <button
          type="button"
          role="tab"
          aria-selected={activeMode === "stop"}
          className={activeMode === "stop" ? "is-active" : undefined}
          onClick={() => setMode("stop")}
        >
          Kalau stop makan
        </button>
        {view.isToday && (
          <button
            type="button"
            role="tab"
            aria-selected={activeMode === "now"}
            className={activeMode === "now" ? "is-active" : undefined}
            onClick={() => setMode("now")}
          >
            Detik ini
          </button>
        )}
        <button
          type="button"
          role="tab"
          aria-selected={activeMode === "target"}
          className={activeMode === "target" ? "is-active" : undefined}
          onClick={() => setMode("target")}
        >
          Sesuai target
        </button>
      </div>

      <p className="eb-mode-hint">{modeSubtitle}</p>

      <div className="eb-hero-row">
        <p
          className="eb-hero"
          aria-label={`${signedKg(current.bodyKg, heroDigits)} kg ${direction}`}
        >
          <strong className={losing && !near ? "down" : !losing && !near ? "up" : undefined}>
            {near ? "≈ 0,00" : signedKg(current.bodyKg, heroDigits)}
          </strong>
          <span>
            kg · {direction}
          </span>
        </p>
        <div className="eb-est-weight">
          <small>{activeMode === "now" ? "Est. sekarang" : "Est. berat"}</small>
          <strong>
            {dec(current.weightKg, isLiveMode ? 3 : 2)} <small>kg</small>
          </strong>
          <span>dari {dec(kg, 1)} kg</span>
        </div>
      </div>

      <div className="eb-split" aria-label="Rincian berat badan dan lemak">
        <div className="eb-pill">
          <small>Lemak murni</small>
          <strong className={losing && !near ? "down" : undefined}>
            {massText(current.fatGrams)}
          </strong>
          <span>{signedKg(current.fatKg, 3)} kg</span>
        </div>
        <div className="eb-pill">
          <small>Glikogen &amp; air terikat</small>
          <strong>{massText(current.glycogenWaterGrams)}</strong>
          <span>cadangan gula + 3× air</span>
        </div>
      </div>

      {view.isToday && (
        <div className="eb-rate" aria-label="Kecepatan turun per detik saat tidak makan">
          <div className="eb-rate-head">
            <span>Laju turun saat tidak makan</span>
            <strong>−{dec(b.rate.bodyGramsPerHour, 1)} g/jam</strong>
          </div>
          <p className="eb-rate-detail">
            Berat badan: <strong>{formatKgPerSec(b.rate.bodyKgPerSecond)}</strong>
          </p>
          <p className="eb-rate-detail quiet">
            Lemak murni: −{dec(b.rate.fatGramsPerHour, 1)} g/jam · Energi:{" "}
            {dec(b.rate.kcalPerMinute, 2)} kkal/mnt ({dec(b.rate.kcalPerSecond, 3)} kkal/dtk)
          </p>
        </div>
      )}

      <p className="eb-sub">
        {near
          ? "Makan dan pembakaranmu hampir seimbang."
          : `${shownBalance >= 0 ? "Defisit" : "Surplus"} ${idInt(shownBalance)} kkal`}
        {activeMode !== "now" &&
          Math.abs(activeMode === "stop" ? b.stopEating.kgPerWeekBody : b.bodyKgPerWeek) >= 0.05 && (
            <>
              {" "}
              · laju stabil ≈{" "}
              {dec(activeMode === "stop" ? b.stopEating.kgPerWeekBody : b.bodyKgPerWeek)} kg berat (
              {dec(activeMode === "stop" ? b.stopEating.kgPerWeekFat : b.kgPerWeek)} kg lemak){" "}
              {shownBalance >= 0 ? "turun" : "naik"}/minggu
            </>
          )}
      </p>

      {weeks !== null && targetKg !== null && activeMode === "target" && (
        <p className="eb-goal">
          Menuju {dec(targetKg, 1)} kg: sekitar {weeks} minggu lagi di laju target ini.
        </p>
      )}

      <section className="eb-meals" aria-label="Dampak tiap makan hari ini">
        <div className="eb-meals-head">
          <h3>Dampak per makan</h3>
          <span>
            {meals.length > 0
              ? `${meals.length} makan · ${idInt(b.soFar.eaten)} kkal`
              : "Belum makan hari ini"}
          </span>
        </div>
        {meals.length === 0 ? (
          <p className="eb-meals-empty">
            Belum ada makanan tercatat — setiap jam tanpa makan beratmu turun sekitar{" "}
            <strong>{dec(b.rate.bodyGramsPerHour, 0)} g</strong> ({dec(b.rate.fatGramsPerHour, 0)}{" "}
            g lemak). Begitu kamu catat makan, angka langsung berubah.
          </p>
        ) : (
          <ul className="eb-meal-list">
            {meals.map((m) => (
              <li key={m.id} className="eb-meal-row">
                <div className="eb-meal-info">
                  <strong>
                    {m.label} <small>· {m.timeLabel}</small>
                  </strong>
                  <span>
                    {idInt(m.kcal)} kkal
                    {m.grams > 0 ? ` · ${idInt(m.grams)} g porsi` : ""} · butuh{" "}
                    {durationText(m.impact.burnMinutes)} bakar normal
                  </span>
                </div>
                <div className="eb-meal-impact">
                  <strong>{addedKgText(m.impact.bodyGrams)}</strong>
                  <small>+{Math.round(m.impact.fatGrams)} g lemak</small>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <dl className="eb-rows">
        <div>
          <dt>
            {activeMode === "now" ? "Terbakar normal s.d. detik ini" : "Terbakar normal seharian"}
            <small>
              {activeMode === "now"
                ? `dari ${idInt(b.normal)} kkal/hari`
                : "tanpa olahraga"}
            </small>
          </dt>
          <dd>{idInt(activeMode === "now" ? b.soFar.burnExact - b.active : b.normal)}</dd>
        </div>
        <div>
          <dt>
            + Olahraga dan gerak
            <small>{fromHealth ? "dari Apple Health" : "perkiraan dari Latihan"}</small>
          </dt>
          <dd>{idInt(b.active)}</dd>
        </div>
        <div>
          <dt>
            − Makan
            <small>
              {activeMode === "target" && !closing
                ? `sudah ${idInt(b.soFar.eaten)}, sisanya sesuai target`
                : "yang sudah tercatat hari ini"}
            </small>
          </dt>
          <dd>{idInt(shownIntake)}</dd>
        </div>
        <div className="total">
          <dt>{shownBalance > 0 ? "= Defisit" : shownBalance === 0 ? "= Selisih" : "= Surplus"}</dt>
          <dd>
            {idInt(shownBalance)} <small>kkal</small>
          </dd>
        </div>
      </dl>

      <details className="eb-how">
        <summary>Cara menghitung berat badan vs lemak</summary>
        <ul>
          <li>
            <strong>Terbakar normal ({idInt(b.normal)} kkal/hari):</strong> rumus Mifflin-St Jeor
            dari berat, tinggi, umur dan jenis kelamin
            {fromHealth
              ? ", ditambah energi aktif dari Apple Health."
              : " × 1,2 (aktivitas harian tanpa olahraga). Dengan Apple Health angkanya lebih tepat."}
            {" "}Setara {dec(b.rate.kcalPerSecond, 3)} kkal setiap detik (
            {idInt(shownBurn)} kkal {activeMode === "now" ? "sampai detik ini" : "seharian"}).
          </li>
          <li>
            <strong>Lemak murni ({idInt(KCAL_PER_KG_FAT)} kkal/kg):</strong> jaringan lemak murni
            yang berkurang/bertambah secara permanen.
          </li>
          <li>
            <strong>Perkiraan berat badan (jaringan + glikogen &amp; air):</strong> saat defisit
            harian, tubuh tidak hanya membakar lemak ({idInt(KCAL_PER_KG_TISSUE)} kkal/kg untuk
            jaringan tubuh), tapi juga memakai cadangan glikogen hati/otot (~20% defisit harian,
            maks ~{GLYCOGEN_MAX_KCAL} kkal). Setiap 1 g glikogen (4 kkal) mengikat ~3 g air, jadi
            berat badan bergerak ~1 g per kkal glikogen.
          </li>
          <li>
            <strong>Laju per minggu</strong> hanya memakai jaringan stabil ({idInt(KCAL_PER_KG_TISSUE)}{" "}
            kkal/kg) &amp; lemak murni ({idInt(KCAL_PER_KG_FAT)} kkal/kg), karena kehilangan air
            glikogen tidak berlipat 7× tiap minggu.
          </li>
          <li>
            <strong>Catatan timbangan:</strong> berat fisik makanan/minuman yang masih di perut
            {foodMassGrams > 0 ? ` (hari ini tercatat ≈ ${dec(foodMassGrams / 1000, 2)} kg makanan)` : ""}{" "}
            serta garam dan hidrasi tetap membuat angka timbangan naik-turun ±0,5–1 kg sehari.
          </li>
        </ul>
      </details>
    </section>
  );
}
