export type ExerciseAlternative = {
  name: string;
  reason: string;
  equipment: string;
};

export type MuscleGroup =
  | "chest"
  | "back"
  | "shoulders"
  | "arms"
  | "legs"
  | "abs";

export type ExerciseDetail = {
  primary: string;
  secondary: string;
  feelIt: string;
  muscleGroup: MuscleGroup;
  formTips: string[];
  mistakes: string[];
};

// ============ Alternatives ============

export const ALTERNATIVES: Record<string, ExerciseAlternative[]> = {
  "Bench Press": [
    { name: "DB Floor Press", reason: "Same chest focus, no bench", equipment: "Dumbbells only" },
    { name: "Smith Machine Press", reason: "Guided path, easier balance", equipment: "Smith machine" },
    { name: "DB Chest Press (machine)", reason: "Controlled machine chest press", equipment: "Chest press machine" },
    { name: "Push Ups", reason: "Bodyweight, always available", equipment: "No equipment" },
    { name: "Pec Deck", reason: "Isolation, zero setup", equipment: "Pec deck machine" },
  ],
  "Incline DB Press": [
    { name: "Iso Lateral Incline Press", reason: "Machine — your usual pick", equipment: "Plate-loaded machine" },
    { name: "Incline Smith Machine Press", reason: "Guided incline press", equipment: "Smith machine + incline bench" },
    { name: "Cable Crossover High-to-Low", reason: "Hits upper chest via cables", equipment: "Cable station" },
    { name: "Incline Push Ups", reason: "Bodyweight upper chest", equipment: "Bench or box" },
  ],
  "Lat Pulldown": [
    { name: "Pull Ups / Chin Ups", reason: "Bodyweight king move", equipment: "Pull up bar" },
    { name: "Assisted Pull Up Machine", reason: "Progress toward unassisted pull ups", equipment: "Assisted pull up machine" },
    { name: "Single Arm Cable Pulldown", reason: "Unilateral, fixes imbalances", equipment: "Cable station" },
    { name: "Resistance Band Pulldown", reason: "Home/travel option", equipment: "Resistance band" },
  ],
  "Cable Row": [
    { name: "Seated Row Machine", reason: "Your usual machine pick", equipment: "Row machine" },
    { name: "DB Row", reason: "Unilateral bench row", equipment: "DB + bench" },
    { name: "Barbell Row", reason: "Heavy compound pull", equipment: "Barbell" },
    { name: "TRX Row", reason: "Bodyweight horizontal pull", equipment: "TRX / rings" },
  ],
  "Seated Row Machine": [
    { name: "Cable Row", reason: "Swap to cables for variety", equipment: "Cable station" },
    { name: "DB Row", reason: "Unilateral bench row", equipment: "DB + bench" },
    { name: "Barbell Bent Over Row", reason: "Heavy free-weight pull", equipment: "Barbell" },
    { name: "Machine Row", reason: "Alternative row machine", equipment: "Plate-loaded machine" },
  ],
  "OHP": [
    { name: "Seated DB Press", reason: "Safer balance, free weights", equipment: "DBs + bench" },
    { name: "Smith Machine OHP", reason: "Guided overhead press", equipment: "Smith machine" },
    { name: "Cable OHP", reason: "Constant tension press", equipment: "Cable station" },
    { name: "Arnold Press", reason: "Full ROM front+side delts", equipment: "Dumbbells" },
  ],
  "Cable Lateral Raise": [
    { name: "DB Lateral Raise", reason: "Classic lateral raise", equipment: "Dumbbells" },
    { name: "Machine Lateral Raise", reason: "Fixed-path isolation", equipment: "Lateral raise machine" },
    { name: "Resistance Band Lateral Raise", reason: "Home/travel option", equipment: "Resistance band" },
    { name: "Leaning Cable Lateral Raise", reason: "Greater stretch at bottom", equipment: "Cable station" },
  ],
  "Tricep Pushdown": [
    { name: "Overhead Tricep Extension", reason: "Long head emphasis", equipment: "Cable or DB" },
    { name: "DB Skull Crusher", reason: "Free weight triceps", equipment: "DBs + bench" },
    { name: "Dips", reason: "Bodyweight compound", equipment: "Dip bars" },
    { name: "Close Grip Push Up", reason: "Bodyweight triceps", equipment: "No equipment" },
  ],
  "Dips": [
    { name: "Tricep Pushdown", reason: "Cable isolation", equipment: "Cable station" },
    { name: "Bench Dips", reason: "Easier bodyweight variant", equipment: "Bench" },
    { name: "Overhead Tricep Extension", reason: "Long head focus", equipment: "Cable or DB" },
    { name: "Diamond Push Ups", reason: "Bodyweight close grip", equipment: "No equipment" },
  ],
  "Squat": [
    { name: "Leg Press", reason: "Machine-guided quads", equipment: "Leg press machine" },
    { name: "Goblet Squat", reason: "DB front-loaded squat", equipment: "Single DB" },
    { name: "Smith Machine Squat", reason: "Guided barbell squat", equipment: "Smith machine" },
    { name: "Bulgarian Split Squat", reason: "Unilateral quads + glutes", equipment: "DB + bench" },
  ],
  "Romanian Deadlift": [
    { name: "Leg Curl Machine", reason: "Isolation hamstring curl", equipment: "Leg curl machine" },
    { name: "Single Leg RDL", reason: "Unilateral balance", equipment: "DB" },
    { name: "Good Morning", reason: "Barbell posterior chain", equipment: "Barbell" },
    { name: "Cable Pull Through", reason: "Cable posterior chain", equipment: "Cable station + rope" },
  ],
  "Face Pull": [
    { name: "DB Rear Delt Fly", reason: "Free weight rear delts", equipment: "DBs" },
    { name: "Reverse Pec Deck", reason: "Fixed-path rear delts", equipment: "Pec deck machine" },
    { name: "Band Pull Apart", reason: "Band warm-up/burnout", equipment: "Band" },
    { name: "Cable Rear Delt Row", reason: "Wide-grip high row", equipment: "Cable station" },
  ],
  "Barbell Curl": [
    { name: "Bicep Curl Machine", reason: "Your usual machine", equipment: "Curl machine" },
    { name: "DB Curl", reason: "Free-weight classic", equipment: "Dumbbells" },
    { name: "Cable Curl", reason: "Constant tension", equipment: "Cable + straight bar" },
    { name: "EZ Bar Curl", reason: "Wrist-friendly curl", equipment: "EZ bar" },
  ],
  "Hammer Curl": [
    { name: "Cable Rope Hammer Curl", reason: "Constant tension rope curl", equipment: "Cable + rope" },
    { name: "Cross Body Curl", reason: "Brachialis focus", equipment: "Dumbbells" },
    { name: "Neutral Grip DB Curl", reason: "Seated neutral curl", equipment: "DBs + bench" },
    { name: "Reverse Curl", reason: "Forearm thickness", equipment: "Barbell or EZ bar" },
  ],
};

