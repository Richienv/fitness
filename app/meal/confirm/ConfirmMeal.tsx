"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { getIngredient, macrosFor } from "@/lib/ingredients";
import { PRESETS } from "@/lib/presets";
import { saveMeal } from "@/lib/store";
import { useActiveDate } from "@/lib/activeDate";
import { haptic } from "@/lib/haptics";
import { useVTNavigate } from "@/lib/navigate";
import AnimatedNumber from "../../_motion/AnimatedNumber";
import { toast } from "../../Toast";

// Swipe horizontally past this many pixels (negative = left) and the item
// commits to removal on release. Reveal max also clamps the drag.
const SWIPE_COMMIT_PX = -88;
const SWIPE_MAX_PX = -110;

export default function ConfirmMeal({
  presetId,
  dateParam,
}: {
  presetId: string;
  dateParam?: string;
}) {
  const router = useRouter();
  const vtNavigate = useVTNavigate();
  const { activeDate, setActiveDate, short } = useActiveDate();
  const preset = useMemo(() => PRESETS.find((p) => p.id === presetId), [presetId]);

  // Items the user swiped away on this screen — preset itself is never
  // mutated, just the current save.
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  // Live drag offset per item (px, negative). The row that's currently
  // being touched bypasses the spring transition for finger-following feel.
  const [offsets, setOffsets] = useState<Record<number, number>>({});
  const [dragging, setDragging] = useState<number | null>(null);
  // Use refs for per-touch start state — never triggers re-renders.
  const touchStart = useRef<{ idx: number; x: number; y: number } | null>(null);
  // Whether the swipe locked horizontal (vs vertical scroll). Set once the
  // user's intent is clear so we can preventDefault on subsequent moves.
  const horizLocked = useRef<boolean>(false);

  // Sync context with ?date= query param.
  useEffect(() => {
    if (dateParam && dateParam !== activeDate) setActiveDate(dateParam);
  }, [dateParam, activeDate, setActiveDate]);

  // Prefetch the destination so SAVE is instant.
  useEffect(() => {
    router.prefetch("/meal");
  }, [router]);

  if (!preset) {
    return (
      <main className="shell">
        <Link href="/meal" className="back-link">← Back</Link>
        <h1 className="section-title">PRESET NOT FOUND</h1>
        <p style={{ color: "var(--muted)" }}>That preset doesn&apos;t exist.</p>
      </main>
    );
  }

  const presetItems = preset.items;
  const includedItems = presetItems.filter((_, i) => !excluded.has(i));

  const totals = includedItems.reduce(
    (acc, it) => {
      const m = macrosFor(it.id, it.qty);
      return {
        kcal: acc.kcal + m.kcal,
        protein: acc.protein + m.protein,
        carbs: acc.carbs + m.carbs,
        fat: acc.fat + m.fat,
      };
    },
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const saveDate = dateParam ?? activeDate;

  function save() {
    if (includedItems.length === 0) {
      toast("Add at least one item", "warn");
      return;
    }
    saveMeal({
      date: saveDate,
      mealType: preset!.mealType,
      items: includedItems,
    });
    haptic("success");
    toast("Logged ✓", "success");
    vtNavigate("/meal", { haptic: null });
  }

  function edit() {
    const params = new URLSearchParams({ preset: preset!.id, date: saveDate });
    vtNavigate(`/meal/${preset!.mealType}?${params.toString()}`);
  }

  function onTouchStart(idx: number, e: React.TouchEvent) {
    if (excluded.has(idx)) return;
    const t = e.touches[0];
    touchStart.current = { idx, x: t.clientX, y: t.clientY };
    horizLocked.current = false;
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!touchStart.current) return;
    const { idx, x: x0, y: y0 } = touchStart.current;
    const t = e.touches[0];
    const dx = t.clientX - x0;
    const dy = t.clientY - y0;

    // Decide intent on the first meaningful move: if vertical dominates,
    // bail out so the page can scroll. If horizontal-left dominates, lock.
    if (!horizLocked.current) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        // vertical scroll wins — abort this swipe
        touchStart.current = null;
        return;
      }
      horizLocked.current = true;
      setDragging(idx);
    }

    // Only allow left-swipe (toward remove). Clamp at MAX so it can't
    // travel forever; if user drags right, snap back to 0.
    const clamped = Math.max(SWIPE_MAX_PX, Math.min(0, dx));
    setOffsets((cur) => ({ ...cur, [idx]: clamped }));
  }

  function onTouchEnd() {
    if (!touchStart.current) return;
    const { idx } = touchStart.current;
    const offset = offsets[idx] ?? 0;
    touchStart.current = null;
    horizLocked.current = false;
    setDragging(null);

    if (offset <= SWIPE_COMMIT_PX) {
      // Commit removal. Keep the foreground offset at max-swipe so it
      // doesn't snap back during the wrapper's collapse animation —
      // visually the row continues sliding off while the wrapper
      // collapses its height beneath it.
      haptic("warn");
      setOffsets((cur) => ({ ...cur, [idx]: SWIPE_MAX_PX }));
      setExcluded((cur) => {
        const next = new Set(cur);
        next.add(idx);
        return next;
      });
    } else {
      // Spring back to 0.
      setOffsets((cur) => ({ ...cur, [idx]: 0 }));
    }
  }

  return (
    <main className="confirm-shell page-rise">
      <div className="confirm-top">
        <Link href="/meal" className="back-link">← Back</Link>
        <div
          className="confirm-hero"
          style={{
            viewTransitionName: `tile-${preset.id}`,
          } as React.CSSProperties}
        >
          <h1 className="confirm-title">{preset.label}</h1>
          <div className="confirm-sub mono">
            {preset.mealType.toUpperCase()} · {short}
          </div>
        </div>

        <div className="confirm-items">
          {presetItems.map((it, i) => {
            const ing = getIngredient(it.id);
            if (!ing) return null;
            const m = macrosFor(it.id, it.qty);
            const isRemoved = excluded.has(i);
            const offset = isRemoved ? 0 : offsets[i] ?? 0;
            const isDragging = dragging === i;
            const revealAmount = Math.min(1, Math.abs(offset) / Math.abs(SWIPE_COMMIT_PX));
            const willCommit = offset <= SWIPE_COMMIT_PX;
            return (
              <div
                key={`${it.id}-${i}`}
                className={`confirm-item-wrap stagger-item${
                  isRemoved ? " removed" : ""
                }`}
                style={{ ["--i" as string]: i } as React.CSSProperties}
                onTouchStart={(e) => onTouchStart(i, e)}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
                onTouchCancel={onTouchEnd}
              >
                <div
                  className={`confirm-item-bg${willCommit ? " armed" : ""}`}
                  style={{
                    opacity: revealAmount,
                  }}
                  aria-hidden="true"
                >
                  REMOVE
                </div>
                <div
                  className="confirm-item"
                  style={{
                    transform: `translateX(${offset}px)`,
                    transition: isDragging
                      ? "none"
                      : "transform var(--dur-base) var(--ease-spring)",
                  }}
                >
                  <div className="ci-qty">×{it.qty}</div>
                  <div className="ci-main">
                    <div className="ci-name">{ing.name}</div>
                    <div className="ci-sub">{ing.unit}</div>
                  </div>
                  <div className="ci-kcal mono">{Math.round(m.kcal)} kcal</div>
                </div>
              </div>
            );
          })}
          {includedItems.length === 0 && (
            <div className="confirm-empty mono">
              All items removed — tap EDIT to add back, or pick a different preset.
            </div>
          )}
        </div>
      </div>

      <div className="confirm-bottom pinned-action-bar">
        <div className="confirm-totals">
          <div className="confirm-kcal">
            <strong className="tnum">
              <AnimatedNumber value={Math.round(totals.kcal)} />
            </strong>
            <span>kcal</span>
          </div>
          <div className="confirm-macros mono tnum">
            <AnimatedNumber value={Math.round(totals.protein)} />p ·{" "}
            <AnimatedNumber value={Math.round(totals.carbs)} />c ·{" "}
            <AnimatedNumber value={Math.round(totals.fat)} />f
          </div>
        </div>
        <div className="confirm-actions">
          <button type="button" className="next-btn ghost" onClick={edit}>EDIT</button>
          <button
            type="button"
            className="next-btn"
            onClick={save}
            disabled={includedItems.length === 0}
            style={includedItems.length === 0 ? { opacity: 0.5 } : undefined}
          >
            SAVE ✓
          </button>
        </div>
      </div>
    </main>
  );
}
