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
  group: "protein" | "carb" | "vegetable" | "extra" | "drink";
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
  /** Other names this food is searched by, space-separated. Search-only —
   *  never displayed. These staples are English-named ("Whole egg") in an app
   *  that is otherwise entirely in Bahasa, so without this the twenty foods a
   *  user taps most are unreachable by typing "telur". */
  aliases?: string;
} & Macros;

export const INGREDIENTS: Ingredient[] = [
  // Proteins
  { id: "egg",          name: "Whole egg",        zh: "鸡蛋",     pinyin: "jī dàn",       unit: "1 egg",           group: "protein", favorite: true, kcal: 70,  protein: 6,  fat: 5,  carbs: 0.5 , aliases: "telur telor telur ayam" },
  { id: "chicken-breast", name: "Chicken breast", zh: "鸡胸肉",   pinyin: "jī xiōng ròu", unit: "1 breast (250g)", group: "protein", favorite: true, step: 0.25, gramsPerUnit: 250, kcal: 275, protein: 52, fat: 6,  carbs: 0 , aliases: "ayam dada dada ayam" },
  { id: "chicken-thigh", name: "Chicken thigh",   zh: "鸡腿",     pinyin: "jī tuǐ",       unit: "1 thigh (150g)",  group: "protein", favorite: true, step: 0.25, gramsPerUnit: 150, kcal: 220, protein: 24, fat: 14, carbs: 0 , aliases: "ayam paha paha ayam" },
  { id: "beef-slice",   name: "Beef slice",       zh: "牛肉片",   pinyin: "niú ròu piàn", unit: "1 slice (30g)",   group: "protein", favorite: true, step: 0.5, gramsPerUnit: 30, kcal: 54,  protein: 5,  fat: 4,  carbs: 0 , aliases: "daging sapi irisan sapi" },
  { id: "whey",         name: "Whey scoop",       zh: "乳清蛋白", pinyin: "rǔ qīng dàn bái", unit: "1 scoop (30g)", group: "protein", step: 0.5, gramsPerUnit: 30, kcal: 120, protein: 25, fat: 2,  carbs: 3 , aliases: "whey protein bubuk protein" },
  { id: "greek-yogurt", name: "Greek yogurt",     zh: "希腊酸奶", pinyin: "xī là suān nǎi", unit: "150g",         group: "protein", step: 0.5, gramsPerUnit: 150, sugar: 6, kcal: 100, protein: 10, fat: 3,  carbs: 8 , aliases: "yogurt yoghurt yogurt yunani" },
  { id: "tofu",         name: "Tofu",             zh: "豆腐",     pinyin: "dòu fu",       unit: "100g",            group: "protein", step: 0.5, gramsPerUnit: 100, kcal: 76,  protein: 8,  fat: 4,  carbs: 2 , aliases: "tahu" },
  { id: "salmon",       name: "Salmon",           zh: "三文鱼",   pinyin: "sān wén yú",   unit: "150g",            group: "protein", step: 0.5, gramsPerUnit: 150, kcal: 280, protein: 30, fat: 17, carbs: 0 , aliases: "ikan salmon ikan" },
  { id: "ribeye",       name: "Ribeye steak",     zh: "肋眼牛排", pinyin: "lèi yǎn niú pái", unit: "100g (cooked)", group: "protein", favorite: true, step: 0.5, gramsPerUnit: 100, sodium: 60, note: "Higher fat cut — savor it. 1× = 100g.", kcal: 270, protein: 25, fat: 19, carbs: 0 , aliases: "daging sapi steak sapi" },

  // Carbs — Rice & grains
  { id: "purple-rice",  name: "Purple rice",    zh: "紫米饭",   pinyin: "zǐ mǐ fàn",   unit: "100g",     group: "carb", tag: "recommended", kcal: 180, protein: 4, fat: 1, carbs: 38 , aliases: "nasi ungu beras ungu nasi" },
  { id: "white-rice",   name: "White rice",     zh: "白米饭",   pinyin: "bái mǐ fàn",  unit: "100g",     group: "carb", favorite: true, tag: "limit", kcal: 130, protein: 3, fat: 0, carbs: 28 , aliases: "nasi putih nasi beras" },
  { id: "brown-rice",   name: "Brown rice",     zh: "糙米",     pinyin: "cāo mǐ",      unit: "100g",     group: "carb", kcal: 150, protein: 3, fat: 1, carbs: 32 , aliases: "nasi merah beras merah nasi" },
  { id: "oats",         name: "Oats (Member's Mark)", zh: "燕麦片", pinyin: "yàn mài piàn", unit: "1 scoop (30g)", group: "carb", tag: "best", step: 0.5, gramsPerUnit: 30, sodium: 15, sugar: 1, note: "Contains chia seeds + flaxseeds — omega-3, extra fiber", kcal: 111, protein: 4, fat: 2, carbs: 20 , aliases: "oat havermut gandum" },
  { id: "granola",      name: "Granola",        zh: "格兰诺拉", pinyin: "gé lán nuò lā", unit: "30g",    group: "carb", sugar: 8, kcal: 150, protein: 4, fat: 6, carbs: 20 , aliases: "granola sereal" },
  // Carbs — Potato & root
  { id: "sweet-potato", name: "Sweet potato",   zh: "红薯",     pinyin: "hóng shǔ",    unit: "100g",     group: "carb", tag: "recommended", kcal: 86,  protein: 2, fat: 0, carbs: 20 , aliases: "ubi ubi jalar" },
  { id: "potato",       name: "Potato",         zh: "土豆",     pinyin: "tǔ dòu",      unit: "100g",     group: "carb", kcal: 77,  protein: 2, fat: 0, carbs: 17 , aliases: "kentang" },
  // Carbs — Fruit carbs
  { id: "banana",       name: "Banana",         zh: "香蕉",     pinyin: "xiāng jiāo",  unit: "1 whole",  group: "carb", favorite: true, tag: "recommended", sugar: 14, kcal: 105, protein: 1, fat: 0, carbs: 27 , aliases: "pisang" },
  { id: "melon",        name: "Melon",          zh: "哈密瓜",   pinyin: "hā mì guā",   unit: "quarter",  group: "carb", favorite: true, sugar: 11, kcal: 50,  protein: 0, fat: 0, carbs: 12 , aliases: "melon" },
  { id: "apple",        name: "Apple",          zh: "苹果",     pinyin: "píng guǒ",    unit: "1 medium", group: "carb", sugar: 19, kcal: 95,  protein: 0, fat: 0, carbs: 25 , aliases: "apel" },
  { id: "mango",        name: "Mango",          zh: "芒果",     pinyin: "máng guǒ",    unit: "100g",     group: "carb", sugar: 14, kcal: 60,  protein: 1, fat: 0, carbs: 15 , aliases: "mangga" },
  { id: "grapes",       name: "Grapes",         zh: "葡萄",     pinyin: "pú táo",      unit: "100g",     group: "carb", sugar: 16, kcal: 69,  protein: 1, fat: 0, carbs: 18 , aliases: "anggur" },
  { id: "pineapple",    name: "Pineapple",      zh: "菠萝",     pinyin: "bō luó",      unit: "100g",     group: "carb", sugar: 10, kcal: 50,  protein: 0, fat: 0, carbs: 13 , aliases: "nanas" },
  { id: "blueberries",  name: "Blueberries",    zh: "蓝莓",     pinyin: "lán méi",     unit: "50g",      group: "carb", sugar: 5,  kcal: 29,  protein: 0, fat: 0, carbs: 7 , aliases: "blueberry buah beri" },
  { id: "mixed-fruits", name: "Mixed fruits",   zh: "什锦水果", pinyin: "shí jǐn shuǐ guǒ", unit: "150g", group: "carb", sugar: 16, kcal: 90,  protein: 1, fat: 0, carbs: 22 , aliases: "buah campur salad buah" },
  // Carbs — Bread & noodles
  { id: "noodles",      name: "Noodles",        zh: "面条",     pinyin: "miàn tiáo",   unit: "100g dry", group: "carb", favorite: true, tag: "limit", sugar: 2, kcal: 350, protein: 12, fat: 2, carbs: 70 , aliases: "mie mi" },
  { id: "bread",        name: "Bread",          zh: "面包",     pinyin: "miàn bāo",    unit: "1 slice",  group: "carb", tag: "limit", sugar: 2, kcal: 80,  protein: 3, fat: 1, carbs: 15 , aliases: "roti roti tawar" },

  // Vegetables
  { id: "enoki",        name: "Enoki",          zh: "金针菇",   pinyin: "jīn zhēn gū", unit: "½ pack · 50g",    group: "vegetable", favorite: true, kcal: 19, protein: 2, fat: 0, carbs: 4 , aliases: "jamur enoki jamur" },
  { id: "tomato",       name: "Tomato",         zh: "番茄",     pinyin: "fān qié",     unit: "1 whole · 150g",  group: "vegetable", favorite: true, kcal: 27, protein: 1, fat: 0, carbs: 6 , aliases: "tomat" },
  { id: "cherry-tomato", name: "Baby tomato",   zh: "圣女果",   pinyin: "shèng nǚ guǒ", unit: "100g (~10 pcs)",  group: "vegetable", favorite: true, step: 0.5, gramsPerUnit: 100, sodium: 5, note: "Sweet pop, easy snack with steak.", kcal: 18, protein: 1, fat: 0, carbs: 4 , aliases: "tomat ceri tomat kecil" },
  { id: "eggplant",     name: "Eggplant",       zh: "茄子",     pinyin: "qié zi",      unit: "½ eggplant · 100g", group: "vegetable", favorite: true, kcal: 35, protein: 1, fat: 0, carbs: 8 , aliases: "terong terung" },
  { id: "broccoli",     name: "Broccoli",       zh: "西兰花",   pinyin: "xī lán huā",  unit: "¼ head · 75g",    group: "vegetable", favorite: true, tag: "best", kcal: 26, protein: 2, fat: 0, carbs: 5 , aliases: "brokoli" },
  // Best picks
  { id: "spinach",      name: "Spinach",        zh: "菠菜",     pinyin: "bō cài",      unit: "100g", group: "vegetable", tag: "best", step: 0.5, gramsPerUnit: 100, sodium: 79, note: "Iron + magnesium. Better gym pump. Cook in 2 min.",              kcal: 23, protein: 2.9, fat: 0.4, carbs: 3.6 , aliases: "bayam" },
  { id: "asparagus",    name: "Asparagus",      zh: "芦笋",     pinyin: "lú sǔn",      unit: "100g", group: "vegetable", tag: "best", step: 0.5, gramsPerUnit: 100, sodium: 2,  note: "Lowest calorie vegetable. Natural diuretic = less face puffiness.", kcal: 20, protein: 2.2, fat: 0.1, carbs: 3.9 , aliases: "asparagus" },
  { id: "bok-choy",     name: "Bok choy",       zh: "小白菜",   pinyin: "xiǎo bái cài",unit: "100g", group: "vegetable", tag: "best", step: 0.5, gramsPerUnit: 100, sodium: 65, note: "Lowest calorie. High calcium. Easy to find everywhere in China.", kcal: 13, protein: 1.5, fat: 0.2, carbs: 2.2 , aliases: "pakcoy sawi" },
  // Mushrooms
  { id: "king-oyster-mushroom", name: "King oyster mushroom", zh: "杏鲍菇", pinyin: "xìng bào gū", unit: "100g", group: "vegetable", tag: "best", step: 0.5, gramsPerUnit: 100, sodium: 2,  note: "Highest protein mushroom. Meaty texture. Best air fried.", kcal: 35, protein: 3.3, fat: 0.4, carbs: 6 , aliases: "jamur tiram raja jamur" },
  { id: "shiitake-mushroom",    name: "Shiitake mushroom",    zh: "香菇",   pinyin: "xiāng gū",    unit: "100g", group: "vegetable", tag: "best", step: 0.5, gramsPerUnit: 100, sodium: 9,  note: "Immune boost + testosterone support. Rich umami.",        kcal: 34, protein: 2.2, fat: 0.5, carbs: 7 , aliases: "jamur shitake jamur" },
  { id: "oyster-mushroom",      name: "Oyster mushroom",      zh: "平菇",   pinyin: "píng gū",     unit: "100g", group: "vegetable", tag: "good", step: 0.5, gramsPerUnit: 100, sodium: 18, note: "Same protein as king oyster. Cheaper. Good stir fry.",    kcal: 33, protein: 3.3, fat: 0.4, carbs: 6 , aliases: "jamur tiram jamur" },
  { id: "white-button-mushroom",name: "White button mushroom",zh: "白蘑菇", pinyin: "bái mó gū",   unit: "100g", group: "vegetable",              step: 0.5, gramsPerUnit: 100, sodium: 5,  note: "Lowest calories. Decent protein. Less nutritious overall.", kcal: 22, protein: 3.1, fat: 0.3, carbs: 3 , aliases: "jamur kancing jamur" },
  { id: "deer-antler-mushroom", name: "Deer antler mushroom", zh: "鹿茸菇", pinyin: "lù róng gū",  unit: "100g", group: "vegetable",              step: 0.5, gramsPerUnit: 100, sodium: 4,  note: "Similar to enoki. Harder to find. No clear advantage.",   kcal: 32, protein: 2.1, fat: 0.4, carbs: 6 , aliases: "jamur tanduk rusa jamur" },
  // Other vegetables (alphabetical)
  { id: "bell-pepper",  name: "Bell pepper",    zh: "彩椒",     pinyin: "cǎi jiāo",    unit: "1 whole · 120g",  group: "vegetable", kcal: 36, protein: 1, fat: 0, carbs: 8 , aliases: "paprika" },
  { id: "cabbage",      name: "Cabbage",        zh: "卷心菜",   pinyin: "juǎn xīn cài",unit: "100g", group: "vegetable", step: 0.5, gramsPerUnit: 100, sodium: 18, note: "Gut health. Cheap and easy to find in Hangzhou.",       kcal: 25, protein: 1.3, fat: 0.1, carbs: 5.8 , aliases: "kol kubis" },
  { id: "carrot",       name: "Carrot",         zh: "胡萝卜",   pinyin: "hú luó bo",   unit: "100g", group: "vegetable", step: 0.5, gramsPerUnit: 100, sodium: 69, note: "Beta-carotene. Eye health. Good jaw exerciser raw 😄", kcal: 41, protein: 0.9, fat: 0.2, carbs: 9.6 , aliases: "wortel" },
  { id: "celery",       name: "Celery",         zh: "芹菜",     pinyin: "qín cài",     unit: "100g", group: "vegetable", step: 0.5, gramsPerUnit: 100, sodium: 80, note: "Almost zero calories. High water content. Good raw snack.", kcal: 16, protein: 0.7, fat: 0.2, carbs: 3.0 , aliases: "seledri" },
  { id: "corn",         name: "Corn",           zh: "玉米",     pinyin: "yù mǐ",       unit: "100g", group: "vegetable", step: 0.5, gramsPerUnit: 100, sodium: 15, note: "Higher carbs — use as carb source, not just vegetable.", kcal: 86, protein: 3.3, fat: 1.4, carbs: 19 , aliases: "jagung" },
  { id: "cucumber",     name: "Cucumber",       zh: "黄瓜",     pinyin: "huáng guā",   unit: "100g", group: "vegetable", step: 0.5, gramsPerUnit: 100, sodium: 2,  note: "Lowest calorie filler. Hydrating. Great raw snack.",    kcal: 15, protein: 0.7, fat: 0.1, carbs: 3.6 , aliases: "timun mentimun" },
  { id: "green-beans",  name: "Green beans",    zh: "四季豆",   pinyin: "sì jì dòu",   unit: "100g", group: "vegetable", step: 0.5, gramsPerUnit: 100, sodium: 6,  note: "High fiber. Good volume filler. Easy air fry.",         kcal: 31, protein: 1.8, fat: 0.1, carbs: 7.1 , aliases: "buncis kacang panjang" },
  { id: "okra",         name: "Okra",           zh: "秋葵",     pinyin: "qiū kuí",     unit: "100g", group: "vegetable", kcal: 33, protein: 2, fat: 0, carbs: 7 , aliases: "okra" },
  { id: "zucchini",     name: "Zucchini",       zh: "西葫芦",   pinyin: "xī hú lú",    unit: "100g", group: "vegetable", step: 0.5, gramsPerUnit: 100, sodium: 8,  note: "Low carb, light, easy air fry.",                        kcal: 17, protein: 1.2, fat: 0.3, carbs: 3.1 , aliases: "zukini timun jepang" },

  // Extras — Supplements
  { id: "creatine",         name: "Creatine",             zh: "肌酸",     pinyin: "jī suān",         unit: "10g",           group: "extra", favorite: true, kcal: 0,   protein: 0,  fat: 0,  carbs: 0, sodium: 0,   sugar: 0 , aliases: "kreatin" },
  { id: "whey-extra",       name: "Whey protein",         zh: "乳清蛋白", pinyin: "rǔ qīng dàn bái", unit: "1 scoop (30g)", group: "extra", favorite: true, kcal: 120, protein: 25, fat: 2,  carbs: 3, sodium: 150, sugar: 2 , aliases: "whey protein bubuk protein" },
  // Extras — Seasonings & sauces
  { id: "soy-sauce",        name: "Soy sauce",            zh: "生抽",     pinyin: "shēng chōu",      unit: "1 tbsp", group: "extra", favorite: true, kcal: 10,  protein: 1,  fat: 0,  carbs: 1, sodium: 900, sugar: 0 , aliases: "kecap asin kecap" },
  { id: "low-soy-sauce",    name: "Low-sodium soy sauce", zh: "低钠生抽", pinyin: "dī nà shēng chōu",unit: "1 tbsp", group: "extra", kcal: 10,  protein: 1,  fat: 0,  carbs: 1, sodium: 570, sugar: 0 , aliases: "kecap asin rendah garam kecap" },
  { id: "oyster-sauce",     name: "Oyster sauce",         zh: "蚝油",     pinyin: "háo yóu",         unit: "1 tbsp", group: "extra", kcal: 18,  protein: 0,  fat: 0,  carbs: 4, sodium: 492, sugar: 2 , aliases: "saus tiram" },
  { id: "sukiyaki-sauce",   name: "Sukiyaki sauce",       zh: "寿喜烧酱", pinyin: "shòu xǐ shāo jiàng", unit: "1 tbsp", group: "extra", kcal: 25,  protein: 0,  fat: 0,  carbs: 6, sodium: 400, sugar: 5 , aliases: "saus sukiyaki" },
  { id: "gyudon-sauce",     name: "Gyudon sauce",         zh: "牛丼酱",   pinyin: "niú dǒng jiàng",  unit: "1 tbsp", group: "extra", kcal: 30,  protein: 1,  fat: 0,  carbs: 6, sodium: 450, sugar: 4 , aliases: "saus gyudon" },
  { id: "black-pepper",     name: "Black pepper",         zh: "黑胡椒",   pinyin: "hēi hú jiāo",     unit: "1 tsp",  group: "extra", kcal: 5,   protein: 0,  fat: 0,  carbs: 1, sodium: 0,   sugar: 0 , aliases: "merica lada lada hitam" },
  { id: "garlic-powder",    name: "Garlic powder",        zh: "大蒜粉",   pinyin: "dà suàn fěn",     unit: "1 tsp",  group: "extra", kcal: 10,  protein: 0,  fat: 0,  carbs: 2, sodium: 0,   sugar: 0 , aliases: "bawang putih bubuk bawang" },
  { id: "lemon-juice",      name: "Lemon juice",          zh: "柠檬汁",   pinyin: "níng méng zhī",   unit: "1 tbsp", group: "extra", kcal: 4,   protein: 0,  fat: 0,  carbs: 1, sodium: 0,   sugar: 0 , aliases: "perasan lemon jeruk lemon" },
  // Extras — Drinks
  { id: "water",            name: "Water",                zh: "水",       pinyin: "shuǐ",            unit: "500ml",    group: "drink", kcal: 0,   protein: 0,  fat: 0,  carbs: 0, sodium: 0,   sugar: 0 , aliases: "air air putih" },
  { id: "black-coffee",     name: "Black coffee",         zh: "黑咖啡",   pinyin: "hēi kā fēi",      unit: "1 cup",    group: "drink", kcal: 5,   protein: 0,  fat: 0,  carbs: 0, sodium: 5,   sugar: 0 , aliases: "kopi hitam kopi" },
  { id: "matcha-latte",     name: "Matcha latte",         zh: "抹茶拿铁", pinyin: "mǒ chá ná tiě",   unit: "no sugar", group: "drink", kcal: 150, protein: 5,  fat: 6,  carbs: 18, sodium: 120, sugar: 6 , aliases: "matcha latte teh hijau" },
  { id: "coconut-latte",    name: "Coconut latte",        zh: "椰子拿铁", pinyin: "yē zi ná tiě",    unit: "no sugar", group: "drink", kcal: 200, protein: 4,  fat: 10, carbs: 22, sodium: 80,  sugar: 8 , aliases: "latte kelapa kopi kelapa" },
  { id: "egg-drop-soup",    name: "Egg drop soup",        zh: "蛋花汤",   pinyin: "dàn huā tāng",    unit: "200ml",    group: "extra", favorite: true, kcal: 70,  protein: 3,  fat: 2,  carbs: 6, sodium: 800, sugar: 0 , aliases: "sup telur" },
  { id: "yogurt-extra",     name: "Greek yogurt",         zh: "希腊酸奶", pinyin: "xī là suān nǎi",  unit: "150g",     group: "extra", kcal: 100, protein: 10, fat: 3,  carbs: 8, sodium: 60,  sugar: 6 , aliases: "yogurt yoghurt" },
  { id: "protein-bar",      name: "Protein bar",          zh: "蛋白棒",   pinyin: "dàn bái bàng",    unit: "1 bar",    group: "extra", kcal: 200, protein: 20, fat: 8,  carbs: 20, sodium: 180, sugar: 10 , aliases: "protein bar cemilan protein" },
  // Extras — Snacks
  { id: "almonds",          name: "Almonds",              zh: "杏仁",     pinyin: "xìng rén",        unit: "30g",    group: "extra", kcal: 174, protein: 6,  fat: 15, carbs: 6, sodium: 0,   sugar: 1 , aliases: "kacang almond kacang" },
  { id: "walnuts",          name: "Walnuts",              zh: "核桃",     pinyin: "hé táo",          unit: "30g",    group: "extra", kcal: 196, protein: 5,  fat: 20, carbs: 4, sodium: 0,   sugar: 1 , aliases: "kacang walnut kacang" },
  { id: "beef-jerky",       name: "Beef jerky",           zh: "牛肉干",   pinyin: "niú ròu gān",     unit: "25g",    group: "extra", kcal: 37,  protein: 6,  fat: 1,  carbs: 1, sodium: 229, sugar: 0 , aliases: "dendeng sapi dendeng" },
  { id: "peanut-butter",    name: "Peanut butter",        zh: "花生酱",   pinyin: "huā shēng jiàng", unit: "1 tbsp", group: "extra", kcal: 94,  protein: 4,  fat: 8,  carbs: 3, sodium: 73,  sugar: 1 , aliases: "selai kacang" },

  // Chinese cafeteria — protein-forward
  { id: "xiao-long-bao",    name: "Xiao long bao",        zh: "小笼包",   pinyin: "xiǎo lóng bāo",   unit: "6 pieces",        group: "protein", note: "Cafeteria",       kcal: 280, protein: 14, fat: 10, carbs: 32 , aliases: "xiao long bao dimsum" },
  { id: "jiaozi",           name: "Jiaozi / dumplings",   zh: "饺子",     pinyin: "jiǎo zi",         unit: "8 pieces",        group: "protein", note: "Cafeteria",       kcal: 320, protein: 16, fat: 9,  carbs: 38 , aliases: "pangsit dimsum" },
  { id: "wonton-soup",      name: "Wonton soup",          zh: "馄饨汤",   pinyin: "hún tun tāng",    unit: "6 wontons + broth", group: "protein", note: "Cafeteria",     kcal: 240, protein: 12, fat: 8,  carbs: 28 , aliases: "sup pangsit pangsit kuah" },
  { id: "mapo-tofu",        name: "Mapo tofu",            zh: "麻婆豆腐", pinyin: "má pó dòu fu",    unit: "1 bowl",          group: "protein", note: "Cafeteria",       kcal: 220, protein: 14, fat: 14, carbs: 10 , aliases: "tahu mapo tahu pedas" },
  // Chinese cafeteria — carb-forward
  { id: "fried-rice",       name: "Fried rice",           zh: "炒饭",     pinyin: "chǎo fàn",        unit: "1 plate",         group: "carb", tag: "limit", note: "Cafeteria", kcal: 480, protein: 12, fat: 16, carbs: 68 , aliases: "nasi goreng" },
  { id: "congee",           name: "Congee / porridge",    zh: "粥",       pinyin: "zhōu",            unit: "1 bowl",          group: "carb", note: "Cafeteria",          kcal: 180, protein: 6,  fat: 2,  carbs: 35 , aliases: "bubur bubur nasi" },
  { id: "mantou",           name: "Mantou / steamed bun", zh: "馒头",     pinyin: "mán tou",         unit: "1 piece",         group: "carb", note: "Cafeteria",          sugar: 3, kcal: 140, protein: 4,  fat: 1,  carbs: 28 , aliases: "bakpao roti kukus" },
  { id: "noodle-soup",      name: "Noodle soup",          zh: "汤面",     pinyin: "tāng miàn",       unit: "1 bowl",          group: "carb", note: "Cafeteria",          kcal: 380, protein: 18, fat: 8,  carbs: 52 , aliases: "mie kuah mie rebus" },

  // Family Mart snacks & drinks
  { id: "fm-onigiri",       name: "Family Mart onigiri",  zh: "饭团",     pinyin: "fàn tuán",        unit: "1 piece",         group: "extra", note: "Family Mart",        kcal: 180, protein: 6,  fat: 3,  carbs: 32, sodium: 0, sugar: 1 , aliases: "onigiri nasi kepal" },
  { id: "fm-sandwich",      name: "Family Mart sandwich", zh: "三明治",   pinyin: "sān míng zhì",    unit: "1 sandwich",      group: "extra", note: "Family Mart",        kcal: 280, protein: 12, fat: 10, carbs: 34, sodium: 0, sugar: 4 , aliases: "roti isi sandwich" },
  { id: "fm-hot-dog",       name: "Family Mart hot dog",  zh: "热狗",     pinyin: "rè gǒu",          unit: "1 piece",         group: "extra", note: "Family Mart",        kcal: 220, protein: 9,  fat: 12, carbs: 18, sodium: 0, sugar: 3 , aliases: "hot dog sosis roti" },
  { id: "lays-chips",       name: "Lay's chips",          zh: "乐事薯片", pinyin: "lè shì shǔ piàn", unit: "30g bag",         group: "extra", tag: "limit", note: "Snack", kcal: 150, protein: 2,  fat: 9,  carbs: 16, sodium: 0, sugar: 1 , aliases: "keripik kentang chips" },
  { id: "pocky",            name: "Pocky",                zh: "百奇",     pinyin: "bǎi qí",          unit: "1 pack",          group: "extra", tag: "limit", note: "Snack", kcal: 170, protein: 3,  fat: 7,  carbs: 24, sodium: 0, sugar: 12 , aliases: "pocky biskuit" },
  { id: "yakult",           name: "Yakult",               zh: "养乐多",   pinyin: "yǎng lè duō",     unit: "100ml bottle",    group: "drink", note: "Drink",              kcal: 50,  protein: 1,  fat: 0,  carbs: 12, sodium: 0, sugar: 11 , aliases: "yakult minuman probiotik" },
  { id: "coconut-water",    name: "Coconut water",        zh: "椰子水",   pinyin: "yē zi shuǐ",      unit: "330ml",           group: "drink", note: "Drink",              kcal: 65,  protein: 1,  fat: 0,  carbs: 15, sodium: 0, sugar: 14 , aliases: "air kelapa kelapa muda" },

  // Placeholder — update with real label macros
  { id: "small-chocolate",  name: "Small chocolate (UPDATE)", zh: "巧克力", pinyin: "qiǎo kè lì",    unit: "1 piece ~30g",    group: "extra", tag: "limit", note: "Placeholder — update when label shared", kcal: 150, protein: 2,  fat: 8,  carbs: 18, sodium: 0, sugar: 0 , aliases: "cokelat coklat" },

  // Supplements — seeds
  { id: "chia-seeds",       name: "Chia seeds",           zh: "奇亚籽",   pinyin: "qī yà zǐ",        unit: "1 tbsp (15g)",    group: "extra", tag: "best", step: 1, gramsPerUnit: 15, sodium: 3, note: "Superfood · high fiber + omega-3. Add to oats or yogurt — keeps you full longer.", kcal: 73, protein: 2.5, fat: 4.6, carbs: 6.3, sugar: 0 , aliases: "biji chia chia" },

  // Restaurant — Lanzhou beef noodles
  { id: "spicy-beef-noodle", name: "Spicy beef noodle",   zh: "红汤牛肉面", pinyin: "hóng tāng niú ròu miàn", unit: "1 bowl", group: "carb", note: "Restaurant · high sodium — drink extra water after", sodium: 1200, kcal: 450, protein: 30, fat: 12, carbs: 45 , aliases: "mie sapi pedas mie" },
  { id: "clear-beef-noodle", name: "Clear beef noodle",   zh: "清汤牛肉面", pinyin: "qīng tāng niú ròu miàn", unit: "1 bowl", group: "carb", tag: "good", note: "Restaurant · lighter than red broth. Better macro choice.", sodium: 700, kcal: 380, protein: 32, fat: 8, carbs: 42 , aliases: "mie sapi kuah bening mie" },

  // Restaurant — Bakmi Cerita Kita (Indonesian egg noodle)
  { id: "bakmi-cerita-kita-small", name: "Bakmi Cerita Kita (small)", zh: "故事面·小", pinyin: "gù shì miàn xiǎo", unit: "1 small bowl",   group: "carb", tag: "limit", note: "Restaurant · Indonesian egg noodle. Estimate — actual may vary.", kcal: 420, protein: 18, fat: 14, carbs: 52 , aliases: "mie bakmi mie ayam noodles" },
  { id: "bakmi-cerita-kita",       name: "Bakmi Cerita Kita",         zh: "故事面",   pinyin: "gù shì miàn",       unit: "1 regular bowl", group: "carb", tag: "limit", note: "Restaurant · Indonesian egg noodle. Higher carbs, moderate protein.", kcal: 580, protein: 24, fat: 18, carbs: 72 , aliases: "mie bakmi mie ayam noodles" },
  { id: "bakmi-cerita-kita-large", name: "Bakmi Cerita Kita (large)", zh: "故事面·大", pinyin: "gù shì miàn dà",   unit: "1 large bowl",   group: "carb", tag: "limit", note: "Restaurant · Indonesian egg noodle. Large portion — heavy carb load.", kcal: 720, protein: 30, fat: 22, carbs: 88 , aliases: "mie bakmi mie ayam noodles" },

  // Indonesian foods — macros + micros per stated serving (TKPI / IFCT 2019 + USDA)
  { id: "nasi-goreng",    name: "Nasi goreng",              unit: "1 plate (280g)",  group: "carb",      tag: "limit", sodium: 900, sugar: 4,  kcal: 540, protein: 16, fat: 22, carbs: 70, note: "High sodium + oily — pair with veg" , aliases: "fried rice" },
  { id: "nasi-padang",    name: "Nasi padang (full plate)", unit: "1 plate (350g)",  group: "carb",      tag: "limit", sodium: 1100, sugar: 6, kcal: 760, protein: 32, fat: 32, carbs: 88, note: "Calorie bomb — split it or skip the kuah" , aliases: "padang rice" },
  { id: "nasi-uduk",      name: "Nasi uduk",                unit: "1 plate (180g)",  group: "carb",      tag: "limit", sodium: 420, kcal: 320, protein: 6, fat: 12, carbs: 46, note: "Coconut rice — richer than plain rice" , aliases: "coconut rice" },
  { id: "nasi-kuning",    name: "Nasi kuning",              unit: "1 plate (180g)",  group: "carb",      sodium: 400, kcal: 300, protein: 6, fat: 8, carbs: 50, note: "Turmeric coconut rice" , aliases: "yellow rice" },
  { id: "lontong",        name: "Lontong (rice cake)",      unit: "2 pcs (150g)",    group: "carb",      sodium: 5,   kcal: 130, protein: 2, fat: 0.5, carbs: 29, note: "Plain compressed rice — neutral base" , aliases: "rice cake" },
  { id: "bubur-ayam",     name: "Bubur ayam",               unit: "1 bowl (300g)",   group: "carb",      sodium: 850, kcal: 350, protein: 14, fat: 10, carbs: 50, note: "Easy-digest — high sodium from broth/toppings" , aliases: "chicken porridge congee" },
  { id: "sate-ayam",      name: "Sate ayam (5 skewers)",    unit: "5 skewers",       group: "protein",   tag: "good", sodium: 700, sugar: 8, kcal: 320, protein: 28, fat: 16, carbs: 16, note: "Solid protein — peanut sauce adds sugar/sodium" , aliases: "chicken satay" },
  { id: "sate-kambing",   name: "Sate kambing (5 skewers)", unit: "5 skewers",       group: "protein",   sodium: 600, sugar: 5, kcal: 360, protein: 26, fat: 24, carbs: 10, note: "Fattier than chicken satay" , aliases: "goat satay" },
  { id: "rendang",        name: "Rendang sapi",             unit: "100g",            group: "protein",   tag: "good", sodium: 480, kcal: 285, protein: 25, fat: 18, carbs: 7, note: "Rich protein — coconut+spice, watch portion" , aliases: "beef rendang" },
  { id: "ayam-goreng",    name: "Ayam goreng",              unit: "1 piece (120g)",  group: "protein",   tag: "limit", sodium: 550, kcal: 290, protein: 24, fat: 18, carbs: 9, note: "Deep-fried — remove skin to cut fat" , aliases: "fried chicken" },
  { id: "ayam-bakar",     name: "Ayam bakar",               unit: "1 piece (120g)",  group: "protein",   tag: "good", sodium: 600, sugar: 5, kcal: 240, protein: 27, fat: 12, carbs: 5, note: "Grilled — leaner pick than fried" , aliases: "grilled chicken" },
  { id: "ayam-geprek",    name: "Ayam geprek",              unit: "1 piece (140g)",  group: "protein",   tag: "limit", sodium: 800, kcal: 350, protein: 26, fat: 20, carbs: 16, note: "Fried + chili — high sodium, drink water" , aliases: "smashed fried chicken" },
  { id: "ikan-bakar",     name: "Ikan bakar",               unit: "1 fillet (150g)", group: "protein",   tag: "best", sodium: 450, kcal: 210, protein: 30, fat: 9, carbs: 2, note: "Lean grilled fish — top protein pick" , aliases: "grilled fish" },
  { id: "pepes-ikan",     name: "Pepes ikan",               unit: "1 parcel (130g)", group: "protein",   tag: "best", sodium: 420, kcal: 170, protein: 22, fat: 7, carbs: 4, note: "Steamed in banana leaf — clean protein" , aliases: "steamed spiced fish" },
  { id: "telur-balado",   name: "Telur balado",             unit: "1 egg",           group: "protein",   tag: "good", sodium: 320, sugar: 2, kcal: 120, protein: 7, fat: 8, carbs: 4, note: "Egg in chili — B12 + choline" , aliases: "egg in chilli telur" },
  { id: "tempe-goreng",   name: "Tempe goreng",             unit: "2 pcs (50g)",     group: "protein",   tag: "good", sodium: 200, kcal: 120, protein: 8, fat: 7, carbs: 6, note: "Fried tempeh — fermented, probiotic" , aliases: "fried tempe" },
  { id: "tempe",          name: "Tempe",                    unit: "100g",            group: "protein",   tag: "best", sodium: 9,   kcal: 190, protein: 19, fat: 11, carbs: 9, note: "Fermented soy — high protein + probiotic" , aliases: "tempeh" },
  { id: "tahu-goreng",    name: "Tahu goreng",              unit: "2 pcs (80g)",     group: "protein",   tag: "good", sodium: 250, kcal: 140, protein: 9, fat: 10, carbs: 4, note: "Fried tofu — plant protein side" , aliases: "fried tofu" },
  { id: "soto-ayam",      name: "Soto ayam",                unit: "1 bowl (350g)",   group: "protein",   tag: "good", sodium: 950, kcal: 260, protein: 18, fat: 12, carbs: 20, note: "Light chicken soup — high sodium broth" , aliases: "chicken soup soto" },
  { id: "bakso",          name: "Bakso",                    unit: "1 bowl (350g)",   group: "protein",   tag: "limit", sodium: 1200, kcal: 280, protein: 16, fat: 11, carbs: 30, note: "Meatball soup — very high sodium" , aliases: "meatball" },
  { id: "rawon",          name: "Rawon",                    unit: "1 bowl (350g)",   group: "protein",   tag: "good", sodium: 900, kcal: 330, protein: 24, fat: 20, carbs: 14, note: "Black beef soup — iron + B12" , aliases: "black beef soup" },
  { id: "mie-goreng",     name: "Mie goreng",               unit: "1 plate (250g)",  group: "carb",      tag: "limit", sodium: 1100, sugar: 5, kcal: 520, protein: 14, fat: 20, carbs: 72, note: "Fried noodles — high sodium + refined carb" , aliases: "fried noodles" },
  { id: "mie-ayam",       name: "Mie ayam",                 unit: "1 bowl (300g)",   group: "carb",      tag: "limit", sodium: 1000, kcal: 430, protein: 18, fat: 12, carbs: 62, note: "Chicken noodle — high sodium" , aliases: "chicken noodles" },
  { id: "indomie-goreng", name: "Indomie goreng (1 pack)",  unit: "1 pack (85g)",    group: "carb",      tag: "limit", sodium: 1330, sugar: 5, kcal: 380, protein: 8, fat: 14, carbs: 54, note: "Instant — very high sodium, add egg+veg" , aliases: "instant fried noodles" },
  { id: "kwetiau-goreng", name: "Kwetiau goreng",           unit: "1 plate (250g)",  group: "carb",      tag: "limit", sodium: 1150, sugar: 4, kcal: 500, protein: 15, fat: 20, carbs: 66, note: "Fried flat noodles — high sodium" , aliases: "fried flat noodles" },
  { id: "gado-gado",      name: "Gado-gado",                unit: "1 plate (300g)",  group: "vegetable", tag: "good", sodium: 650, sugar: 8, kcal: 400, protein: 15, fat: 22, carbs: 38, note: "Veg + peanut sauce — filling, fiber-rich" , aliases: "vegetable peanut salad" },
  { id: "capcay",         name: "Capcay",                   unit: "1 plate (250g)",  group: "vegetable", tag: "best", sodium: 700, kcal: 160, protein: 7, fat: 9, carbs: 14, note: "Mixed veg stir-fry — load up here" , aliases: "mixed vegetables" },
  { id: "tumis-kangkung", name: "Tumis kangkung",           unit: "1 plate (150g)",  group: "vegetable", tag: "best", sodium: 600, kcal: 120, protein: 4, fat: 8, carbs: 9, note: "Water spinach — iron + nitrates" , aliases: "stir fried water spinach" },
  { id: "urap",           name: "Urap",                     unit: "1 plate (150g)",  group: "vegetable", tag: "good", sodium: 400, kcal: 180, protein: 6, fat: 12, carbs: 14, note: "Spiced coconut veg — fiber-rich" , aliases: "coconut vegetable salad" },
  { id: "pisang-goreng",  name: "Pisang goreng (2 pcs)",    unit: "2 pcs (120g)",    group: "extra",     tag: "limit", sodium: 90, sugar: 16, kcal: 260, protein: 3, fat: 12, carbs: 38, note: "Fried banana — treat, not everyday" , aliases: "fried banana" },
  { id: "kerupuk",        name: "Kerupuk",                  unit: "20g",             group: "extra",     tag: "limit", sodium: 250, kcal: 110, protein: 1, fat: 6, carbs: 13, note: "Crackers — empty calories, easy to overeat" , aliases: "crackers" },
  { id: "risoles",        name: "Risoles",                  unit: "1 pc (60g)",      group: "extra",     tag: "limit", sodium: 280, sugar: 2, kcal: 180, protein: 5, fat: 10, carbs: 18, note: "Fried stuffed roll — snack" , aliases: "stuffed pastry roll" },
  { id: "es-teh-manis",   name: "Es teh manis",             unit: "1 glass (300ml)", group: "drink",     tag: "limit", sodium: 10, sugar: 22, kcal: 90, protein: 0, fat: 0, carbs: 23, note: "Pure sugar — ask for less/no sugar" , aliases: "sweet iced tea" },
  { id: "es-kopi-susu",   name: "Es kopi susu",             unit: "1 cup (250ml)",   group: "drink",     tag: "limit", sodium: 60, sugar: 24, kcal: 230, protein: 4, fat: 8, carbs: 35, note: "Palm-sugar coffee — high sugar" , aliases: "iced milk coffee" },
  { id: "es-kopi-hitam",  name: "Es kopi hitam",            unit: "1 cup (250ml)",   group: "drink",     tag: "best", sodium: 5, sugar: 0, kcal: 5, protein: 0, fat: 0, carbs: 1, note: "Iced black coffee — no sugar, basically zero cal" , aliases: "iced black coffee" },
  { id: "martabak-manis", name: "Martabak manis (1 slice)", unit: "1 slice (75g)",   group: "extra",     tag: "limit", sodium: 230, sugar: 20, kcal: 380, protein: 8, fat: 16, carbs: 52, note: "Sweet stuffed pancake — share it" , aliases: "sweet martabak terang bulan" },
  { id: "klepon",         name: "Klepon (3 pcs)",           unit: "3 pcs (60g)",     group: "extra",     tag: "limit", sodium: 30, sugar: 18, kcal: 180, protein: 2, fat: 5, carbs: 33, note: "Palm-sugar rice balls — sweet treat" , aliases: "palm sugar rice balls" },

  // Extra proteins (minced meats + rendang cut) + air-fryer snack
  { id: "beef-mince",      name: "Beef mince (grilled)",   unit: "100g (cooked)", group: "protein", favorite: true, step: 0.5, gramsPerUnit: 100, sodium: 72, kcal: 250, protein: 26, fat: 16, carbs: 0, note: "Daging cincang — high iron + zinc + B12" , aliases: "daging sapi cincang daging giling" },
  { id: "chicken-mince",   name: "Chicken mince",          unit: "100g (cooked)", group: "protein", favorite: true, step: 0.5, gramsPerUnit: 100, sodium: 80, tag: "good", kcal: 180, protein: 24, fat: 9, carbs: 0, note: "Ayam cincang — lean-ish ground chicken" , aliases: "ayam cincang ayam giling" },
  { id: "beef-chuck",      name: "Beef (rendang cut, raw)", unit: "100g (raw)",   group: "protein", step: 0.5, gramsPerUnit: 100, sodium: 65, kcal: 220, protein: 19, fat: 16, carbs: 0, note: "Daging buat rendang — fattier stewing cut" , aliases: "daging sapi mentah daging rendang" },
  { id: "risol-air-fryer", name: "Risol (air fryer)",      unit: "1 pc (60g)",    group: "extra", tag: "good", sodium: 260, sugar: 2, kcal: 130, protein: 5, fat: 4, carbs: 18, note: "Air-fried — ~6g less fat than deep-fried" , aliases: "stuffed pastry roll risoles" },

  // Indonesian snacks + bakery / café
  { id: "siomay",         name: "Siomay (1 portion)",       unit: "1 plate (~5 pcs + sauce)", group: "protein", tag: "good", sodium: 700, sugar: 6, kcal: 350, protein: 15, fat: 16, carbs: 38, note: "Fish dumpling + peanut sauce — decent protein" , aliases: "steamed dumpling" },
  { id: "siomay-sambal",  name: "Siomay pakai sambal",      unit: "1 pc",            group: "protein", tag: "good", sodium: 180, sugar: 1, kcal: 55, protein: 3, fat: 2, carbs: 6, note: "Per piece with sambal — no peanut sauce" , aliases: "steamed dumpling with chilli" },
  { id: "bagel",          name: "Bagel (plain)",            unit: "1 whole (100g)", group: "carb",  tag: "limit", sodium: 430, sugar: 5, kcal: 250, protein: 10, fat: 1.5, carbs: 50, note: "Refined — pair with protein spread" , aliases: "bagel roti" },
  { id: "cheesecake",     name: "Cheesecake (1 slice)",     unit: "1 slice (100g)", group: "extra", tag: "limit", sodium: 280, sugar: 20, kcal: 320, protein: 6, fat: 22, carbs: 26, note: "Dessert — share or half-portion it" , aliases: "kue keju cheesecake" },
  { id: "bolu",           name: "Bolu (sponge cake)",       unit: "1 slice (60g)",  group: "extra", tag: "limit", sodium: 150, sugar: 18, kcal: 200, protein: 4, fat: 8, carbs: 28, note: "Sponge cake — sweet treat" , aliases: "sponge cake" },
  { id: "srikaya-toast",  name: "Srikaya butter toast",     unit: "1 serving (2 slices)", group: "extra", tag: "limit", sodium: 380, sugar: 20, kcal: 350, protein: 8, fat: 14, carbs: 48, note: "Roti bakar srikaya — sweet coconut-jam toast" , aliases: "roti bakar srikaya roti bakar" },

  // Drinks — café + shakes
  { id: "starbucks-matcha-latte", name: "Starbucks matcha latte", unit: "grande, 2% milk", group: "drink", tag: "limit", sodium: 150, sugar: 32, kcal: 240, protein: 12, fat: 6, carbs: 34, note: "Pre-sweetened matcha — 32g sugar. Ask 'no classic'" , aliases: "matcha latte teh hijau" },
  { id: "caffe-latte",            name: "Caffe latte",            unit: "grande, 2% milk", group: "drink", sodium: 150, sugar: 17, kcal: 190, protein: 12, fat: 7, carbs: 18, note: "Milk-based — 12g protein, calcium" , aliases: "kopi latte kopi susu" },
  { id: "whey-chocolate",         name: "Whey chocolate (1 scoop)", unit: "1 scoop (35g)", group: "drink", tag: "best", step: 0.5, gramsPerUnit: 35, sodium: 60, sugar: 2, kcal: 130, protein: 24, fat: 2, carbs: 5, note: "Chocolate protein shake — 24g protein" , aliases: "whey cokelat protein bubuk" },
];

export const GROUPS: { key: Ingredient["group"]; label: string }[] = [
  { key: "protein",    label: "Proteins" },
  { key: "carb",       label: "Carbs" },
  { key: "vegetable",  label: "Vegetables" },
  { key: "extra",      label: "Extras" },
  { key: "drink",      label: "Drinks" },
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
