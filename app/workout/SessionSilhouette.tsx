import type { MuscleKey } from "@/lib/muscles";
import { muscleColor } from "@/lib/muscles";

type Region = {
  key: MuscleKey;
  d: string;
};

const FRONT_REGIONS: Region[] = [
  { key: "chest",     d: "M36 20 H64 V30 H36 Z" },
  { key: "frontDelt", d: "M28 18 H37 V26 H28 Z M63 18 H72 V26 H63 Z" },
  { key: "sideDelt",  d: "M24 18 H30 V26 H24 Z M70 18 H76 V26 H70 Z" },
  { key: "abs",       d: "M42 30 H58 V42 H42 Z" },
  { key: "bicep",     d: "M23 27 H31 V37 H23 Z M69 27 H77 V37 H69 Z" },
  { key: "tricep",    d: "M18 27 H24 V37 H18 Z M76 27 H82 V37 H76 Z" },
  { key: "quad",      d: "M38 44 H48 V58 H38 Z M52 44 H62 V58 H52 Z" },
  { key: "calf",      d: "M38 60 H47 V70 H38 Z M53 60 H62 V70 H53 Z" },
  { key: "lats",      d: "M32 26 H38 V38 H32 Z M62 26 H68 V38 H62 Z" },
  { key: "midBack",   d: "M40 24 H60 V36 H40 Z" },
  { key: "traps",     d: "M42 14 H58 V20 H42 Z" },
  { key: "rearDelt",  d: "M26 17 H34 V24 H26 Z M66 17 H74 V24 H66 Z" },
  { key: "hamstring", d: "M38 46 H48 V58 H38 Z M52 46 H62 V58 H52 Z" },
  { key: "glute",     d: "M40 40 H60 V48 H40 Z" },
];

export default function SessionSilhouette({
  highlight,
  size = 60,
}: {
  highlight: MuscleKey[];
  size?: number;
}) {
  const highlightSet = new Set(highlight);
  return (
    <svg
      className="silhouette"
      viewBox="0 0 100 80"
      width={size * 1.25}
      height={size}
      aria-hidden="true"
    >
      {/* Body outline — abstract */}
      <g fill="#1a1a1a" stroke="#2a2a2a" strokeWidth="0.6">
        <circle cx="50" cy="8" r="5.5" />
        <rect x="34" y="14" width="32" height="28" rx="2" />
        <rect x="18" y="16" width="14" height="22" rx="2" />
        <rect x="68" y="16" width="14" height="22" rx="2" />
        <rect x="36" y="42" width="12" height="30" rx="2" />
        <rect x="52" y="42" width="12" height="30" rx="2" />
      </g>
      {/* Muscle overlays */}
      <g>
        {FRONT_REGIONS.filter((r) => highlightSet.has(r.key)).map((r) => (
          <path
            key={r.key}
            d={r.d}
            fill={muscleColor(r.key)}
            opacity="0.95"
          />
        ))}
      </g>
    </svg>
  );
}
