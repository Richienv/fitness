export type Nutrition = {
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
};
const format = (n: number | null) =>
  n == null
    ? "Belum tersedia"
    : new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(n);
export default function NutritionSummary({
  values,
  caption,
}: {
  values: Nutrition;
  caption?: string;
}) {
  return (
    <div className="nutrition-summary" aria-live="polite" aria-atomic="true">
      <div className="nutrition-energy">
        <span>Kalori</span>
        <strong>
          {values.kcal == null
            ? "—"
            : Math.round(values.kcal).toLocaleString("id-ID")}{" "}
          <small>kkal</small>
        </strong>
        {caption && <small>{caption}</small>}
      </div>
      <div className="nutrition-macros">
        {(
          [
            ["protein", "Protein"],
            ["carbs", "Karbohidrat"],
            ["fat", "Lemak"],
          ] as const
        ).map(([key, label]) => (
          <div className={`nutrition-stat ${key}`} key={key}>
            <span>{label}</span>
            <strong>
              {format(values[key])}
              {values[key] != null && <small> g</small>}
            </strong>
          </div>
        ))}
      </div>
    </div>
  );
}
