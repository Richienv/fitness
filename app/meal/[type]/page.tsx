import { notFound } from "next/navigation";
import MealHome from "../MealHome";
import type { MealType } from "@/lib/presets";

const VALID: MealType[] = ["breakfast", "lunch", "snack", "dinner"];

/**
 * /meal/breakfast … /meal/dinner — the same MAKAN screen as /meal, with the
 * food builder already open on that slot.
 *
 * This route used to render its own MealBuilder: a separate, older food logger
 * in English with a different search box, which meant the app had two food
 * UIs and you got one or the other depending on whether you tapped "CATAT" on
 * MAKAN or "LOG NOW" on the dashboard. The links all still work; they just
 * arrive somewhere consistent now.
 */
export default async function MealTypePage({
  params,
  searchParams,
}: {
  params: Promise<{ type: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { type } = await params;
  const { date } = await searchParams;
  if (!VALID.includes(type as MealType)) notFound();
  return <MealHome initialBuilder={type as MealType} initialDate={date} />;
}
