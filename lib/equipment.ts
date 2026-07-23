import { expandEquipmentQuery } from "./equipmentAliases.ts";

export type EquipmentCategory =
  | "MACHINE"
  | "CABLE"
  | "BARBELL"
  | "DUMBBELL"
  | "BODYWEIGHT"
  | "CARDIO";

export type Equipment = {
  id: string;
  name: string;
  hanzi: string;
  pinyin: string;
  muscleGroup: string;
  secondary?: string[];
  category: EquipmentCategory;
  instructions?: string;
};

export const EQUIPMENT: Equipment[] = [
  // Chest
  { id: "chest-press-machine",       name: "Chest Press Machine",       hanzi: "胸部推举器",   pinyin: "xiōngbù tuījǔ qì",       muscleGroup: "CHEST",       secondary: ["triceps", "front delt"],             category: "MACHINE", instructions: "Set the seat so the handles sit at mid-chest. Sit back with shoulder blades pinned and feet flat. Press the handles forward until your arms are almost straight (don't lock the elbows), then return slowly to a light chest stretch. Keep your back on the pad throughout." },
  { id: "pec-deck",                  name: "Pec Deck / Butterfly",      hanzi: "蝴蝶夹胸器",   pinyin: "húdié jiā xiōng qì",     muscleGroup: "CHEST",       secondary: ["front delt"],                        category: "MACHINE" },
  { id: "cable-chest-fly",           name: "Cable Chest Fly",           hanzi: "绳索夹胸",     pinyin: "shéngsuǒ jiā xiōng",     muscleGroup: "CHEST",       secondary: ["front delt"],                        category: "CABLE" },
  { id: "incline-chest-press-machine", name: "Incline Chest Press Machine", hanzi: "上斜胸部推举", pinyin: "shàngxié xiōngbù tuījǔ", muscleGroup: "UPPER CHEST", secondary: ["triceps"],                          category: "MACHINE" },
  { id: "flat-bench-press",          name: "Flat Bench Press",          hanzi: "平板卧推",     pinyin: "píngbǎn wòtuī",          muscleGroup: "CHEST",       secondary: ["triceps", "front delt"],             category: "BARBELL", instructions: "Lie flat with your eyes under the bar, feet planted, shoulder blades pinched back. Grip slightly wider than shoulders, unrack, and lower the bar to mid-chest with elbows about 45° from your body. Press up and slightly back over your shoulders. Don't bounce the bar off your chest; use a spotter for heavy sets." },
  { id: "incline-dumbbell-press",    name: "Incline Dumbbell Press",    hanzi: "上斜哑铃推举", pinyin: "shàngxié yǎlíng tuījǔ",  muscleGroup: "UPPER CHEST", secondary: ["triceps"],                          category: "DUMBBELL" },

  // Back
  { id: "lat-pulldown-machine",      name: "Lat Pulldown Machine",      hanzi: "高位下拉器",   pinyin: "gāowèi xià lā qì",        muscleGroup: "LATS",        secondary: ["biceps", "rear delt"],              category: "MACHINE", instructions: "Lock your thighs snug under the pad and grip the bar a bit wider than shoulders. Lean back slightly, then pull the bar to your upper chest by driving your elbows down and squeezing your lats. Release up under control to a full stretch. Pull with your back, not your arms — no swinging." },
  { id: "seated-row-machine",        name: "Seated Row Machine",        hanzi: "坐姿划船器",   pinyin: "zuòzī huáchuán qì",       muscleGroup: "MIDDLE BACK", secondary: ["biceps", "lats"],                    category: "MACHINE", instructions: "Chest against the pad, feet planted, grab the handles with arms extended. Row by pulling your elbows straight back and squeezing your shoulder blades together, then extend the arms slowly back to a stretch. Keep your torso still — let your back do the work, not momentum." },
  { id: "cable-lat-pulldown",        name: "Cable Lat Pulldown",        hanzi: "绳索高位下拉", pinyin: "shéngsuǒ gāowèi xià lā",  muscleGroup: "LATS",        secondary: ["biceps"],                           category: "CABLE" },
  { id: "cable-seated-row",          name: "Cable Seated Row",          hanzi: "绳索坐姿划船", pinyin: "shéngsuǒ zuòzī huáchuán", muscleGroup: "MIDDLE BACK", secondary: ["biceps"],                           category: "CABLE" },
  { id: "t-bar-row",                 name: "T-Bar Row",                 hanzi: "T杠划船",      pinyin: "T gàng huáchuán",         muscleGroup: "MIDDLE BACK", secondary: ["lats", "biceps"],                    category: "BARBELL" },
  { id: "assisted-pullup-machine",   name: "Assisted Pull-up Machine",  hanzi: "辅助引体向上机", pinyin: "fǔzhù yǐntǐ xiàngshàng jī", muscleGroup: "LATS",     secondary: ["biceps"],                           category: "MACHINE" },
  { id: "back-extension-machine",    name: "Back Extension Machine",    hanzi: "背部伸展器",   pinyin: "bèibù shēnzhǎn qì",       muscleGroup: "LOWER BACK",  secondary: ["glutes"],                           category: "MACHINE", instructions: "Set the pad against your upper back and plant your feet. Extend by pushing back until your torso is in line with your hips, squeezing your lower back and glutes, then return slowly. Move in a controlled range — don't over-arch past straight." },
  { id: "hyperextension-bench",      name: "Hyperextension Bench",      hanzi: "罗马椅",       pinyin: "luómǎ yǐ",                muscleGroup: "LOWER BACK",  secondary: ["glutes", "hamstrings"],              category: "BODYWEIGHT" },

  // Shoulders
  { id: "shoulder-press-machine",    name: "Shoulder Press Machine",    hanzi: "肩部推举器",   pinyin: "jiānbù tuījǔ qì",         muscleGroup: "FRONT DELT",  secondary: ["side delt", "triceps"],              category: "MACHINE", instructions: "Set the seat so the handles start near shoulder height. Sit tall with your back on the pad. Press straight up until your arms are nearly straight (don't lock hard), then lower under control to about ear level. Keep your shoulders down — don't shrug into the press." },
  { id: "lateral-raise-machine",     name: "Lateral Raise Machine",     hanzi: "侧平举器",     pinyin: "cè píngjǔ qì",            muscleGroup: "SIDE DELT",                                                    category: "MACHINE" },
  { id: "rear-delt-fly-machine",     name: "Rear Delt Fly Machine",     hanzi: "后束飞鸟器",   pinyin: "hòushù fēiniǎo qì",       muscleGroup: "REAR DELT",   secondary: ["traps"],                            category: "MACHINE" },
  { id: "cable-lateral-raise",       name: "Cable Lateral Raise",       hanzi: "绳索侧平举",   pinyin: "shéngsuǒ cè píngjǔ",      muscleGroup: "SIDE DELT",                                                    category: "CABLE" },
  { id: "cable-face-pull",           name: "Cable Face Pull",           hanzi: "绳索面拉",     pinyin: "shéngsuǒ miàn lā",        muscleGroup: "REAR DELT",   secondary: ["traps", "external rotators"],        category: "CABLE" },
  { id: "dumbbell-lateral-raise",    name: "Dumbbell Lateral Raise",    hanzi: "哑铃侧平举",   pinyin: "yǎlíng cè píngjǔ",        muscleGroup: "SIDE DELT",                                                    category: "DUMBBELL" },

  // Arms — Biceps
  { id: "preacher-curl-machine",     name: "Preacher Curl Machine",     hanzi: "牧师弯举器",   pinyin: "mùshī wānjǔ qì",          muscleGroup: "BICEPS",                                                       category: "MACHINE" },
  { id: "cable-bicep-curl",          name: "Cable Bicep Curl",          hanzi: "绳索弯举",     pinyin: "shéngsuǒ wānjǔ",          muscleGroup: "BICEPS",                                                       category: "CABLE" },
  { id: "dumbbell-bicep-curl",       name: "Dumbbell Bicep Curl",       hanzi: "哑铃弯举",     pinyin: "yǎlíng wānjǔ",            muscleGroup: "BICEPS",                                                       category: "DUMBBELL" },
  { id: "barbell-curl",              name: "Barbell Curl",              hanzi: "杠铃弯举",     pinyin: "gànglíng wānjǔ",          muscleGroup: "BICEPS",                                                       category: "BARBELL" },
  { id: "hammer-curl",               name: "Hammer Curl",               hanzi: "锤式弯举",     pinyin: "chuíshì wānjǔ",           muscleGroup: "BICEPS",      secondary: ["brachialis"],                        category: "DUMBBELL" },

  // Arms — Triceps
  { id: "tricep-pushdown",           name: "Tricep Pushdown Machine",   hanzi: "绳索下压",     pinyin: "shéngsuǒ xià yā",         muscleGroup: "TRICEPS",                                                      category: "CABLE" },
  { id: "overhead-tricep-extension", name: "Overhead Tricep Extension", hanzi: "过顶三头伸展", pinyin: "guòdǐng sāntóu shēnzhǎn", muscleGroup: "TRICEPS",                                                      category: "CABLE" },
  { id: "tricep-dip-machine",        name: "Tricep Dip Machine",        hanzi: "三头肌臂屈伸器", pinyin: "sāntóujī bì qūshēn qì",  muscleGroup: "TRICEPS",                                                      category: "MACHINE" },
  { id: "skull-crusher",             name: "Skull Crusher",             hanzi: "颅骨破碎机",   pinyin: "lúgǔ pòsuì jī",           muscleGroup: "TRICEPS",                                                      category: "BARBELL" },

  // Legs
  { id: "hack-squat-machine",        name: "Hack Squat",                hanzi: "正向哈克深蹲", pinyin: "zhèngxiàng hākè shēndūn", muscleGroup: "QUADS",       secondary: ["glutes", "hamstrings"],              category: "MACHINE" },
  { id: "reverse-hack-squat",        name: "Reverse Hack Squat",        hanzi: "反向哈克深蹲", pinyin: "fǎnxiàng hākè shēndūn",   muscleGroup: "GLUTES",      secondary: ["hamstrings", "quads"],               category: "MACHINE" },
  { id: "leg-press-machine",         name: "Power Leg Press",           hanzi: "仰卧倒蹬训练器", pinyin: "yǎngwò dàodēng xùnliàn qì", muscleGroup: "QUADS",     secondary: ["glutes", "hamstrings"],              category: "MACHINE", instructions: "Feet shoulder-width on the platform, back and hips flat on the pad. Unlock the safeties, then lower by bending your knees to about 90° (knees tracking over your toes). Press through your heels back up — stop just short of locking your knees. Never let your lower back round off the pad." },
  { id: "leg-extension-machine",     name: "Leg Extension",             hanzi: "伸腿训练器",   pinyin: "shēntuǐ xùnliàn qì",      muscleGroup: "QUADS",                                                        category: "MACHINE" },
  { id: "seated-leg-curl",           name: "Seated Leg Curl",           hanzi: "坐式曲腿训练器", pinyin: "zuòshì qū tuǐ xùnliàn qì", muscleGroup: "HAMSTRINGS",                                                category: "MACHINE" },
  { id: "lying-leg-curl",            name: "Lying Leg Curl",            hanzi: "卧式屈腿训练器", pinyin: "wòshì qū tuǐ xùnliàn qì", muscleGroup: "HAMSTRINGS",                                                category: "MACHINE" },
  { id: "hip-adductor-machine",      name: "Hip Adductor (Inner Thigh)",hanzi: "内弯训练器",   pinyin: "nèi wān xùnliàn qì",      muscleGroup: "INNER THIGH", secondary: ["adductors"],                         category: "MACHINE", instructions: "Sit with your legs on the OUTSIDE of the pads, knees apart. Squeeze your knees together against the resistance, pause briefly, then open slowly back to a comfortable stretch. Keep your back on the seat and control the return — don't let it snap open." },
  { id: "hip-abductor-machine",      name: "Hip Abductor (Outer Thigh)",hanzi: "外弯训练器",   pinyin: "wài wān xùnliàn qì",      muscleGroup: "GLUTES",      secondary: ["hip abductors"],                     category: "MACHINE", instructions: "Sit with your legs on the INSIDE of the pads, knees together. Push your knees apart against the resistance as far as is comfortable, pause, then return slowly. Sit upright with your back on the pad and keep the motion smooth." },
  { id: "glute-kickback-machine",    name: "Glute Kickback / Rear Kick",hanzi: "臀部后踢器",   pinyin: "túnbù hòu tī qì",         muscleGroup: "GLUTES",      secondary: ["hamstrings"],                        category: "MACHINE" },
  { id: "calf-raise-machine",        name: "Calf Raise Machine",        hanzi: "提踵器",       pinyin: "tí zhǒng qì",             muscleGroup: "CALVES",                                                       category: "MACHINE" },
  { id: "smith-machine-squat",       name: "Smith Machine Squat",       hanzi: "史密斯深蹲",   pinyin: "shǐmìsī shēndūn",         muscleGroup: "QUADS",       secondary: ["glutes"],                           category: "MACHINE" },

  // Core / Abs
  { id: "ab-crunch-machine",         name: "Ab Crunch Machine",         hanzi: "腹部卷曲器",   pinyin: "fùbù juǎnqū qì",          muscleGroup: "ABS",                                                          category: "MACHINE", instructions: "Set the seat and hold the handles/shoulder pads. Crunch by curling your ribs toward your hips using your abs — not by pulling with your arms — then return slowly under control. Exhale as you crunch and keep tension on your abs the whole set." },
  { id: "cable-crunch",              name: "Cable Crunch",              hanzi: "绳索卷腹",     pinyin: "shéngsuǒ juǎnfù",         muscleGroup: "ABS",                                                          category: "CABLE" },
  { id: "roman-chair-situp",         name: "Roman Chair Sit-up",        hanzi: "罗马椅仰卧起坐", pinyin: "luómǎ yǐ yǎngwò qǐzuò",  muscleGroup: "ABS",         secondary: ["hip flexors"],                       category: "BODYWEIGHT" },
  { id: "captains-chair-leg-raise",  name: "Captain's Chair Leg Raise", hanzi: "队长椅抬腿",   pinyin: "duìzhǎng yǐ tái tuǐ",     muscleGroup: "LOWER ABS",   secondary: ["hip flexors"],                       category: "BODYWEIGHT" },

  // Cardio
  { id: "treadmill",                 name: "Treadmill",                 hanzi: "跑步机",       pinyin: "pǎobù jī",                muscleGroup: "CARDIO",                                                       category: "CARDIO" },
  { id: "stationary-bike",           name: "Stationary Bike",           hanzi: "固定自行车",   pinyin: "gùdìng zìxíngchē",        muscleGroup: "CARDIO",                                                       category: "CARDIO" },
  { id: "rowing-machine",            name: "Rowing Machine",            hanzi: "划船机",       pinyin: "huáchuán jī",             muscleGroup: "CARDIO",                                                       category: "CARDIO" },
  { id: "elliptical",                name: "Elliptical",                hanzi: "椭圆机",       pinyin: "tuǒyuán jī",              muscleGroup: "CARDIO",                                                       category: "CARDIO" },
  { id: "stair-climber",             name: "Stair Climber",             hanzi: "登梯机",       pinyin: "dēngtī jī",               muscleGroup: "CARDIO",                                                       category: "CARDIO" },
];

