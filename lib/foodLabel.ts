// Localize curated staples by stable id. Brand and catalogue names stay source-faithful.
const NAMES: Record<string, string> = {
  egg: "Telur ayam",
  "chicken-breast": "Dada ayam",
  "chicken-thigh": "Paha ayam",
  "beef-slice": "Irisan daging sapi",
  whey: "Whey protein",
  "greek-yogurt": "Yogurt Yunani",
  tofu: "Tahu",
  salmon: "Ikan salmon",
  ribeye: "Steak ribeye",
  "purple-rice": "Nasi ungu",
  "white-rice": "Nasi putih",
  "brown-rice": "Nasi merah",
  oats: "Oat (Member’s Mark)",
  banana: "Pisang",
  apple: "Apel",
  almonds: "Almond",
  broccoli: "Brokoli",
};
export const foodLabel = (food: { id: string; name: string }) =>
  NAMES[food.id] ?? food.name;
