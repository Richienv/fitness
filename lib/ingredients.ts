export type Macros = {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
};

export type IngredientTag = "recommended" | "limit" | "best" | "good";

export type Ingredient = {
  id: string;
  name: string;
  zh?: string;
  pinyin?: string;
  unit: string;
  group: "protein" | "carb" | "vegetable" | "extra";
  favorite?: boolean;
  tag?: IngredientTag;
  sodium?: number; // mg
  sugar?: number;  // g
  /** Stepper increment. Defaults to 1. For oats this is 0.5 (half scoop). */
  step?: number;
  /** Grams per 1 unit — lets the UI show "1.5 scoops (60g)". */
  gramsPerUnit?: number;
  /** Short note shown inline on the ingredient card. */
  note?: string;
} & Macros;

export const INGREDIENTS: Ingredient[] = [
  // Proteins
  { id: "egg",          name: "Whole egg",        zh: "鸡蛋",     pinyin: "jī dàn",       unit: "1 egg",           group: "protein", favorite: true, kcal: 70,  protein: 6,  fat: 5,  carbs: 0.5 },
  { id: "chicken-breast", name: "Chicken breast", zh: "鸡胸肉",   pinyin: "jī xiōng ròu", unit: "1 breast (250g)", group: "protein", favorite: true, kcal: 275, protein: 52, fat: 6,  carbs: 0 },
  { id: "chicken-thigh", name: "Chicken thigh",   zh: "鸡腿",     pinyin: "jī tuǐ",       unit: "1 thigh (150g)",  group: "protein", favorite: true, kcal: 220, protein: 24, fat: 14, carbs: 0 },
  { id: "beef-slice",   name: "Beef slice",       zh: "牛肉片",   pinyin: "niú ròu piàn", unit: "1 slice (30g)",   group: "protein", favorite: true, kcal: 54,  protein: 5,  fat: 4,  carbs: 0 },
  { id: "whey",         name: "Whey scoop",       zh: "乳清蛋白", pinyin: "rǔ qīng dàn bái", unit: "1 scoop",     group: "protein", kcal: 120, protein: 25, fat: 2,  carbs: 3 },
  { id: "greek-yogurt", name: "Greek yogurt",     zh: "希腊酸奶", pinyin: "xī là suān nǎi", unit: "150g",         group: "protein", kcal: 100, protein: 10, fat: 3,  carbs: 8 },
  { id: "tofu",         name: "Tofu",             zh: "豆腐",     pinyin: "dòu fu",       unit: "100g",            group: "protein", kcal: 76,  protein: 8,  fat: 4,  carbs: 2 },
  { id: "salmon",       name: "Salmon",           zh: "三文鱼",   pinyin: "sān wén yú",   unit: "150g",            group: "protein", kcal: 280, protein: 30, fat: 17, carbs: 0 },

  // Carbs — Rice & grains
  { id: "purple-rice",  name: "Purple rice",    zh: "紫米饭",   pinyin: "zǐ mǐ fàn",   unit: "100g",     group: "carb", tag: "recommended", kcal: 180, protein: 4, fat: 1, carbs: 38 },
  { id: "white-rice",   name: "White rice",     zh: "白米饭",   pinyin: "bái mǐ fàn",  unit: "100g",     group: "carb", favorite: true, tag: "limit", kcal: 130, protein: 3, fat: 0, carbs: 28 },
  { id: "brown-rice",   name: "Brown rice",     zh: "糙米",     pinyin: "cāo mǐ",      unit: "100g",     group: "carb", kcal: 150, protein: 3, fat: 1, carbs: 32 },
  { id: "oats",         name: "Oats (Member's Mark)", zh: "燕麦片", pinyin: "yàn mài piàn", unit: "1 scoop (30g)", group: "carb", tag: "best", step: 0.5, gramsPerUnit: 30, sodium: 15, note: "Contains chia seeds + flaxseeds — omega-3, extra fiber", kcal: 111, protein: 4, fat: 2, carbs: 20 },
  { id: "granola",      name: "Granola",        zh: "格兰诺拉", pinyin: "gé lán nuò lā", unit: "30g",    group: "carb", kcal: 150, protein: 4, fat: 6, carbs: 20 },
  // Carbs — Potato & root
  { id: "sweet-potato", name: "Sweet potato",   zh: "红薯",     pinyin: "hóng shǔ",    unit: "100g",     group: "carb", tag: "recommended", kcal: 86,  protein: 2, fat: 0, carbs: 20 },
  { id: "potato",       name: "Potato",         zh: "土豆",     pinyin: "tǔ dòu",      unit: "100g",     group: "carb", kcal: 77,  protein: 2, fat: 0, carbs: 17 },
  // Carbs — Fruit carbs
  { id: "banana",       name: "Banana",         zh: "香蕉",     pinyin: "xiāng jiāo",  unit: "1 whole",  group: "carb", favorite: true, tag: "recommended", kcal: 105, protein: 1, fat: 0, carbs: 27 },
  { id: "melon",        name: "Melon",          zh: "哈密瓜",   pinyin: "hā mì guā",   unit: "quarter",  group: "carb", favorite: true, kcal: 50,  protein: 0, fat: 0, carbs: 12 },
  { id: "apple",        name: "Apple",          zh: "苹果",     pinyin: "píng guǒ",    unit: "1 medium", group: "carb", kcal: 95,  protein: 0, fat: 0, carbs: 25 },
  { id: "mango",        name: "Mango",          zh: "芒果",     pinyin: "máng guǒ",    unit: "100g",     group: "carb", kcal: 60,  protein: 1, fat: 0, carbs: 15 },
  { id: "grapes",       name: "Grapes",         zh: "葡萄",     pinyin: "pú táo",      unit: "100g",     group: "carb", kcal: 69,  protein: 1, fat: 0, carbs: 18 },
  { id: "pineapple",    name: "Pineapple",      zh: "菠萝",     pinyin: "bō luó",      unit: "100g",     group: "carb", kcal: 50,  protein: 0, fat: 0, carbs: 13 },
  { id: "blueberries",  name: "Blueberries",    zh: "蓝莓",     pinyin: "lán méi",     unit: "50g",      group: "carb", kcal: 29,  protein: 0, fat: 0, carbs: 7 },
  { id: "mixed-fruits", name: "Mixed fruits",   zh: "什锦水果", pinyin: "shí jǐn shuǐ guǒ", unit: "150g", group: "carb", kcal: 90,  protein: 1, fat: 0, carbs: 22 },
  // Carbs — Bread & noodles
  { id: "noodles",      name: "Noodles",        zh: "面条",     pinyin: "miàn tiáo",   unit: "100g dry", group: "carb", favorite: true, tag: "limit", kcal: 350, protein: 12, fat: 2, carbs: 70 },
  { id: "bread",        name: "Bread",          zh: "面包",     pinyin: "miàn bāo",    unit: "1 slice",  group: "carb", tag: "limit", kcal: 80,  protein: 3, fat: 1, carbs: 15 },

  // Vegetables
  { id: "enoki",        name: "Enoki",          zh: "金针菇",   pinyin: "jīn zhēn gū", unit: "½ pack · 50g",    group: "vegetable", favorite: true, kcal: 19, protein: 2, fat: 0, carbs: 4 },
  { id: "tomato",       name: "Tomato",         zh: "番茄",     pinyin: "fān qié",     unit: "1 whole · 150g",  group: "vegetable", favorite: true, kcal: 27, protein: 1, fat: 0, carbs: 6 },
  { id: "eggplant",     name: "Eggplant",       zh: "茄子",     pinyin: "qié zi",      unit: "½ eggplant · 100g", group: "vegetable", favorite: true, kcal: 35, protein: 1, fat: 0, carbs: 8 },
  { id: "broccoli",     name: "Broccoli",       zh: "西兰花",   pinyin: "xī lán huā",  unit: "¼ head · 75g",    group: "vegetable", favorite: true, tag: "best", kcal: 26, protein: 2, fat: 0, carbs: 5 },
  // Best picks
  { id: "spinach",      name: "Spinach",        zh: "菠菜",     pinyin: "bō cài",      unit: "100g", group: "vegetable", tag: "best", step: 0.5, gramsPerUnit: 100, sodium: 79, note: "Iron + magnesium. Better gym pump. Cook in 2 min.",              kcal: 23, protein: 2.9, fat: 0.4, carbs: 3.6 },
  { id: "asparagus",    name: "Asparagus",      zh: "芦笋",     pinyin: "lú sǔn",      unit: "100g", group: "vegetable", tag: "best", step: 0.5, gramsPerUnit: 100, sodium: 2,  note: "Lowest calorie vegetable. Natural diuretic = less face puffiness.", kcal: 20, protein: 2.2, fat: 0.1, carbs: 3.9 },
  { id: "bok-choy",     name: "Bok choy",       zh: "小白菜",   pinyin: "xiǎo bái cài",unit: "100g", group: "vegetable", tag: "best", step: 0.5, gramsPerUnit: 100, sodium: 65, note: "Lowest calorie. High calcium. Easy to find everywhere in China.", kcal: 13, protein: 1.5, fat: 0.2, carbs: 2.2 },
  // Mushrooms
  { id: "king-oyster-mushroom", name: "King oyster mushroom", zh: "杏鲍菇", pinyin: "xìng bào gū", unit: "100g", group: "vegetable", tag: "best", step: 0.5, gramsPerUnit: 100, sodium: 2,  note: "Highest protein mushroom. Meaty texture. Best air fried.", kcal: 35, protein: 3.3, fat: 0.4, carbs: 6 },
  { id: "shiitake-mushroom",    name: "Shiitake mushroom",    zh: "香菇",   pinyin: "xiāng gū",    unit: "100g", group: "vegetable", tag: "best", step: 0.5, gramsPerUnit: 100, sodium: 9,  note: "Immune boost + testosterone support. Rich umami.",        kcal: 34, protein: 2.2, fat: 0.5, carbs: 7 },
  { id: "oyster-mushroom",      name: "Oyster mushroom",      zh: "平菇",   pinyin: "píng gū",     unit: "100g", group: "vegetable", tag: "good", step: 0.5, gramsPerUnit: 100, sodium: 18, note: "Same protein as king oyster. Cheaper. Good stir fry.",    kcal: 33, protein: 3.3, fat: 0.4, carbs: 6 },
  { id: "white-button-mushroom",name: "White button mushroom",zh: "白蘑菇", pinyin: "bái mó gū",   unit: "100g", group: "vegetable",              step: 0.5, gramsPerUnit: 100, sodium: 5,  note: "Lowest calories. Decent protein. Less nutritious overall.", kcal: 22, protein: 3.1, fat: 0.3, carbs: 3 },
  { id: "deer-antler-mushroom", name: "Deer antler mushroom", zh: "鹿茸菇", pinyin: "lù róng gū",  unit: "100g", group: "vegetable",              step: 0.5, gramsPerUnit: 100, sodium: 4,  note: "Similar to enoki. Harder to find. No clear advantage.",   kcal: 32, protein: 2.1, fat: 0.4, carbs: 6 },
  // Other vegetables (alphabetical)
  { id: "bell-pepper",  name: "Bell pepper",    zh: "彩椒",     pinyin: "cǎi jiāo",    unit: "1 whole · 120g",  group: "vegetable", kcal: 36, protein: 1, fat: 0, carbs: 8 },
  { id: "cabbage",      name: "Cabbage",        zh: "卷心菜",   pinyin: "juǎn xīn cài",unit: "100g", group: "vegetable", step: 0.5, gramsPerUnit: 100, sodium: 18, note: "Gut health. Cheap and easy to find in Hangzhou.",       kcal: 25, protein: 1.3, fat: 0.1, carbs: 5.8 },
  { id: "carrot",       name: "Carrot",         zh: "胡萝卜",   pinyin: "hú luó bo",   unit: "100g", group: "vegetable", step: 0.5, gramsPerUnit: 100, sodium: 69, note: "Beta-carotene. Eye health. Good jaw exerciser raw 😄", kcal: 41, protein: 0.9, fat: 0.2, carbs: 9.6 },
  { id: "celery",       name: "Celery",         zh: "芹菜",     pinyin: "qín cài",     unit: "100g", group: "vegetable", step: 0.5, gramsPerUnit: 100, sodium: 80, note: "Almost zero calories. High water content. Good raw snack.", kcal: 16, protein: 0.7, fat: 0.2, carbs: 3.0 },
  { id: "corn",         name: "Corn",           zh: "玉米",     pinyin: "yù mǐ",       unit: "100g", group: "vegetable", step: 0.5, gramsPerUnit: 100, sodium: 15, note: "Higher carbs — use as carb source, not just vegetable.", kcal: 86, protein: 3.3, fat: 1.4, carbs: 19 },
  { id: "cucumber",     name: "Cucumber",       zh: "黄瓜",     pinyin: "huáng guā",   unit: "100g", group: "vegetable", step: 0.5, gramsPerUnit: 100, sodium: 2,  note: "Lowest calorie filler. Hydrating. Great raw snack.",    kcal: 15, protein: 0.7, fat: 0.1, carbs: 3.6 },
  { id: "green-beans",  name: "Green beans",    zh: "四季豆",   pinyin: "sì jì dòu",   unit: "100g", group: "vegetable", step: 0.5, gramsPerUnit: 100, sodium: 6,  note: "High fiber. Good volume filler. Easy air fry.",         kcal: 31, protein: 1.8, fat: 0.1, carbs: 7.1 },
  { id: "okra",         name: "Okra",           zh: "秋葵",     pinyin: "qiū kuí",     unit: "100g", group: "vegetable", kcal: 33, protein: 2, fat: 0, carbs: 7 },
  { id: "zucchini",     name: "Zucchini",       zh: "西葫芦",   pinyin: "xī hú lú",    unit: "100g", group: "vegetable", step: 0.5, gramsPerUnit: 100, sodium: 8,  note: "Low carb, light, easy air fry.",                        kcal: 17, protein: 1.2, fat: 0.3, carbs: 3.1 },

  // Extras — Supplements
  { id: "creatine",         name: "Creatine",             zh: "肌酸",     pinyin: "jī suān",         unit: "10g",           group: "extra", favorite: true, kcal: 0,   protein: 0,  fat: 0,  carbs: 0, sodium: 0,   sugar: 0 },
  { id: "whey-extra",       name: "Whey protein",         zh: "乳清蛋白", pinyin: "rǔ qīng dàn bái", unit: "1 scoop (30g)", group: "extra", favorite: true, kcal: 120, protein: 25, fat: 2,  carbs: 3, sodium: 150, sugar: 2 },
  // Extras — Seasonings & sauces
  { id: "soy-sauce",        name: "Soy sauce",            zh: "生抽",     pinyin: "shēng chōu",      unit: "1 tbsp", group: "extra", favorite: true, kcal: 10,  protein: 1,  fat: 0,  carbs: 1, sodium: 900, sugar: 0 },
  { id: "low-soy-sauce",    name: "Low-sodium soy sauce", zh: "低钠生抽", pinyin: "dī nà shēng chōu",unit: "1 tbsp", group: "extra", kcal: 10,  protein: 1,  fat: 0,  carbs: 1, sodium: 570, sugar: 0 },
  { id: "oyster-sauce",     name: "Oyster sauce",         zh: "蚝油",     pinyin: "háo yóu",         unit: "1 tbsp", group: "extra", kcal: 18,  protein: 0,  fat: 0,  carbs: 4, sodium: 492, sugar: 2 },
  { id: "sukiyaki-sauce",   name: "Sukiyaki sauce",       zh: "寿喜烧酱", pinyin: "shòu xǐ shāo jiàng", unit: "1 tbsp", group: "extra", kcal: 25,  protein: 0,  fat: 0,  carbs: 6, sodium: 400, sugar: 5 },
  { id: "gyudon-sauce",     name: "Gyudon sauce",         zh: "牛丼酱",   pinyin: "niú dǒng jiàng",  unit: "1 tbsp", group: "extra", kcal: 30,  protein: 1,  fat: 0,  carbs: 6, sodium: 450, sugar: 4 },
  { id: "black-pepper",     name: "Black pepper",         zh: "黑胡椒",   pinyin: "hēi hú jiāo",     unit: "1 tsp",  group: "extra", kcal: 5,   protein: 0,  fat: 0,  carbs: 1, sodium: 0,   sugar: 0 },
  { id: "garlic-powder",    name: "Garlic powder",        zh: "大蒜粉",   pinyin: "dà suàn fěn",     unit: "1 tsp",  group: "extra", kcal: 10,  protein: 0,  fat: 0,  carbs: 2, sodium: 0,   sugar: 0 },
  { id: "lemon-juice",      name: "Lemon juice",          zh: "柠檬汁",   pinyin: "níng méng zhī",   unit: "1 tbsp", group: "extra", kcal: 4,   protein: 0,  fat: 0,  carbs: 1, sodium: 0,   sugar: 0 },
  // Extras — Drinks
  { id: "water",            name: "Water",                zh: "水",       pinyin: "shuǐ",            unit: "500ml",    group: "extra", kcal: 0,   protein: 0,  fat: 0,  carbs: 0, sodium: 0,   sugar: 0 },
  { id: "black-coffee",     name: "Black coffee",         zh: "黑咖啡",   pinyin: "hēi kā fēi",      unit: "1 cup",    group: "extra", kcal: 5,   protein: 0,  fat: 0,  carbs: 0, sodium: 5,   sugar: 0 },
  { id: "matcha-latte",     name: "Matcha latte",         zh: "抹茶拿铁", pinyin: "mǒ chá ná tiě",   unit: "no sugar", group: "extra", kcal: 150, protein: 5,  fat: 6,  carbs: 18, sodium: 120, sugar: 0 },
  { id: "coconut-latte",    name: "Coconut latte",        zh: "椰子拿铁", pinyin: "yē zi ná tiě",    unit: "no sugar", group: "extra", kcal: 200, protein: 4,  fat: 10, carbs: 22, sodium: 80,  sugar: 0 },
  { id: "egg-drop-soup",    name: "Egg drop soup",        zh: "蛋花汤",   pinyin: "dàn huā tāng",    unit: "200ml",    group: "extra", favorite: true, kcal: 70,  protein: 3,  fat: 2,  carbs: 6, sodium: 800, sugar: 0 },
  { id: "yogurt-extra",     name: "Greek yogurt",         zh: "希腊酸奶", pinyin: "xī là suān nǎi",  unit: "150g",     group: "extra", kcal: 100, protein: 10, fat: 3,  carbs: 8, sodium: 60,  sugar: 6 },
  { id: "protein-bar",      name: "Protein bar",          zh: "蛋白棒",   pinyin: "dàn bái bàng",    unit: "1 bar",    group: "extra", kcal: 200, protein: 20, fat: 8,  carbs: 20, sodium: 180, sugar: 8 },
  // Extras — Snacks
  { id: "almonds",          name: "Almonds",              zh: "杏仁",     pinyin: "xìng rén",        unit: "30g",    group: "extra", kcal: 174, protein: 6,  fat: 15, carbs: 6, sodium: 0,   sugar: 1 },
  { id: "walnuts",          name: "Walnuts",              zh: "核桃",     pinyin: "hé táo",          unit: "30g",    group: "extra", kcal: 196, protein: 5,  fat: 20, carbs: 4, sodium: 0,   sugar: 1 },
  { id: "beef-jerky",       name: "Beef jerky",           zh: "牛肉干",   pinyin: "niú ròu gān",     unit: "25g",    group: "extra", kcal: 37,  protein: 6,  fat: 1,  carbs: 1, sodium: 229, sugar: 0 },
  { id: "peanut-butter",    name: "Peanut butter",        zh: "花生酱",   pinyin: "huā shēng jiàng", unit: "1 tbsp", group: "extra", kcal: 94,  protein: 4,  fat: 8,  carbs: 3, sodium: 73,  sugar: 1 },

  // Chinese cafeteria — protein-forward
  { id: "xiao-long-bao",    name: "Xiao long bao",        zh: "小笼包",   pinyin: "xiǎo lóng bāo",   unit: "6 pieces",        group: "protein", note: "Cafeteria",       kcal: 280, protein: 14, fat: 10, carbs: 32 },
  { id: "jiaozi",           name: "Jiaozi / dumplings",   zh: "饺子",     pinyin: "jiǎo zi",         unit: "8 pieces",        group: "protein", note: "Cafeteria",       kcal: 320, protein: 16, fat: 9,  carbs: 38 },
  { id: "wonton-soup",      name: "Wonton soup",          zh: "馄饨汤",   pinyin: "hún tun tāng",    unit: "6 wontons + broth", group: "protein", note: "Cafeteria",     kcal: 240, protein: 12, fat: 8,  carbs: 28 },
  { id: "mapo-tofu",        name: "Mapo tofu",            zh: "麻婆豆腐", pinyin: "má pó dòu fu",    unit: "1 bowl",          group: "protein", note: "Cafeteria",       kcal: 220, protein: 14, fat: 14, carbs: 10 },
  // Chinese cafeteria — carb-forward
  { id: "fried-rice",       name: "Fried rice",           zh: "炒饭",     pinyin: "chǎo fàn",        unit: "1 plate",         group: "carb", tag: "limit", note: "Cafeteria", kcal: 480, protein: 12, fat: 16, carbs: 68 },
  { id: "congee",           name: "Congee / porridge",    zh: "粥",       pinyin: "zhōu",            unit: "1 bowl",          group: "carb", note: "Cafeteria",          kcal: 180, protein: 6,  fat: 2,  carbs: 35 },
  { id: "mantou",           name: "Mantou / steamed bun", zh: "馒头",     pinyin: "mán tou",         unit: "1 piece",         group: "carb", note: "Cafeteria",          kcal: 140, protein: 4,  fat: 1,  carbs: 28 },
  { id: "noodle-soup",      name: "Noodle soup",          zh: "汤面",     pinyin: "tāng miàn",       unit: "1 bowl",          group: "carb", note: "Cafeteria",          kcal: 380, protein: 18, fat: 8,  carbs: 52 },

  // Family Mart snacks & drinks
  { id: "fm-onigiri",       name: "Family Mart onigiri",  zh: "饭团",     pinyin: "fàn tuán",        unit: "1 piece",         group: "extra", note: "Family Mart",        kcal: 180, protein: 6,  fat: 3,  carbs: 32, sodium: 0, sugar: 0 },
  { id: "fm-sandwich",      name: "Family Mart sandwich", zh: "三明治",   pinyin: "sān míng zhì",    unit: "1 sandwich",      group: "extra", note: "Family Mart",        kcal: 280, protein: 12, fat: 10, carbs: 34, sodium: 0, sugar: 0 },
  { id: "fm-hot-dog",       name: "Family Mart hot dog",  zh: "热狗",     pinyin: "rè gǒu",          unit: "1 piece",         group: "extra", note: "Family Mart",        kcal: 220, protein: 9,  fat: 12, carbs: 18, sodium: 0, sugar: 0 },
  { id: "lays-chips",       name: "Lay's chips",          zh: "乐事薯片", pinyin: "lè shì shǔ piàn", unit: "30g bag",         group: "extra", tag: "limit", note: "Snack", kcal: 150, protein: 2,  fat: 9,  carbs: 16, sodium: 0, sugar: 0 },
  { id: "pocky",            name: "Pocky",                zh: "百奇",     pinyin: "bǎi qí",          unit: "1 pack",          group: "extra", tag: "limit", note: "Snack", kcal: 170, protein: 3,  fat: 7,  carbs: 24, sodium: 0, sugar: 0 },
  { id: "yakult",           name: "Yakult",               zh: "养乐多",   pinyin: "yǎng lè duō",     unit: "100ml bottle",    group: "extra", note: "Drink",              kcal: 50,  protein: 1,  fat: 0,  carbs: 12, sodium: 0, sugar: 0 },
  { id: "coconut-water",    name: "Coconut water",        zh: "椰子水",   pinyin: "yē zi shuǐ",      unit: "330ml",           group: "extra", note: "Drink",              kcal: 65,  protein: 1,  fat: 0,  carbs: 15, sodium: 0, sugar: 0 },

  // Placeholder — update with real label macros
  { id: "small-chocolate",  name: "Small chocolate (UPDATE)", zh: "巧克力", pinyin: "qiǎo kè lì",    unit: "1 piece ~30g",    group: "extra", tag: "limit", note: "Placeholder — update when label shared", kcal: 150, protein: 2,  fat: 8,  carbs: 18, sodium: 0, sugar: 0 },

  // Supplements — seeds
  { id: "chia-seeds",       name: "Chia seeds",           zh: "奇亚籽",   pinyin: "qī yà zǐ",        unit: "1 tbsp (15g)",    group: "extra", tag: "best", step: 1, gramsPerUnit: 15, sodium: 3, note: "Superfood · high fiber + omega-3. Add to oats or yogurt — keeps you full longer.", kcal: 73, protein: 2.5, fat: 4.6, carbs: 6.3, sugar: 0 },

  // Restaurant — Lanzhou beef noodles
  { id: "spicy-beef-noodle", name: "Spicy beef noodle",   zh: "红汤牛肉面", pinyin: "hóng tāng niú ròu miàn", unit: "1 bowl", group: "carb", note: "Restaurant · high sodium — drink extra water after", sodium: 1200, kcal: 450, protein: 30, fat: 12, carbs: 45 },
  { id: "clear-beef-noodle", name: "Clear beef noodle",   zh: "清汤牛肉面", pinyin: "qīng tāng niú ròu miàn", unit: "1 bowl", group: "carb", tag: "good", note: "Restaurant · lighter than red broth. Better macro choice.", sodium: 700, kcal: 380, protein: 32, fat: 8, carbs: 42 },

  // Restaurant — Bakmi Cerita Kita (Indonesian egg noodle)
  { id: "bakmi-cerita-kita-small", name: "Bakmi Cerita Kita (small)", zh: "故事面·小", pinyin: "gù shì miàn xiǎo", unit: "1 small bowl",   group: "carb", tag: "limit", note: "Restaurant · Indonesian egg noodle. Estimate — actual may vary.", kcal: 420, protein: 18, fat: 14, carbs: 52 },
  { id: "bakmi-cerita-kita",       name: "Bakmi Cerita Kita",         zh: "故事面",   pinyin: "gù shì miàn",       unit: "1 regular bowl", group: "carb", tag: "limit", note: "Restaurant · Indonesian egg noodle. Higher carbs, moderate protein.", kcal: 580, protein: 24, fat: 18, carbs: 72 },
  { id: "bakmi-cerita-kita-large", name: "Bakmi Cerita Kita (large)", zh: "故事面·大", pinyin: "gù shì miàn dà",   unit: "1 large bowl",   group: "carb", tag: "limit", note: "Restaurant · Indonesian egg noodle. Large portion — heavy carb load.", kcal: 720, protein: 30, fat: 22, carbs: 88 },
];