// How-to text for every machine that didn't already carry inline instructions,
// so each card in the equipment list has a proper "CARA PAKAI" guide. Setup →
// movement → key form/safety cue, in the same plain, practical voice.
const HOWTO: Record<string, string> = {
  "pec-deck":
    "Set the seat so the handles sit at chest height and your forearms rest flat on the pads. Sit back with your shoulder blades pinned, then squeeze the pads together in front of your chest using your chest — pause, then open slowly to a comfortable stretch. Keep a slight bend in your elbows and don't let the weight yank your arms back.",
  "cable-chest-fly":
    "Set both pulleys around chest height and take a handle in each hand, one foot staggered forward for balance. With a slight, fixed elbow bend, sweep your hands together in front of your chest in a wide arc and squeeze. Return slowly to a stretch without letting your shoulders roll forward. Think 'hugging', not pressing.",
  "incline-chest-press-machine":
    "Set the seat so the handles line up with your upper chest. Sit back with your shoulder blades pinned and feet flat. Press the handles up and forward until your arms are almost straight, then lower slowly to a light stretch. Keep your back on the pad and don't lock the elbows hard.",
  "incline-dumbbell-press":
    "Set the bench to about 30°. Sit back with a dumbbell in each hand at upper-chest level, palms facing forward. Press up and slightly together until your arms are nearly straight, then lower under control to a stretch. Keep your shoulder blades pinched and don't clang the dumbbells at the top.",
  "cable-lat-pulldown":
    "Grip the bar a bit wider than your shoulders and lock your thighs under the pad. Lean back slightly, then pull the bar to your upper chest by driving your elbows down and squeezing your lats. Release up under control to a full stretch. Pull with your back, not your arms, and don't swing.",
  "cable-seated-row":
    "Sit with your feet braced and knees slightly bent; grab the handle with arms extended and back straight. Row by pulling your elbows back and squeezing your shoulder blades together, then extend slowly forward to a stretch. Keep your torso upright and still — no jerking with the lower back.",
  "t-bar-row":
    "Straddle the bar, hinge at the hips with a flat back and knees slightly bent, and grip the handles. Row the weight to your upper belly by driving your elbows back and squeezing your back, then lower under control. Keep your chest up and back flat — don't round or heave with your legs.",
  "assisted-pullup-machine":
    "Set the assist weight (more weight = more help), kneel or stand on the pad, and grip the bar wider than your shoulders. Pull up until your chin clears the bar by driving your elbows down, then lower slowly to a full hang. Keep it controlled — no kipping — and reduce the assist over time as you get stronger.",
  "hyperextension-bench":
    "Set the pad just below your hips and hook your feet. With arms crossed or hands at your temples, hinge down at the hips with a flat back, then raise your torso until it's in line with your legs, squeezing your glutes and lower back. Don't over-arch past straight, and move smoothly instead of swinging.",
  "lateral-raise-machine":
    "Set the seat so the pads rest against your outer arms just above the elbows. Sit tall and raise your arms out to the sides to about shoulder height, leading with your elbows, then lower slowly. Keep the work in your side delts — don't shrug your traps or use momentum.",
  "rear-delt-fly-machine":
    "Sit facing the pad with your chest against it and grab the handles with arms extended in front. Pull the handles out and back in a wide arc, squeezing your shoulder blades and rear delts, then return slowly. Keep a slight elbow bend and lead with the elbows — don't yank with your arms.",
  "cable-lateral-raise":
    "Set the pulley to its lowest point and stand side-on, holding the handle in your outside hand across your body. Raise your arm out to the side to shoulder height with a slight elbow bend, then lower slowly against the cable's pull. Keep your torso still and lead with the elbow — no swinging.",
  "cable-face-pull":
    "Set a rope at about head height. Grab both ends with palms facing in, step back to tension, and pull the rope toward your face, splitting your hands apart and driving your elbows high and back. Squeeze your rear delts, then extend slowly. Keep your upper arms parallel to the floor — 'pull apart', not just back.",
  "dumbbell-lateral-raise":
    "Stand with a dumbbell in each hand at your sides, a slight bend in your elbows. Raise your arms out to the sides to about shoulder height, leading with your elbows, then lower slowly. Don't swing or shrug — keep the tension on your side delts and control the way down.",
  "preacher-curl-machine":
    "Set the seat so your upper arms rest flat on the angled pad, armpits near the top. Grip the handles and curl up by squeezing your biceps, then lower slowly to a near-full stretch. Keep your upper arms glued to the pad and don't let the weight jerk your elbows at the bottom.",
  "cable-bicep-curl":
    "Set the pulley low and attach a bar or handles. Stand tall with your elbows tucked at your sides, and curl up by squeezing your biceps while keeping your upper arms still. Lower slowly against the cable. Don't swing your body or let your elbows drift forward.",
  "dumbbell-bicep-curl":
    "Stand or sit with a dumbbell in each hand, arms at your sides, palms facing forward. Curl the weights up by bending at the elbow and squeezing your biceps, keeping your upper arms still, then lower slowly. Avoid swinging — control both up and down.",
  "barbell-curl":
    "Stand holding a barbell with an underhand grip about shoulder-width, elbows at your sides. Curl the bar up by squeezing your biceps while keeping your upper arms still, then lower slowly to nearly straight. Don't rock your body or swing the bar up — let the biceps do the work.",
  "hammer-curl":
    "Stand with a dumbbell in each hand, palms facing your body (thumbs up). Curl the weights up keeping that neutral grip, squeezing your biceps and forearms, then lower slowly. Keep your elbows tucked and still — no swinging.",
  "tricep-pushdown":
    "Attach a bar or rope to the top pulley. Stand tall with your elbows tucked at your sides, and push the handle down until your arms are straight, squeezing your triceps. Return slowly to about 90° without letting your elbows flare. Only your forearms move — keep the upper arms pinned.",
  "overhead-tricep-extension":
    "Face away from the pulley with a rope, arms overhead and elbows bent. Extend your arms forward/up by squeezing your triceps, keeping your upper arms beside your head, then lower slowly to a stretch behind your head. Keep your elbows pointing forward, not flaring out.",
  "tricep-dip-machine":
    "Set the seat and grip the handles with your arms bent. Press down until your arms are almost straight, squeezing your triceps, then return slowly to a stretch. Keep your torso upright and shoulders down, and don't lock your elbows hard at the bottom.",
  "skull-crusher":
    "Lie on a flat bench holding an EZ-bar or barbell with arms extended over your chest. Bend at the elbows to lower the bar toward your forehead, keeping your upper arms still, then extend back up by squeezing your triceps. Keep your elbows pointing up, move slowly, and use a manageable weight.",
  "hack-squat-machine":
    "Set your shoulders under the pads, feet shoulder-width on the platform, back flat against the pad. Unlock the safeties, then lower by bending your knees to about 90°, heels down and knees tracking over your toes. Drive back up through your heels without locking the knees hard. Keep your back and hips flat on the pad.",
  "reverse-hack-squat":
    "Face the pad with your chest and shoulders against it and feet on the platform. Lower into a squat by pushing your hips back and bending your knees while keeping your chest on the pad, then drive up through your heels. Great for glutes — keep your knees tracking over your toes and don't round your back.",
  "leg-extension-machine":
    "Sit with your back against the pad and the roller on your lower shins, knees at the seat's edge. Extend your legs until nearly straight, squeezing your quads at the top, then lower slowly. Don't kick explosively or slam the weight down — control both directions.",
  "seated-leg-curl":
    "Sit with your back on the pad, the roller behind your lower calves and the thigh pad locked over your legs. Curl your heels down and back toward your glutes by squeezing your hamstrings, then return slowly. Keep your thighs down and don't arch — smooth and controlled.",
  "lying-leg-curl":
    "Lie face-down with the roller on your lower calves and hips flat on the pad. Curl your heels toward your glutes by squeezing your hamstrings, then lower slowly. Keep your hips pressed down — don't let them lift off the pad to cheat the weight up.",
  "glute-kickback-machine":
    "Brace your torso against the pad and place one foot on the lever. Push the lever back and up by driving through your heel and squeezing your glute, then return slowly. Keep a slight knee bend and don't over-arch your lower back — the motion comes from the hip.",
  "calf-raise-machine":
    "Place the balls of your feet on the platform with your heels hanging off, pads or shoulders bearing the weight. Rise up onto your toes as high as you can, squeezing your calves, then lower slowly to a deep stretch below the platform. Full range with a pause at the top beats bouncing.",
  "smith-machine-squat":
    "Set the bar across your upper back and unrack by rotating it off the hooks. With feet shoulder-width and slightly forward of the bar, squat down to about parallel by bending your knees and hips, chest up. Drive back up through your heels. Re-rack by twisting the bar; keep your back neutral throughout.",
  "cable-crunch":
    "Kneel below a high pulley holding a rope at the sides of your head. Crunch down by curling your ribs toward your hips with your abs, rounding your upper back, then return slowly. Keep your hips still and your arms fixed — bend at the waist, don't just pull with your arms.",
  "roman-chair-situp":
    "Anchor your feet and set your hips on the pad. Lower your torso back until it's roughly in line with your legs, then curl back up by contracting your abs. Arms crossed on your chest is easier; hands behind your head is harder. Move under control — don't drop back or heave up.",
  "captains-chair-leg-raise":
    "Support yourself on the forearm pads with your back against the rest and legs hanging. Raise your knees (or straight legs, for more difficulty) toward your chest by curling your pelvis up with your lower abs, then lower slowly. Don't swing — it's a controlled curl, not a kick.",
  treadmill:
    "Clip the safety cord to your clothing, start at a slow walk, then set your speed and incline. Stand tall and let your arms swing naturally — avoid gripping the rails once you're steady. Ease back down to a walk to cool off before you stop.",
  "stationary-bike":
    "Set the seat so your knee has a slight bend at the bottom of the pedal stroke. Choose your resistance, sit tall with a light grip on the handles, and pedal at a steady cadence. Bump resistance or speed for intervals. Keep your knees tracking straight, not flaring out.",
  "rowing-machine":
    "Strap in your feet and grab the handle. Drive with your legs first, then lean back slightly and pull the handle to your lower ribs — legs, hips, then arms. Reverse the order coming back: arms out, hinge forward, then bend the knees. Smooth and powerful, not jerky.",
  elliptical:
    "Step onto the pedals and hold the moving handles. Stride in a smooth, natural motion, pushing and pulling with both arms and legs while keeping your posture upright. Adjust resistance or incline for intensity. Keep your heels down and don't slump onto the handles.",
  "stair-climber":
    "Step on and start slow, standing tall with a light grip on the rails for balance. Take full steps and let your legs do the work — don't lean heavily on the handrails, which cuts the effort. Adjust the speed to keep a steady, sustainable rhythm.",
};

