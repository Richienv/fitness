"use client";

/**
 * Drop-in skeleton matching the SlimBar footprint — same height, same
 * 3-row internal structure, just shimmer instead of real values. Used
 * before the first localStorage read completes, so users don't see a
 * "0/2200 kcal" flash that then snaps to the real number.
 */
export default function SkeletonBar({ label }: { label?: string }) {
  return (
    <div className="slim-row" aria-hidden="true">
      <div className="slim-head mono">
        <span className="slim-label">{label ?? ""}</span>
        <span className="slim-nums shimmer-text">&nbsp;</span>
      </div>
      <div className="slim-track">
        <div className="slim-fill skeleton-fill" />
      </div>
      <div className="slim-foot mono">
        <span className="shimmer-text">&nbsp;</span>
        <span className="shimmer-text">&nbsp;</span>
      </div>
    </div>
  );
}
