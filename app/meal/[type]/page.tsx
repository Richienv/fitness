import { notFound } from "next/navigation";
import MealBuilder from "./MealBuilder";
import type { MealType } from "@/lib/presets";

const VALID: MealType[] = ["breakfast", "lunch", "snack", "dinner"];

export default async function MealBuilderPage({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  const { type } = await params;
  if (!VALID.includes(type as MealType)) notFound();
  return <MealBuilder mealType={type as MealType} />;
}