// Fill in any machine missing inline instructions, so every card has a how-to.
for (const e of EQUIPMENT) {
  if (!e.instructions && HOWTO[e.id]) e.instructions = HOWTO[e.id];
}

export const EQUIPMENT_CATEGORIES: EquipmentCategory[] = [
  "MACHINE",
  "CABLE",
  "BARBELL",
  "DUMBBELL",
  "BODYWEIGHT",
  "CARDIO",
];

function stripTones(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalize(s: string): string {
  return stripTones(s).toLowerCase().trim();
}

/**
 * Ranked, forgiving machine search — the workout twin of /api/foods/search.
 * Expands the query with EN↔ID synonyms + typo fixes (lib/equipmentAliases), then
 * scores each row and returns ALL matches sorted best-first (the equipment page's
 * "N / total" count depends on returning every match, never an internal slice).
 * Empty query returns the full list. `pickRank` (optional) floats the user's most-
 * used machines up — wired in a later slice.
 */
export function searchEquipment(
  query: string,
  list: Equipment[] = EQUIPMENT,
  pickRank?: Map<string, number>
): Equipment[] {
  const raw = query.trim();
  const q = normalize(query);
  if (!q) return list;

  const { terms, wordGroups, allTerms } = expandEquipmentQuery(q);
  const scored: { e: Equipment; score: number }[] = [];

  // Word-boundary match so short tokens (lat, row, dip, arm) don't match inside
  // unrelated words ("flat", "grow", "adipose", "warm").
  const wordHit = (hay: string, t: string) =>
    new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(hay);

  for (const e of list) {
    const name = normalize(e.name);
    // Recall blob: name + pinyin + muscle group + secondary muscles. Instructions
    // are deliberately excluded (they flood e.g. "triceps" into every press).
    const searchText = normalize(
      `${e.name} ${e.pinyin} ${e.muscleGroup} ${(e.secondary ?? []).join(" ")}`
    );

    let s = 0;
    if (name === q) s += 1000;
    if (raw && e.hanzi.includes(raw)) s += 400; // Chinese query
    if (terms.some((t) => name.startsWith(t))) s += 500;
    if (terms.some((t) => wordHit(name, t))) s += 250;
    if (allTerms.some((t) => wordHit(name, t))) s += 120;
    if (allTerms.some((t) => wordHit(searchText, t))) s += 60;
    // Concept coverage: +45 per query word-group that matches anywhere, so a
    // multi-word/translated query beats a one-word incidental hit.
    for (const grp of wordGroups) {
      if (grp.some((g) => wordHit(searchText, g))) s += 45;
    }
    if (pickRank?.has(e.id)) {
      s += Math.max(0, 300 - (pickRank.get(e.id) as number) * 20);
    }

    if (s > 0) {
      s -= name.length * 0.4; // gentle "shorter name wins" tiebreak
      scored.push({ e, score: s });
    }
  }

  scored.sort((a, b) => b.score - a.score || a.e.name.length - b.e.name.length);
  return scored.map((x) => x.e);
}

export function getEquipment(id: string): Equipment | undefined {
  return EQUIPMENT.find((e) => e.id === id);
}
