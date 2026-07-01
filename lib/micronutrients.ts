// Micronutrient profiles, keyed by ingredient id. Values are PER ONE UNIT
// of the ingredient (same basis as the macros in lib/ingredients.ts), so
// they scale by qty via microsFor(). Sourced from the user's measured
// nutrition plan where available, USDA FoodData Central otherwise.

export type MicroProfile = {
  na?: number;   // sodium, mg
  k?: number;    // potassium, mg
  mg?: number;   // magnesium, mg
  fe?: number;   // iron, mg
  zn?: number;   // zinc, mg
  ca?: number;   // calcium, mg
  fiber?: number;// g
  omega3?: number;// g (ALA+EPA+DHA)
  tags?: string[];
};

export type MicroTotals = {
  na: number; k: number; mg: number; fe: number; zn: number;
  ca: number; fiber: number; omega3: number; tags: string[];
};

export const MICROS: Record<string, MicroProfile> = {
  // ---- Proteins ----
  // egg: per 1 egg (~50g) — authoritative from user's plan
  egg: { na: 71, k: 69, mg: 6, fe: 0.9, zn: 0.6, ca: 28, tags: ["B12", "choline"] },
  // chicken-breast: per 250g unit — authoritative
  "chicken-breast": { na: 115, k: 850, mg: 70, fe: 1, zn: 1.7, ca: 13 },
  // chicken-thigh: per 150g (USDA, skinless roasted ~ per 100g k 230, mg 23, fe 1.3, zn 2.1, ca 11, na 90)
  "chicken-thigh": { na: 135, k: 345, mg: 35, fe: 1.9, zn: 3.2, ca: 16 },
  // beef-slice: per 30g (lean beef per 100g k 320, mg 20, fe 2.0, zn 4.5, ca 12, na 55)
  "beef-slice": { na: 17, k: 96, mg: 6, fe: 0.6, zn: 1.4, ca: 4 },
  // whey: per 30g scoop (isolate ~ per scoop na 60, k 160, mg 25, ca 120, plus B12 fortified)
  whey: { na: 60, k: 160, mg: 25, fe: 0.3, zn: 1, ca: 120, tags: ["B12"] },
  // greek-yogurt: per 150g — authoritative
  "greek-yogurt": { na: 60, k: 220, mg: 18, fe: 0.1, zn: 0.9, ca: 187, tags: ["probiotic", "B12"] },
  // tofu: per 100g — authoritative
  tofu: { na: 7, k: 120, mg: 30, fe: 1.6, zn: 0.8, ca: 135, fiber: 0.5 },
  // salmon: per 150g — authoritative
  salmon: { na: 75, k: 700, mg: 45, fe: 0.8, zn: 0.9, ca: 18, omega3: 3.5, tags: ["omega-3", "vit-D", "B12"] },
  // ribeye: per 100g cooked (USDA beef rib k 290, mg 19, fe 2.0, zn 4.6, ca 11, na 55)
  ribeye: { na: 55, k: 290, mg: 19, fe: 2, zn: 4.6, ca: 11, tags: ["B12"] },

  // ---- Carbs — Rice & grains ----
  // purple-rice: per 100g cooked (black/purple rice — high fiber, iron)
  "purple-rice": { na: 3, k: 80, mg: 32, fe: 1.1, zn: 0.9, ca: 8, fiber: 2.2, tags: ["antioxidants"] },
  // white-rice: per 100g cooked
  "white-rice": { na: 1, k: 35, mg: 12, fe: 0.2, zn: 0.5, ca: 10, fiber: 0.4 },
  // brown-rice: per 100g cooked
  "brown-rice": { na: 4, k: 80, mg: 44, fe: 0.5, zn: 0.6, ca: 10, fiber: 1.6 },
  // oats: per 30g scoop — authoritative
  oats: { na: 1, k: 129, mg: 53, fe: 1.4, zn: 1.2, ca: 16, fiber: 3.2, tags: ["beta-glucan"] },
  // granola: per 30g (USDA, sweetened with nuts/oats)
  granola: { na: 12, k: 110, mg: 35, fe: 1.2, zn: 0.8, ca: 25, fiber: 2.6, tags: ["flavanols"] },

  // ---- Carbs — Potato & root ----
  // sweet-potato: per 100g baked
  "sweet-potato": { na: 36, k: 475, mg: 27, fe: 0.7, zn: 0.3, ca: 38, fiber: 3.3, tags: ["antioxidants"] },
  // potato: per 100g baked
  potato: { na: 6, k: 425, mg: 25, fe: 0.8, zn: 0.3, ca: 12, fiber: 2.2 },

  // ---- Carbs — Fruit carbs ----
  // banana: per 1 whole — authoritative
  banana: { na: 1, k: 422, mg: 32, fe: 0.3, zn: 0.2, ca: 6, fiber: 3, tags: ["antioxidants"] },
  // melon: per quarter cantaloupe (~135g flesh)
  melon: { na: 22, k: 360, mg: 16, fe: 0.3, zn: 0.2, ca: 12, fiber: 1.2, tags: ["antioxidants"] },
  // apple: per 1 medium (~180g)
  apple: { na: 2, k: 195, mg: 9, fe: 0.2, zn: 0.1, ca: 11, fiber: 4.4, tags: ["antioxidants"] },
  // mango: per 100g
  mango: { na: 1, k: 168, mg: 10, fe: 0.2, zn: 0.1, ca: 11, fiber: 1.6, tags: ["antioxidants"] },
  // grapes: per 100g
  grapes: { na: 2, k: 191, mg: 7, fe: 0.4, zn: 0.1, ca: 10, fiber: 0.9, tags: ["antioxidants", "flavanols"] },
  // pineapple: per 100g
  pineapple: { na: 1, k: 109, mg: 12, fe: 0.3, zn: 0.1, ca: 13, fiber: 1.4 },
  // blueberries: per 50g
  blueberries: { na: 1, k: 38, mg: 3, fe: 0.1, zn: 0.1, ca: 3, fiber: 1.2, tags: ["antioxidants"] },
  // mixed-fruits: per 150g (generic fruit mix)
  "mixed-fruits": { na: 3, k: 240, mg: 14, fe: 0.4, zn: 0.2, ca: 18, fiber: 3, tags: ["antioxidants"] },

  // ---- Carbs — Bread & noodles ----
  // noodles: per 100g dry (wheat)
  noodles: { na: 6, k: 180, mg: 50, fe: 3.3, zn: 1.4, ca: 25, fiber: 3.2 },
  // bread: per 1 slice (~30g)
  bread: { na: 145, k: 35, mg: 8, fe: 0.9, zn: 0.3, ca: 38, fiber: 0.8 },

  // ---- Vegetables ----
  // enoki: per 50g
  enoki: { na: 2, k: 180, mg: 8, fe: 0.5, zn: 0.3, ca: 0, fiber: 1.4 },
  // tomato: per 150g whole
  tomato: { na: 8, k: 356, mg: 17, fe: 0.4, zn: 0.3, ca: 15, fiber: 1.8, tags: ["antioxidants"] },
  // cherry-tomato: per 100g
  "cherry-tomato": { na: 5, k: 237, mg: 11, fe: 0.3, zn: 0.2, ca: 10, fiber: 1.2, tags: ["antioxidants"] },
  // eggplant: per 100g
  eggplant: { na: 2, k: 229, mg: 14, fe: 0.2, zn: 0.2, ca: 9, fiber: 3 },
  // broccoli: per 75g (¼ head) — authoritative
  broccoli: { na: 22, k: 230, mg: 17, fe: 0.5, zn: 0.3, ca: 35, fiber: 2, tags: ["nitrates", "antioxidants"] },
  // spinach: per 100g
  spinach: { na: 79, k: 558, mg: 79, fe: 2.7, zn: 0.5, ca: 99, fiber: 2.2, tags: ["nitrates", "antioxidants"] },
  // asparagus: per 100g
  asparagus: { na: 2, k: 202, mg: 14, fe: 2.1, zn: 0.5, ca: 24, fiber: 2.1, tags: ["antioxidants"] },
  // bok-choy: per 100g
  "bok-choy": { na: 65, k: 252, mg: 19, fe: 0.8, zn: 0.2, ca: 105, fiber: 1, tags: ["antioxidants"] },
  // king-oyster-mushroom: per 100g
  "king-oyster-mushroom": { na: 2, k: 380, mg: 18, fe: 0.5, zn: 0.8, ca: 3, fiber: 3 },
  // shiitake-mushroom: per 100g
  "shiitake-mushroom": { na: 9, k: 304, mg: 20, fe: 0.4, zn: 1, ca: 2, fiber: 2.5 },
  // oyster-mushroom: per 100g
  "oyster-mushroom": { na: 18, k: 420, mg: 18, fe: 1.3, zn: 0.8, ca: 3, fiber: 2.3 },
  // white-button-mushroom: per 100g
  "white-button-mushroom": { na: 5, k: 318, mg: 9, fe: 0.5, zn: 0.5, ca: 3, fiber: 1, tags: ["vit-D"] },
  // deer-antler-mushroom: per 100g (similar to enoki/generic mushroom)
  "deer-antler-mushroom": { na: 4, k: 300, mg: 12, fe: 0.6, zn: 0.7, ca: 2, fiber: 2.5 },
  // bell-pepper: per 120g whole
  "bell-pepper": { na: 4, k: 254, mg: 14, fe: 0.5, zn: 0.3, ca: 8, fiber: 2.5, tags: ["antioxidants"] },
  // cabbage: per 100g
  cabbage: { na: 18, k: 170, mg: 12, fe: 0.5, zn: 0.2, ca: 40, fiber: 2.5 },
  // carrot: per 100g
  carrot: { na: 69, k: 320, mg: 12, fe: 0.3, zn: 0.2, ca: 33, fiber: 2.8, tags: ["antioxidants"] },
  // celery: per 100g
  celery: { na: 80, k: 260, mg: 11, fe: 0.2, zn: 0.1, ca: 40, fiber: 1.6 },
  // corn: per 100g
  corn: { na: 15, k: 270, mg: 37, fe: 0.5, zn: 0.5, ca: 2, fiber: 2.4 },
  // cucumber: per 100g
  cucumber: { na: 2, k: 147, mg: 13, fe: 0.3, zn: 0.2, ca: 16, fiber: 0.5 },
  // green-beans: per 100g
  "green-beans": { na: 6, k: 211, mg: 25, fe: 1, zn: 0.2, ca: 37, fiber: 2.7 },
  // okra: per 100g
  okra: { na: 7, k: 299, mg: 57, fe: 0.6, zn: 0.6, ca: 82, fiber: 3.2 },
  // zucchini: per 100g
  zucchini: { na: 8, k: 261, mg: 18, fe: 0.4, zn: 0.3, ca: 16, fiber: 1 },

  // ---- Extras — Supplements ----
  // creatine: per 10g — pure monohydrate, no micros
  creatine: {},
  // whey-extra: per 30g scoop (fortified)
  "whey-extra": { na: 150, k: 160, mg: 25, fe: 0.3, zn: 1, ca: 120, tags: ["B12"] },

  // ---- Extras — Seasonings & sauces (mainly sodium) ----
  // soy-sauce: per 1 tbsp (~16g)
  "soy-sauce": { na: 900, k: 64, mg: 6, fe: 0.4, zn: 0.1, ca: 3 },
  // low-soy-sauce: per 1 tbsp
  "low-soy-sauce": { na: 570, k: 60, mg: 6, fe: 0.4, zn: 0.1, ca: 3 },
  // oyster-sauce: per 1 tbsp (~18g)
  "oyster-sauce": { na: 492, k: 8, mg: 2, fe: 0.1, zn: 0.1, ca: 6 },
  // sukiyaki-sauce: per 1 tbsp
  "sukiyaki-sauce": { na: 400, k: 30, mg: 4, fe: 0.2, zn: 0.1, ca: 4 },
  // gyudon-sauce: per 1 tbsp
  "gyudon-sauce": { na: 450, k: 35, mg: 4, fe: 0.2, zn: 0.1, ca: 4 },
  // black-pepper: per 1 tsp (~2g)
  "black-pepper": { na: 0, k: 26, mg: 4, fe: 0.2, zn: 0.1, ca: 9, fiber: 0.6 },
  // garlic-powder: per 1 tsp (~3g)
  "garlic-powder": { na: 2, k: 33, mg: 2, fe: 0.1, zn: 0.1, ca: 3 },
  // lemon-juice: per 1 tbsp (~15g)
  "lemon-juice": { na: 0, k: 19, mg: 1, fe: 0, zn: 0, ca: 1, tags: ["antioxidants"] },

  // ---- Extras — Drinks ----
  // water: per 500ml — negligible
  water: {},
  // black-coffee: per 1 cup (~240ml)
  "black-coffee": { na: 5, k: 116, mg: 7, fe: 0.1, zn: 0.1, ca: 5 },
  // matcha-latte: per serving (milk-based, no sugar)
  "matcha-latte": { na: 120, k: 240, mg: 25, fe: 0.6, zn: 0.6, ca: 200, tags: ["antioxidants", "flavanols"] },
  // coconut-latte: per serving
  "coconut-latte": { na: 80, k: 230, mg: 20, fe: 0.5, zn: 0.4, ca: 150, tags: ["antioxidants"] },
  // egg-drop-soup: per 200ml
  "egg-drop-soup": { na: 800, k: 90, mg: 8, fe: 0.6, zn: 0.4, ca: 22 },
  // yogurt-extra: per 150g — same as greek-yogurt
  "yogurt-extra": { na: 60, k: 220, mg: 18, fe: 0.1, zn: 0.9, ca: 187, tags: ["probiotic", "B12"] },
  // protein-bar: per 1 bar (fortified)
  "protein-bar": { na: 180, k: 200, mg: 60, fe: 2, zn: 2, ca: 150, fiber: 5, tags: ["B12"] },

  // ---- Extras — Snacks ----
  // almonds: per 30g
  almonds: { na: 0, k: 220, mg: 80, fe: 1.1, zn: 0.9, ca: 76, fiber: 3.5 },
  // walnuts: per 30g
  walnuts: { na: 1, k: 132, mg: 47, fe: 0.9, zn: 0.9, ca: 29, fiber: 2, omega3: 2.7, tags: ["omega-3", "antioxidants"] },
  // beef-jerky: per 25g
  "beef-jerky": { na: 229, k: 148, mg: 12, fe: 1.4, zn: 2.3, ca: 5, tags: ["B12"] },
  // peanut-butter: per 1 tbsp (~16g)
  "peanut-butter": { na: 73, k: 104, mg: 27, fe: 0.3, zn: 0.5, ca: 7, fiber: 1.6 },

  // ---- Chinese cafeteria — protein-forward ----
  // xiao-long-bao: per 6 pieces (pork + wrapper + broth)
  "xiao-long-bao": { na: 620, k: 220, mg: 22, fe: 1.8, zn: 1.5, ca: 30, fiber: 1.5 },
  // jiaozi: per 8 pieces
  jiaozi: { na: 700, k: 280, mg: 28, fe: 2.2, zn: 1.8, ca: 40, fiber: 2.5 },
  // wonton-soup: per 6 wontons + broth
  "wonton-soup": { na: 900, k: 240, mg: 20, fe: 1.6, zn: 1.3, ca: 35, fiber: 1.5 },
  // mapo-tofu: per 1 bowl (tofu + minced meat + chili-bean sauce)
  "mapo-tofu": { na: 950, k: 320, mg: 50, fe: 2.5, zn: 1.6, ca: 200, fiber: 2 },

  // ---- Chinese cafeteria — carb-forward ----
  // fried-rice: per 1 plate (rice + egg + oil + soy)
  "fried-rice": { na: 850, k: 220, mg: 35, fe: 1.8, zn: 1.5, ca: 40, fiber: 2 },
  // congee: per 1 bowl (rice porridge)
  congee: { na: 350, k: 90, mg: 18, fe: 0.6, zn: 0.7, ca: 15, fiber: 0.8 },
  // mantou: per 1 piece (steamed wheat bun)
  mantou: { na: 200, k: 60, mg: 18, fe: 1.2, zn: 0.6, ca: 30, fiber: 1.5 },
  // noodle-soup: per 1 bowl (wheat noodles + broth + toppings)
  "noodle-soup": { na: 1100, k: 320, mg: 45, fe: 2.5, zn: 1.6, ca: 45, fiber: 3 },

  // ---- Family Mart snacks & drinks ----
  // fm-onigiri: per 1 piece (rice ball with filling, seaweed)
  "fm-onigiri": { na: 450, k: 70, mg: 14, fe: 0.5, zn: 0.6, ca: 12, fiber: 1 },
  // fm-sandwich: per 1 sandwich
  "fm-sandwich": { na: 600, k: 180, mg: 22, fe: 1.5, zn: 1.1, ca: 90, fiber: 2 },
  // fm-hot-dog: per 1 piece
  "fm-hot-dog": { na: 700, k: 150, mg: 16, fe: 1.2, zn: 1.3, ca: 60, fiber: 1 },
  // lays-chips: per 30g bag
  "lays-chips": { na: 170, k: 360, mg: 18, fe: 0.4, zn: 0.3, ca: 7, fiber: 1.2 },
  // pocky: per 1 pack (~40g)
  pocky: { na: 60, k: 90, mg: 16, fe: 0.8, zn: 0.4, ca: 40, fiber: 0.8 },
  // yakult: per 100ml bottle (cultured milk drink)
  yakult: { na: 15, k: 45, mg: 5, fe: 0, zn: 0.2, ca: 30, tags: ["probiotic"] },
  // coconut-water: per 330ml
  "coconut-water": { na: 84, k: 660, mg: 50, fe: 0.4, zn: 0.3, ca: 80 },

  // ---- Placeholder ----
  // small-chocolate: per 1 piece ~30g (dark-chocolate basis) — authoritative micro set
  "small-chocolate": { na: 5, k: 145, mg: 65, fe: 3.4, zn: 0.9, ca: 14, fiber: 2.2, tags: ["flavanols", "antioxidants"] },

  // ---- Supplements — seeds ----
  // chia-seeds: per 15g tbsp — authoritative
  "chia-seeds": { na: 2, k: 61, mg: 50, fe: 1.1, zn: 0.7, ca: 95, fiber: 5.2, omega3: 2.7, tags: ["omega-3"] },

  // ---- Restaurant — Lanzhou beef noodles ----
  // spicy-beef-noodle: per 1 bowl (red broth, high sodium)
  "spicy-beef-noodle": { na: 1200, k: 480, mg: 50, fe: 4, zn: 4, ca: 60, fiber: 3 },
  // clear-beef-noodle: per 1 bowl (clear broth)
  "clear-beef-noodle": { na: 700, k: 500, mg: 48, fe: 4, zn: 4.2, ca: 55, fiber: 3 },

  // ---- Restaurant — Bakmi Cerita Kita (Indonesian egg noodle) ----
  // bakmi-cerita-kita-small: per 1 small bowl
  "bakmi-cerita-kita-small": { na: 800, k: 320, mg: 38, fe: 2.5, zn: 1.8, ca: 45, fiber: 3 },
  // bakmi-cerita-kita: per 1 regular bowl
  "bakmi-cerita-kita": { na: 1100, k: 430, mg: 52, fe: 3.5, zn: 2.4, ca: 60, fiber: 4 },
  // bakmi-cerita-kita-large: per 1 large bowl
  "bakmi-cerita-kita-large": { na: 1400, k: 540, mg: 65, fe: 4.4, zn: 3, ca: 75, fiber: 5 },

  // ---- Indonesian foods (per stated serving; built from TKPI/USDA components) ----
  "nasi-goreng":    { na: 900, k: 280, mg: 35, fe: 1.8, zn: 1.5, ca: 35, fiber: 2.5, tags: ["B12"] },
  "nasi-padang":    { na: 1100, k: 520, mg: 60, fe: 4.5, zn: 4.0, ca: 90, fiber: 4, tags: ["B12", "antioxidants"] },
  "nasi-uduk":      { na: 420, k: 140, mg: 25, fe: 1.0, zn: 0.9, ca: 20, fiber: 1.5 },
  "nasi-kuning":    { na: 400, k: 150, mg: 26, fe: 1.2, zn: 0.9, ca: 22, fiber: 1.5, tags: ["antioxidants"] },
  "lontong":        { na: 5, k: 30, mg: 10, fe: 0.3, zn: 0.5, ca: 8, fiber: 0.6 },
  "bubur-ayam":     { na: 850, k: 320, mg: 30, fe: 1.5, zn: 1.3, ca: 30, fiber: 1.5, tags: ["B12"] },
  "sate-ayam":      { na: 700, k: 420, mg: 55, fe: 1.8, zn: 2.4, ca: 30, fiber: 2, tags: ["B12"] },
  "sate-kambing":   { na: 600, k: 380, mg: 35, fe: 3.2, zn: 4.5, ca: 25, fiber: 1, tags: ["B12"] },
  "rendang":        { na: 480, k: 320, mg: 28, fe: 3.5, zn: 4.8, ca: 30, fiber: 1.5, tags: ["B12", "antioxidants"] },
  "ayam-goreng":    { na: 550, k: 280, mg: 28, fe: 1.4, zn: 1.8, ca: 16, tags: ["B12"] },
  "ayam-bakar":     { na: 600, k: 330, mg: 32, fe: 1.5, zn: 2.0, ca: 18, tags: ["B12"] },
  "ayam-geprek":    { na: 800, k: 320, mg: 30, fe: 1.6, zn: 1.9, ca: 25, tags: ["B12", "antioxidants"] },
  "ikan-bakar":     { na: 450, k: 480, mg: 45, fe: 1.2, zn: 0.9, ca: 35, omega3: 1.2, tags: ["omega-3", "vit-D", "B12"] },
  "pepes-ikan":     { na: 420, k: 420, mg: 40, fe: 1.4, zn: 0.9, ca: 50, omega3: 1.0, tags: ["omega-3", "vit-D", "B12"] },
  "telur-balado":   { na: 320, k: 90, mg: 8, fe: 1.0, zn: 0.6, ca: 30, tags: ["B12", "choline", "antioxidants"] },
  "tempe-goreng":   { na: 200, k: 200, mg: 40, fe: 1.3, zn: 0.9, ca: 60, fiber: 2.5, tags: ["probiotic", "B12"] },
  "tempe":          { na: 9, k: 410, mg: 81, fe: 2.7, zn: 1.8, ca: 111, fiber: 7, tags: ["probiotic", "B12"] },
  "tahu-goreng":    { na: 250, k: 130, mg: 30, fe: 1.5, zn: 0.8, ca: 200, fiber: 1 },
  "soto-ayam":      { na: 950, k: 380, mg: 35, fe: 1.6, zn: 1.4, ca: 40, fiber: 1.5, tags: ["B12"] },
  "bakso":          { na: 1200, k: 350, mg: 28, fe: 2.0, zn: 2.5, ca: 35, fiber: 1.5, tags: ["B12"] },
  "rawon":          { na: 900, k: 420, mg: 40, fe: 3.5, zn: 4.5, ca: 45, fiber: 2, tags: ["B12", "antioxidants"] },
  "mie-goreng":     { na: 1100, k: 250, mg: 35, fe: 2.0, zn: 1.4, ca: 40, fiber: 3 },
  "mie-ayam":       { na: 1000, k: 320, mg: 32, fe: 1.8, zn: 1.5, ca: 35, fiber: 2.5, tags: ["B12"] },
  "indomie-goreng": { na: 1330, k: 130, mg: 20, fe: 2.6, zn: 0.8, ca: 20, fiber: 2 },
  "kwetiau-goreng": { na: 1150, k: 240, mg: 30, fe: 1.9, zn: 1.4, ca: 35, fiber: 2.5 },
  "gado-gado":      { na: 650, k: 600, mg: 70, fe: 3.0, zn: 2.0, ca: 120, fiber: 7, tags: ["nitrates", "antioxidants"] },
  "capcay":         { na: 700, k: 420, mg: 35, fe: 1.8, zn: 0.9, ca: 80, fiber: 4, tags: ["nitrates", "antioxidants"] },
  "tumis-kangkung": { na: 600, k: 380, mg: 55, fe: 2.5, zn: 0.6, ca: 90, fiber: 3, tags: ["nitrates", "antioxidants"] },
  "urap":           { na: 400, k: 400, mg: 50, fe: 2.2, zn: 1.0, ca: 110, fiber: 5, tags: ["nitrates", "antioxidants"] },
  "pisang-goreng":  { na: 90, k: 300, mg: 25, fe: 0.6, zn: 0.3, ca: 15, fiber: 2.5 },
  "kerupuk":        { na: 250, k: 40, mg: 8, fe: 0.4, zn: 0.3, ca: 10 },
  "risoles":        { na: 280, k: 120, mg: 12, fe: 0.8, zn: 0.5, ca: 25, fiber: 1 },
  "es-teh-manis":   { na: 10, k: 40, mg: 5, fe: 0.1, ca: 5 },
  "es-kopi-susu":   { na: 60, k: 220, mg: 18, fe: 0.2, zn: 0.4, ca: 120 },
  "martabak-manis": { na: 230, k: 180, mg: 20, fe: 1.2, zn: 0.8, ca: 90, fiber: 1.8 },
  "klepon":         { na: 30, k: 80, mg: 10, fe: 0.5, zn: 0.3, ca: 20, fiber: 1 },

  // ---- Extra proteins + air-fryer snack ----
  "beef-mince":      { na: 72, k: 270, mg: 20, fe: 2.6, zn: 5.3, ca: 18, tags: ["B12"] },
  "chicken-mince":   { na: 80, k: 250, mg: 24, fe: 1.0, zn: 1.8, ca: 12, tags: ["B12"] },
  "beef-chuck":      { na: 65, k: 300, mg: 19, fe: 2.3, zn: 4.5, ca: 12, tags: ["B12"] },
  "risol-air-fryer": { na: 260, k: 120, mg: 12, fe: 0.8, zn: 0.5, ca: 25, fiber: 1 },

  // ---- Indonesian snacks + bakery / café ----
  "siomay":        { na: 700, k: 400, mg: 45, fe: 1.8, zn: 1.2, ca: 60, fiber: 3, omega3: 0.3, tags: ["B12"] },
  "bagel":         { na: 430, k: 80, mg: 25, fe: 3.2, zn: 0.9, ca: 20, fiber: 2 },
  "cheesecake":    { na: 280, k: 90, mg: 10, fe: 0.6, zn: 0.5, ca: 60 },
  "bolu":          { na: 150, k: 50, mg: 6, fe: 1.0, zn: 0.4, ca: 30, tags: ["choline"] },
  "srikaya-toast": { na: 380, k: 120, mg: 18, fe: 2.0, zn: 0.7, ca: 60, fiber: 2, tags: ["choline"] },
};

export function microsFor(id: string, qty: number): MicroTotals {
  const m = MICROS[id];
  const empty: MicroTotals = { na: 0, k: 0, mg: 0, fe: 0, zn: 0, ca: 0, fiber: 0, omega3: 0, tags: [] };
  if (!m) return empty;
  return {
    na: (m.na ?? 0) * qty,
    k: (m.k ?? 0) * qty,
    mg: (m.mg ?? 0) * qty,
    fe: (m.fe ?? 0) * qty,
    zn: (m.zn ?? 0) * qty,
    ca: (m.ca ?? 0) * qty,
    fiber: (m.fiber ?? 0) * qty,
    omega3: (m.omega3 ?? 0) * qty,
    tags: qty > 0 ? (m.tags ?? []) : [],
  };
}
