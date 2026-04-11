import { notFound } from "next/navigation";
import MealBuilder from "./MealBuilder";
import type { MealType } from "@/lib/presets";

const VALID: MealType[] = ["breakfast", "lunch", "snack", "dinner"];

export default async function MealBuilderPage({
  params,
  searchParams,
}: {
  params: Promise<{ type: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { type } = await params;
  const { date } = await searchParams;
  if (!VALID.includes(type as MealType)) notFound();
  return <MealBuilder mealType={type as MealType} dateParam={date} />;
}
