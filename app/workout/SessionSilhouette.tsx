import type { MuscleKey, MuscleColorGroup } from "@/lib/muscles";
import { MUSCLE_GROUP_COLOR, MUSCLE_TO_GROUP } from "@/lib/muscles";

/**
 * Stylised front-view body chart used on the workout-picker cards.
 * Replaces the previous pixel-art silhouette with a thinly-stroked SVG that
 * highlights the muscle COLOR GROUPS this session targets.
 *
 * The body is drawn from organic <path> shapes (no rects), and each muscle
 * group lights up via a soft fill when the session targets it.
 */

type Group = MuscleColorGroup;

// The actual silhouette — a clean front-view stick of a person, drawn
// once and then highlighted per session.
//
// viewBox 100x140 keeps a nice portrait ratio at any size.
const BODY_FILL = "#171717";
const BODY_STROKE = "#2a2a2a";

function regions(active: Set<Group>) {
  const fill = (g: Group) =>
    active.has(g) ? MUSCLE_GROUP_COLOR[g] : "transparent";
  const op = (g: Group) => (active.has(g) ? 0.85 : 0);
  return { fill, op };
}

export default function SessionSilhouette({
  highlight,
  size = 60,
}: {
  highlight: MuscleKey[];
  size?: number;
}) {
  const groups = new Set<Group>(highlight.map((m) => MUSCLE_TO_GROUP[m]));
  const { fill, op } = regions(groups);

  return (
    <svg
      className="silhouette"
      viewBox="0 0 100 140"
      width={size * 0.78}
      height={size}
      aria-hidden="true"
    >
      <g fill={BODY_FILL} stroke={BODY_STROKE} strokeWidth="0.7" strokeLinejoin="round">
        {/* Head */}
        <ellipse cx="50" cy="14" rx="8" ry="10" />
        {/* Neck */}
        <path d="M44.5 23 Q44 27 42 30 L58 30 Q56 27 55.5 23 Z" />
        {/* Torso (shoulders → waist) */}
        <path d="
          M30 30
          Q24 31 22 36
          L23 50
          L26 64
          L30 76
          L36 80
          L64 80
          L70 76
          L74 64
          L77 50
          L78 36
          Q76 31 70 30
          L62 28
          L38 28
          Z
        " />
        {/* Upper arms (left & right) */}
        <path d="M22 36 Q17 38 16 44 L18 60 Q20 64 24 64 L27 60 L26 44 Q26 38 22 36 Z" />
        <path d="M78 36 Q83 38 84 44 L82 60 Q80 64 76 64 L73 60 L74 44 Q74 38 78 36 Z" />
        {/* Forearms */}
        <path d="M18 60 L16 80 L22 84 L26 82 L26 64 L22 62 Z" />
        <path d="M82 60 L84 80 L78 84 L74 82 L74 64 L78 62 Z" />
        {/* Thighs */}
        <path d="M36 80 L32 102 L34 118 L42 120 L48 118 L48 100 L46 80 Z" />
        <path d="M64 80 L68 102 L66 118 L58 120 L52 118 L52 100 L54 80 Z" />
        {/* Calves */}
        <path d="M34 118 L32 134 L40 138 L46 134 L46 120 Z" />
        <path d="M66 118 L68 134 L60 138 L54 134 L54 120 Z" />
      </g>

      {/* Highlight overlays — one per muscle group, drawn in order so the
          arms/legs sit cleanly on top of the torso. */}
      <g strokeWidth="0">
        {/* Shoulders cap */}
        <path
          d="M22 32 Q23 34 25 36 L33 33 L31 38 Q26 38 22 36 Z M78 32 Q77 34 75 36 L67 33 L69 38 Q74 38 78 36 Z"
          fill={fill("shoulders")}
          opacity={op("shoulders")}
        />
        {/* Chest */}
        <path
          d="M34 32 Q40 34 50 34 Q60 34 66 32 L70 36 Q70 44 60 48 Q55 50 50 50 Q45 50 40 48 Q30 44 30 36 Z"
          fill={fill("chest")}
          opacity={op("chest")}
        />
        {/* Abs (stylised — a tall pill down the centre) */}
        <path
          d="M44 50 Q44 48 50 48 Q56 48 56 50 L56 76 Q56 78 50 78 Q44 78 44 76 Z"
          fill={fill("abs")}
          opacity={op("abs")}
        />
        {/* Back (lats / mid-back / traps / rear delts) — visible as a
            subtle aura behind the torso to read on a front silhouette. */}
        <path
          d="M22 36 L26 64 L30 76 L36 80 L40 78 Q34 76 32 70 L28 50 Q26 40 24 36 Z M78 36 L74 64 L70 76 L64 80 L60 78 Q66 76 68 70 L72 50 Q74 40 76 36 Z"
          fill={fill("back")}
          opacity={op("back")}
        />
        {/* Arms (biceps / triceps / forearms) */}
        <path
          d="M18 40 Q16 50 17 60 L20 64 L24 62 L25 50 Q24 42 22 40 Z M82 40 Q84 50 83 60 L80 64 L76 62 L75 50 Q76 42 78 40 Z"
          fill={fill("arms")}
          opacity={op("arms")}
        />
        {/* Legs (quads / hamstrings / glutes / calves) */}
        <path
          d="M36 82 L32 110 L36 120 L44 120 L48 110 L48 84 Z M64 82 L68 110 L64 120 L56 120 L52 110 L52 84 Z"
          fill={fill("legs")}
          opacity={op("legs")}
        />
      </g>
    </svg>
  );
}
