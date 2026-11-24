"use client";
// Minimalist floating HUD overlaid on the paused-by-default turntable avatar.
// - Top-center above avatar head: anchor weight (red strikethrough) → projected weight
//   with instant toggle between "Tanpa air" (biological) and "+ Air" (scale weight).
// - Top-right corner: Detail trigger opening full EnergyBalance breakdown.
// - Floating translucent icon+number chips: live per-second deficit, active workout burn,
//   calories/protein eaten, and interactive water tracker (+250 ml / −250 ml).
// - Bottom-right: Play/Pause toggle for the avatar (paused by default).
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { dayFractionCST, energyBalance } from "@/lib/energyBalance";
import type { EnergyView } from "@/lib/energyBalanceData";
import type { Character } from "@/lib/companionProgress";
import type { Snapshot } from "@/lib/motivation";
import AvatarPlayer from "./AvatarPlayer";
import Icon from "../ui/Icon";
import "./hero-stage.css";

const idInt = (n: number) => Math.round(Math.abs(n)).toLocaleString("id-ID");
const dec = (n: number, d = 1) =>
  n.toLocaleString("id-ID", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });

export default function HeroAvatarStage({
  character,
  level,
  energy,
  snap,
  waterMl,
  onAddWater,
  detailOpen,
  onToggleDetail,
  onOpenWeigh,
}: {
  character: Character;
  level: number;
  energy: EnergyView | null;
  snap: Snapshot | null;
  waterMl: number;
  onAddWater: (deltaMl: number) => void;
  detailOpen: boolean;
  onToggleDetail: () => void;
  onOpenWeigh: () => void;
}) {
  const [includeWater, setIncludeWater] = useState(false);
  const [tick, setTick] = useState<number | null>(null);

  const isToday = energy?.status === "ok" && energy.isToday;

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

  const live = useMemo(() => {
    if (!energy || energy.status !== "ok") return null;
    if (!energy.isToday || tick === null) return energy.balance;
    return (
      energyBalance({
        ...energy.input,
        waterMl,
        dayFraction: dayFractionCST(new Date(tick)),
      }) ?? energy.balance
    );
  }, [energy, tick, waterMl]);

  const anchorKg = energy?.status === "ok" ? energy.kg : null;
  const targetWeightNow = live
    ? includeWater
      ? live.stopEating.weightWithWaterKg
      : live.stopEating.weightKg
    : null;

  const deltaKg =
    anchorKg !== null && targetWeightNow !== null
      ? anchorKg - targetWeightNow // positive = losing weight
      : null;

  const nowDeficit = live ? live.soFar.balanceExact : null;
  const nowDeltaKg = live ? live.soFar.weight.bodyKg : null;
  const waterL = waterMl / 1000;

  return (
    <section className="hero-stage" aria-label="Ringkasan berat dan progres real time">
      {/* Top-right Detail trigger */}
      <button
        type="button"
        className={`hero-detail-btn${detailOpen ? " is-open" : ""}`}
        onClick={onToggleDetail}
        aria-expanded={detailOpen}
        aria-label={detailOpen ? "Tutup detail perhitungan" : "Lihat detail perhitungan"}
      >
        <Icon name="info" size={15} />
        <span>{detailOpen ? "Tutup" : "Detail"}</span>
      </button>

      {/* Top-center directly above avatar head: 76,1 (red strikethrough) → 75,9 kg */}
      <div className="hero-head-weight">
        {anchorKg !== null && targetWeightNow !== null && live ? (
          <>
            <button
              type="button"
              className="hero-weight-transition"
              onClick={onOpenWeigh}
              aria-label={`Berat dari ${dec(anchorKg, 1)} kg menjadi perkiraan ${dec(targetWeightNow, 1)} kg`}
            >
              <span className="hero-weight-old">{dec(anchorKg, 1)}</span>
              <span className="hero-weight-arrow" aria-hidden="true">
                →
              </span>
              <strong
                className={`hero-weight-new${
                  deltaKg !== null && deltaKg > 0.02
                    ? " down"
                    : deltaKg !== null && deltaKg < -0.02
                      ? " up"
                      : ""
                }`}
              >
                {dec(targetWeightNow, 1)}
                <small> kg</small>
              </strong>
            </button>

            <div className="hero-weight-sub">
              {includeWater ? (
                <span>
                  Timbangan (+{dec(waterL, 2)} L air) · bersih{" "}
                  <strong>{dec(live.stopEating.weightKg, 2)} kg</strong>
                </span>
              ) : (
                <span>
                  {deltaKg !== null && Math.abs(deltaKg) >= 0.005
                    ? `${deltaKg > 0 ? "−" : "+"}${dec(Math.abs(deltaKg), 2)} kg`
                    : "≈ 0,00 kg"}{" "}
                  kalau stop makan
                  {nowDeltaKg !== null && isToday && (
                    <>
                      {" "}
                      ·{" "}
                      <em className="hero-live-tick">
                        {nowDeltaKg >= 0 ? "−" : "+"}
                        {dec(Math.abs(nowDeltaKg), 4)} kg
                      </em>{" "}
                      skrg
                    </>
                  )}
                </span>
              )}
            </div>

            <div className="hero-water-switch" role="group" aria-label="Mode berat air minum">
              <button
                type="button"
                className={!includeWater ? "is-active" : undefined}
                onClick={() => setIncludeWater(false)}
              >
                Tanpa air
              </button>
              <button
                type="button"
                className={includeWater ? "is-active" : undefined}
                onClick={() => setIncludeWater(true)}
              >
                + Air{waterMl > 0 ? ` (${dec(waterL, 1)}L)` : ""}
              </button>
            </div>
          </>
        ) : (
          <Link href="/settings" className="hero-setup-pill">
            Lengkapi data tubuh untuk proyeksi berat →
          </Link>
        )}
      </div>

      {/* Turntable Avatar — paused by default, playable via floating pill or drag */}
      <div className="hero-avatar-canvas">
        <AvatarPlayer
          character={character}
          level={level}
          autoPlay={false}
          minimalControls
        />

        {/* Floating left HUD chips (compact icon + number, translucent over avatar) */}
        <div className="hero-hud-left">
          {live && (
            <button
              type="button"
              className="hero-chip tone-deficit"
              onClick={onToggleDetail}
              aria-label="Defisit detik ini"
            >
              <span className="hero-chip-ico">
                <Icon name="zap" size={14} />
              </span>
              <span className="hero-chip-body">
                <strong>
                  {nowDeficit !== null && nowDeficit >= 0 ? "−" : "+"}
                  {idInt(nowDeficit ?? 0)}
                  <small> kkal</small>
                </strong>
                <em>−{dec(live.rate.bodyGramsPerHour, 0)} g/jam</em>
              </span>
            </button>
          )}

          {live && (
            <Link href="/workout" className="hero-chip tone-burn" aria-label="Olahraga hari ini">
              <span className="hero-chip-ico">
                <Icon name="workout" size={14} />
              </span>
              <span className="hero-chip-body">
                <strong>
                  {idInt(live.active)}
                  <small> kkal</small>
                </strong>
                <em>olahraga</em>
              </span>
            </Link>
          )}

          {snap && (
            <Link href="/meal" className="hero-chip tone-meal" aria-label="Makan hari ini">
              <span className="hero-chip-ico">
                <Icon name="meal" size={14} />
              </span>
              <span className="hero-chip-body">
                <strong>
                  {idInt(snap.kcal)}
                  <small>/{idInt(snap.kcalTarget)}</small>
                </strong>
                <em>{idInt(snap.protein)}g protein</em>
              </span>
            </Link>
          )}
        </div>

        {/* Floating right HUD: Water quick tracker */}
        <div className="hero-hud-right">
          <div className="hero-water-chip" aria-label={`Air minum ${waterMl} ml`}>
            <div className="hero-water-top">
              <span className="hero-chip-ico water">
                <Icon name="droplet" size={14} />
              </span>
              <span className="hero-chip-body">
                <strong>
                  {dec(waterL, 2)}
                  <small> L</small>
                </strong>
                <em>+{dec(waterL, 2)} kg</em>
              </span>
            </div>
            <div className="hero-water-btns">
              {waterMl > 0 && (
                <button
                  type="button"
                  className="hero-water-minus"
                  onClick={() => onAddWater(-250)}
                  aria-label="Kurangi 250 ml air"
                >
                  −
                </button>
              )}
              <button
                type="button"
                className="hero-water-plus"
                onClick={() => onAddWater(250)}
                aria-label="Tambah 250 ml air"
              >
                +250
              </button>
            </div>
          </div>
        </div>

        {/* Bottom-left subtle level tag */}
        <Link href="/companion" className="hero-level-pill">
          {character === "richie" ? "Richie" : "Renita"} · Lv {level}
        </Link>
      </div>
    </section>
  );
}
