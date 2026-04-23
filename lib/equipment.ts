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
  { id: "chest-press-machine",       name: "Chest Press Machine",       hanzi: "胸部推举器",   pinyin: "xiōngbù tuījǔ qì",       muscleGroup: "CHEST",       secondary: ["triceps", "front delt"],             category: "MACHINE" },
  { id: "pec-deck",                  name: "Pec Deck / Butterfly",      hanzi: "蝴蝶夹胸器",   pinyin: "húdié jiā xiōng qì",     muscleGroup: "CHEST",       secondary: ["front delt"],                        category: "MACHINE" },
  { id: "cable-chest-fly",           name: "Cable Chest Fly",           hanzi: "绳索夹胸",     pinyin: "shéngsuǒ jiā xiōng",     muscleGroup: "CHEST",       secondary: ["front delt"],                        category: "CABLE" },
  { id: "incline-chest-press-machine", name: "Incline Chest Press Machine", hanzi: "上斜胸部推举", pinyin: "shàngxié xiōngbù tuījǔ", muscleGroup: "UPPER CHEST", secondary: ["triceps"],                          category: "MACHINE" },
  { id: "flat-bench-press",          name: "Flat Bench Press",          hanzi: "平板卧推",     pinyin: "píngbǎn wòtuī",          muscleGroup: "CHEST",       secondary: ["triceps", "front delt"],             category: "BARBELL" },
  { id: "incline-dumbbell-press",    name: "Incline Dumbbell Press",    hanzi: "上斜哑铃推举", pinyin: "shàngxié yǎlíng tuījǔ",  muscleGroup: "UPPER CHEST", secondary: ["triceps"],                          category: "DUMBBELL" },

  // Back
  { id: "lat-pulldown-machine",      name: "Lat Pulldown Machine",      hanzi: "高位下拉器",   pinyin: "gāowèi xià lā qì",        muscleGroup: "LATS",        secondary: ["biceps", "rear delt"],              category: "MACHINE" },
  { id: "seated-row-machine",        name: "Seated Row Machine",        hanzi: "坐姿划船器",   pinyin: "zuòzī huáchuán qì",       muscleGroup: "MIDDLE BACK", secondary: ["biceps", "lats"],                    category: "MACHINE" },
  { id: "cable-lat-pulldown",        name: "Cable Lat Pulldown",        hanzi: "绳索高位下拉", pinyin: "shéngsuǒ gāowèi xià lā",  muscleGroup: "LATS",        secondary: ["biceps"],                           category: "CABLE" },
  { id: "cable-seated-row",          name: "Cable Seated Row",          hanzi: "绳索坐姿划船", pinyin: "shéngsuǒ zuòzī huáchuán", muscleGroup: "MIDDLE BACK", secondary: ["biceps"],                           category: "CABLE" },
  { id: "t-bar-row",                 name: "T-Bar Row",                 hanzi: "T杠划船",      pinyin: "T gàng huáchuán",         muscleGroup: "MIDDLE BACK", secondary: ["lats", "biceps"],                    category: "BARBELL" },
  { id: "assisted-pullup-machine",   name: "Assisted Pull-up Machine",  hanzi: "辅助引体向上机", pinyin: "fǔzhù yǐntǐ xiàngshàng jī", muscleGroup: "LATS",     secondary: ["biceps"],                           category: "MACHINE" },
  { id: "back-extension-machine",    name: "Back Extension Machine",    hanzi: "背部伸展器",   pinyin: "bèibù shēnzhǎn qì",       muscleGroup: "LOWER BACK",  secondary: ["glutes"],                           category: "MACHINE" },
  { id: "hyperextension-bench",      name: "Hyperextension Bench",      hanzi: "罗马椅",       pinyin: "luómǎ yǐ",                muscleGroup: "LOWER BACK",  secondary: ["glutes", "hamstrings"],              category: "BODYWEIGHT" },

  // Shoulders
  { id: "shoulder-press-machine",    name: "Shoulder Press Machine",    hanzi: "肩部推举器",   pinyin: "jiānbù tuījǔ qì",         muscleGroup: "FRONT DELT",  secondary: ["side delt", "triceps"],              category: "MACHINE" },
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
  { id: "leg-press-machine",         name: "Power Leg Press",           hanzi: "仰卧倒蹬训练器", pinyin: "yǎngwò dàodēng xùnliàn qì", muscleGroup: "QUADS",     secondary: ["glutes", "hamstrings"],              category: "MACHINE" },
  { id: "leg-extension-machine",     name: "Leg Extension",             hanzi: "伸腿训练器",   pinyin: "shēntuǐ xùnliàn qì",      muscleGroup: "QUADS",                                                        category: "MACHINE" },
  { id: "seated-leg-curl",           name: "Seated Leg Curl",           hanzi: "坐式曲腿训练器", pinyin: "zuòshì qū tuǐ xùnliàn qì", muscleGroup: "HAMSTRINGS",                                                category: "MACHINE" },
  { id: "lying-leg-curl",            name: "Lying Leg Curl",            hanzi: "卧式屈腿训练器", pinyin: "wòshì qū tuǐ xùnliàn qì", muscleGroup: "HAMSTRINGS",                                                category: "MACHINE" },
  { id: "hip-adductor-machine",      name: "Hip Adductor (Inner Thigh)",hanzi: "内弯训练器",   pinyin: "nèi wān xùnliàn qì",      muscleGroup: "INNER THIGH", secondary: ["adductors"],                         category: "MACHINE" },
  { id: "hip-abductor-machine",      name: "Hip Abductor (Outer Thigh)",hanzi: "外弯训练器",   pinyin: "wài wān xùnliàn qì",      muscleGroup: "GLUTES",      secondary: ["hip abductors"],                     category: "MACHINE" },
  { id: "glute-kickback-machine",    name: "Glute Kickback / Rear Kick",hanzi: "臀部后踢器",   pinyin: "túnbù hòu tī qì",         muscleGroup: "GLUTES",      secondary: ["hamstrings"],                        category: "MACHINE" },
  { id: "calf-raise-machine",        name: "Calf Raise Machine",        hanzi: "提踵器",       pinyin: "tí zhǒng qì",             muscleGroup: "CALVES",                                                       category: "MACHINE" },
  { id: "smith-machine-squat",       name: "Smith Machine Squat",       hanzi: "史密斯深蹲",   pinyin: "shǐmìsī shēndūn",         muscleGroup: "QUADS",       secondary: ["glutes"],                           category: "MACHINE" },

  // Core / Abs
  { id: "ab-crunch-machine",         name: "Ab Crunch Machine",         hanzi: "腹部卷曲器",   pinyin: "fùbù juǎnqū qì",          muscleGroup: "ABS",                                                          category: "MACHINE" },
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

export function searchEquipment(query: string, list: Equipment[] = EQUIPMENT): Equipment[] {
  const q = normalize(query);
  if (!q) return list;
  return list.filter((e) => {
    if (normalize(e.name).includes(q)) return true;
    if (e.hanzi.includes(query.trim())) return true;
    if (normalize(e.pinyin).replace(/\s+/g, "").includes(q.replace(/\s+/g, ""))) return true;
    if (normalize(e.muscleGroup).includes(q)) return true;
    return false;
  });
}

export function getEquipment(id: string): Equipment | undefined {
  return EQUIPMENT.find((e) => e.id === id);
}
