"use client";
// The Home screen's main feature: what today's food, exercise and normal burn
// add up to, in grams of fat. Maths in lib/energyBalance; see
// docs/plans/2026-11-24-home-energy-balance.md.
import Link from "next/link";
import { DAY_CLOSING, KCAL_PER_KG_FAT } from "@/lib/energyBalance";
import type { EnergyView } from "@/lib/energyBalanceData";
import "./energy-balance.css";

const id = (n: number) => Math.round(Math.abs(n)).toLocaleString("id-ID");
const dec = (n: number, d = 2) =>
  Math.abs(n).toLocaleString("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d });

/** "−65 g" under a kilo, "−1,2 kg" above it; the sign is the direction of FAT. */
function fatText(grams: number): { value: string; unit: string } {
  const a = Math.abs(grams);
  const sign = grams > 0 ? "−" : grams < 0 ? "+" : "";
  return a >= 1000
    ? { value: `${sign}${dec(a / 1000, 1)}`, unit: "kg" }
    : { value: `${sign}${Math.round(a)}`, unit: "g" };
}

export default function EnergyBalanceCard({ view }: { view: EnergyView }) {
  if (view.status === "profile") {
    return (
      <section className="eb" aria-labelledby="eb-title">
        <h2 id="eb-title">Perkiraan berat badan hari ini</h2>
        <p className="eb-lead">
          Lengkapi jenis kelamin, tinggi dan umur untuk melihat berapa lemak yang turun hari ini
          dari makan, olahraga dan kalori normalmu.
        </p>
        <Link href="/settings" className="primary-button eb-cta">
          Lengkapi data tubuh
        </Link>
      </section>
    );
  }
  const { balance: b, weeks, targetKg, fromHealth, isToday } = view;
  const fat = fatText(b.fatGrams);
  const near = Math.abs(b.balance) < 50;
  const deficit = b.balance > 0;
  const direction = near ? "seimbang" : deficit ? "lemak turun" : "lemak naik";
  const closing = b.intakeFrom === "eaten";
  return (
    <section className="eb" aria-labelledby="eb-title">
      <div className="eb-head">
        <h2 id="eb-title">Perkiraan hari ini</h2>
        <span className="eb-tag">
          {!isToday
            ? "dari yang tercatat"
            : closing
              ? "dari makanan yang tercatat"
              : "kalau sisa makan sesuai target"}
        </span>
      </div>
      <p className="eb-hero" aria-label={`${fat.value} ${fat.unit} ${direction}`}>
        <strong className={deficit && !near ? "down" : undefined}>
          {near ? "≈ 0" : fat.value}
        </strong>
        <span>
          {near ? "g" : fat.unit} · {direction}
        </span>
      </p>
      <p className="eb-sub">
        {near
          ? "Makan dan pembakaranmu hampir sama."
          : `${deficit ? "Defisit" : "Surplus"} ${id(b.balance)} kkal`}
        {Math.abs(b.kgPerWeek) >= 0.05 && (
          <>
            {" "}
            · kalau begini tiap hari ≈ {dec(b.kgPerWeek)} kg lemak {deficit ? "turun" : "naik"} per
            minggu
          </>
        )}
      </p>
      {weeks !== null && targetKg !== null && (
        <p className="eb-goal">
          Menuju {dec(targetKg, 1)} kg: sekitar {weeks} minggu lagi di laju ini.
        </p>
      )}
      <dl className="eb-rows">
        <div>
          <dt>
            Terbakar normal<small>tanpa olahraga</small>
          </dt>
          <dd>{id(b.normal)}</dd>
        </div>
        <div>
          <dt>
            + Olahraga dan gerak
            <small>{fromHealth ? "dari Apple Health" : "perkiraan dari Latihan"}</small>
          </dt>
          <dd>{id(b.active)}</dd>
        </div>
        <div>
          <dt>
            − Makan
            <small>
              {closing ? "yang tercatat" : `sudah ${id(b.soFar.eaten)}, sisanya sesuai target`}
            </small>
          </dt>
          <dd>{id(b.intake)}</dd>
        </div>
        <div className="total">
          <dt>{deficit ? "= Defisit" : near ? "= Selisih" : "= Surplus"}</dt>
          <dd>
            {id(b.balance)} <small>kkal</small>
          </dd>
        </div>
      </dl>
      {isToday && !closing && (
        <p className="eb-sofar">
          Sampai sekarang: terbakar {id(b.soFar.burn)}, makan {id(b.soFar.eaten)} kkal.
        </p>
      )}
      <details className="eb-how">
        <summary>Cara menghitung</summary>
        <ul>
          <li>
            Terbakar normal: rumus Mifflin-St Jeor dari berat, tinggi, umur dan jenis kelaminmu
            {fromHealth
              ? ", ditambah energi aktif dari Apple Health."
              : ", dikali 1,2 (hari tanpa olahraga). Dengan Apple Health, angkanya jadi lebih tepat."}
          </li>
          <li>Olahraga dan gerak: kalori aktif dari Latihan, termasuk langkah dan sepeda.</li>
          <li>
            Makan: yang sudah tercatat. Sampai sekitar jam {Math.round(DAY_CLOSING * 24)}, sisanya
            dianggap sesuai target hari ini.
          </li>
          <li>
            {id(KCAL_PER_KG_FAT)} kkal ≈ 1 kg lemak. Ini perkiraan lemak, bukan angka timbangan:
            air, garam dan isi perut membuat timbangan naik turun sampai 1 kg sehari. Lihat
            trennya per minggu.
          </li>
        </ul>
      </details>
    </section>
  );
}