// ============ Muscle focus / detail ============

export const MINDSET_QUOTES: Record<MuscleGroup, string> = {
  chest: "Every rep at the bottom stretch = chest fibers tearing = growth. Rush it = nothing.",
  back: "Your hands are hooks. Your back does the pulling. Disconnect your arms mentally.",
  shoulders: "Lateral raises build the V-taper more than any other exercise. 5 sets every Push B. No ego weight.",
  arms: "Slow negatives build more bicep mass than heavy weight with momentum. 4 sec down every rep.",
  legs: "Nobody wants leg day. Everyone wants the V-taper. Legs support everything. Don't skip.",
  abs: "Abs are revealed by diet. Built by cable crunches. You need both.",
};

export const EXERCISE_DETAILS: Record<string, ExerciseDetail> = {
  "Bench Press": {
    primary: "Pectoralis Major (chest)",
    secondary: "Front delts, triceps",
    feelIt: "Mid-chest burning, not shoulders",
    muscleGroup: "chest",
    formTips: [
      "Feet flat on floor, slight arch in lower back",
      "Grip slightly wider than shoulder width",
      "Bar touches lower chest, not neck",
      "3 sec controlled negative down",
      "Push bar slightly back at top",
      "Don't bounce bar off chest",
    ],
    mistakes: [
      "Flaring elbows 90° — keep ~45° to protect shoulders",
      "Butt lifting off bench — cheating and injury risk",
      "Partial reps — always full range of motion",
    ],
  },
  "Incline DB Press": {
    primary: "Upper chest (clavicular head)",
    secondary: "Front delts, triceps",
    feelIt: "Top of chest near collarbone",
    muscleGroup: "chest",
    formTips: [
      "Bench angle 30° — higher puts load on delts",
      "DBs stacked over upper chest, not shoulders",
      "Lower until you feel stretch, no lower",
      "Press up in slight arc, don't clank DBs",
    ],
    mistakes: [
      "Bench too steep — turns it into OHP",
      "Dropping DBs fast — losing tension = losing gains",
    ],
  },
  "Lat Pulldown": {
    primary: "Latissimus dorsi (back width)",
    secondary: "Biceps, rear delts",
    feelIt: "Wide pulling sensation under armpits",
    muscleGroup: "back",
    formTips: [
      "Grip wider than shoulders, thumbs over bar",
      "Lean back 10°, chest up",
      "Pull bar to upper chest, drive elbows DOWN",
      "Squeeze lats hard at bottom",
      "Slow controlled return — 3 sec up",
    ],
    mistakes: [
      "Pulling with biceps — disconnect arms mentally",
      "Leaning back too far — turns it into row",
      "Not getting full stretch at top",
    ],
  },
  "Cable Row": {
    primary: "Mid-back (rhomboids, middle traps)",
    secondary: "Biceps, rear delts",
    feelIt: "Squeeze between shoulder blades",
    muscleGroup: "back",
    formTips: [
      "Sit upright, chest out, shoulders back",
      "Pull handle to lower ribs, elbows tight",
      "Squeeze shoulder blades together HARD",
      "Slow 2 sec return, full stretch",
    ],
    mistakes: [
      "Rounding lower back — protect spine",
      "Jerking with momentum — controlled always",
    ],
  },
  "Seated Row Machine": {
    primary: "Mid-back (rhomboids, middle traps)",
    secondary: "Biceps, rear delts",
    feelIt: "Squeeze between shoulder blades",
    muscleGroup: "back",
    formTips: [
      "Chest on pad, shoulders back",
      "Drive elbows back, not arms",
      "Pause 1 sec at full contraction",
      "Slow return, full stretch",
    ],
    mistakes: [
      "Hunching shoulders forward on return",
      "Using too much arm / bicep",
    ],
  },
  "OHP": {
    primary: "Front delts, side delts",
    secondary: "Triceps, upper chest",
    feelIt: "Entire shoulder burning, not neck",
    muscleGroup: "shoulders",
    formTips: [
      "Bar starts at collarbone",
      "Brace core hard, glutes tight",
      "Press straight up, head moves through",
      "Lockout with bar over midfoot",
    ],
    mistakes: [
      "Leaning back excessively — turns into incline press",
      "Soft core = wobbly bar = injury",
    ],
  },
  "Cable Lateral Raise": {
    primary: "Side delts (medial deltoid)",
    secondary: "Traps (if done wrong)",
    feelIt: "Side of shoulder only, not traps",
    muscleGroup: "shoulders",
    formTips: [
      "Cable handle across body (opposite hand)",
      "Slight bend in elbow, lock it there",
      "Lead with the elbow, not the hand",
      "Raise to shoulder height, no higher",
      "Slow 3 sec negative",
    ],
    mistakes: [
      "Shrugging — traps take over",
      "Going above shoulder — delts disengage",
    ],
  },
  "Lateral Raise": {
    primary: "Side delts (medial deltoid)",
    secondary: "Traps (if done wrong)",
    feelIt: "Side of shoulder only, not traps",
    muscleGroup: "shoulders",
    formTips: [
      "Slight bend in elbows, lock position",
      "Lead with the elbows, pinkies up slightly",
      "Raise to shoulder height, pause 1 sec",
      "Slow 3 sec controlled negative",
    ],
    mistakes: [
      "Swinging with momentum — zero tension on delts",
      "Going too heavy — traps hijack the movement",
    ],
  },
  "Tricep Pushdown": {
    primary: "Triceps (all 3 heads)",
    secondary: "—",
    feelIt: "Back of arm, not shoulders",
    muscleGroup: "arms",
    formTips: [
      "Elbows pinned to ribs",
      "Only forearms move",
      "Full lockout at bottom, squeeze 1 sec",
      "Slow return, full stretch at top",
    ],
    mistakes: [
      "Elbows drifting forward — shoulders take over",
      "Leaning in to push — use triceps only",
    ],
  },
  "Dips": {
    primary: "Lower chest, triceps",
    secondary: "Front delts",
    feelIt: "Lower pec + back of arm",
    muscleGroup: "chest",
    formTips: [
      "Lean forward for chest focus, upright for triceps",
      "Lower until upper arms parallel to floor",
      "Keep shoulders down, away from ears",
      "Full lockout at top",
    ],
    mistakes: [
      "Going too deep — shoulder impingement risk",
      "Shrugging shoulders at bottom",
    ],
  },
  "Squat": {
    primary: "Quads, glutes",
    secondary: "Hamstrings, core, calves",
    feelIt: "Front of thigh burning",
    muscleGroup: "legs",
    formTips: [
      "Feet shoulder-width, toes slightly out",
      "Brace core, chest up",
      "Hips back and down, knees track toes",
      "Hip crease below knee (parallel+)",
      "Drive through midfoot, not toes",
    ],
    mistakes: [
      "Knees caving inward — push them OUT",
      "Heels lifting — weight on midfoot",
      "Rounding lower back at bottom",
    ],
  },
  "Romanian Deadlift": {
    primary: "Hamstrings, glutes",
    secondary: "Lower back, core",
    feelIt: "Stretch and pull in hamstrings",
    muscleGroup: "legs",
    formTips: [
      "Soft knees, don't bend further on way down",
      "Push hips back, bar slides down thighs",
      "Lower until you feel hamstring stretch",
      "Drive hips forward to stand, squeeze glutes",
    ],
    mistakes: [
      "Squatting it — knees should stay fixed",
      "Rounding lower back — stop before that point",
    ],
  },
  "Face Pull": {
    primary: "Rear delts, rotator cuff",
    secondary: "Traps, rhomboids",
    feelIt: "Back of shoulder, not neck",
    muscleGroup: "shoulders",
    formTips: [
      "Rope at face height, split the rope",
      "Pull to forehead, elbows high",
      "External rotate at the end — thumbs back",
      "Squeeze rear delts 1 sec",
    ],
    mistakes: [
      "Pulling to chest — becomes a row",
      "Using too much weight — form breaks",
    ],
  },
  "Barbell Curl": {
    primary: "Biceps brachii",
    secondary: "Brachialis, brachioradialis",
    feelIt: "Front of arm, peak contraction at top",
    muscleGroup: "arms",
    formTips: [
      "Elbows pinned to ribs",
      "Shoulder-width grip",
      "Curl without swinging",
      "Squeeze at top, slow 3 sec negative",
    ],
    mistakes: [
      "Swinging from hips — no bicep involvement",
      "Elbows drifting forward — turns into front raise",
    ],
  },
  "Hammer Curl": {
    primary: "Brachialis, brachioradialis",
    secondary: "Biceps",
    feelIt: "Outer arm and forearm thickness",
    muscleGroup: "arms",
    formTips: [
      "Neutral grip throughout (thumbs up)",
      "Elbows pinned to ribs",
      "Alternating or both — both work",
      "Slow 3 sec negative",
    ],
    mistakes: [
      "Rotating wrist at top — becomes a DB curl",
      "Swinging from shoulders",
    ],
  },
  "Leg Press": {
    primary: "Quads, glutes",
    secondary: "Hamstrings",
    feelIt: "Front of thigh, not lower back",
    muscleGroup: "legs",
    formTips: [
      "Feet shoulder-width, mid-platform",
      "Lower until knees reach 90°",
      "Don't let lower back round off pad",
      "Drive through heels, don't lock out hard",
    ],
    mistakes: [
      "Butt lifting off pad — shorten ROM",
      "Locking knees hard — joint stress",
    ],
  },
  "Leg Curl": {
    primary: "Hamstrings",
    secondary: "Calves",
    feelIt: "Back of thigh, full range",
    muscleGroup: "legs",
    formTips: [
      "Hips pressed into pad",
      "Full contraction at top, squeeze",
      "Slow 3 sec negative to full stretch",
      "Toes neutral or slightly dorsiflexed",
    ],
    mistakes: [
      "Hips lifting off pad — cheat reps",
      "Partial range — half gains",
    ],
  },
  "Calf Raise": {
    primary: "Gastrocnemius, soleus",
    secondary: "—",
    feelIt: "Full stretch at bottom, squeeze at top",
    muscleGroup: "legs",
    formTips: [
      "Full stretch at the bottom — 1 sec pause",
      "Rise on balls of feet, squeeze 1 sec at top",
      "Controlled tempo both directions",
    ],
    mistakes: [
      "Bouncing — tendons do the work, not calves",
      "Half ROM — calves need FULL stretch",
    ],
  },
  "Cable Crunch": {
    primary: "Rectus abdominis (upper abs)",
    secondary: "Obliques",
    feelIt: "Abs crunching, NOT lower back",
    muscleGroup: "abs",
    formTips: [
      "Kneel, rope at back of head",
      "Crunch chest toward knees, hips stay still",
      "Round your back — don't bend from hips",
      "Squeeze abs hard at bottom",
    ],
    mistakes: [
      "Pulling with arms / triceps — hands are hooks",
      "Hip-hinging — abs disengage entirely",
    ],
  },
};

export function getExerciseDetail(name: string): ExerciseDetail | null {
  return EXERCISE_DETAILS[name] ?? null;
}

export function getAlternatives(name: string): ExerciseAlternative[] {
  return ALTERNATIVES[name] ?? [];
}