export const GROUPS: { key: Ingredient["group"]; label: string }[] = [
  { key: "protein",    label: "Proteins" },
  { key: "carb",       label: "Carbs" },
  { key: "vegetable",  label: "Vegetables" },
  { key: "extra",      label: "Extras" },
];

export function getIngredient(id: string): Ingredient | undefined {
  return INGREDIENTS.find((i) => i.id === id);
}

export function macrosFor(id: string, qty: number): Macros {
  const ing = getIngredient(id);
  if (!ing) return { kcal: 0, protein: 0, fat: 0, carbs: 0 };
  return {
    kcal: ing.kcal * qty,
    protein: ing.protein * qty,
    fat: ing.fat * qty,
    carbs: ing.carbs * qty,
  };
}

export function sumMacros(entries: { id: string; qty: number }[]): Macros {
  return entries.reduce<Macros>(
    (acc, e) => {
      const m = macrosFor(e.id, e.qty);
      return {
        kcal: acc.kcal + m.kcal,
        protein: acc.protein + m.protein,
        fat: acc.fat + m.fat,
        carbs: acc.carbs + m.carbs,
      };
    },
    { kcal: 0, protein: 0, fat: 0, carbs: 0 }
  );
}

export type CustomMacros = Macros & { sugar: number; sodium: number };

export function addMacros(a: CustomMacros, b: Partial<CustomMacros>): CustomMacros {
  return {
    kcal: a.kcal + (b.kcal ?? 0),
    protein: a.protein + (b.protein ?? 0),
    fat: a.fat + (b.fat ?? 0),
    carbs: a.carbs + (b.carbs ?? 0),
    sugar: a.sugar + (b.sugar ?? 0),
    sodium: a.sodium + (b.sodium ?? 0),
  };
}
