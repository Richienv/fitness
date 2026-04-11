import ConfirmMeal from "./ConfirmMeal";

type SP = Promise<{ preset?: string; date?: string }>;

export default async function ConfirmPage({ searchParams }: { searchParams: SP }) {
  const { preset, date } = await searchParams;
  return <ConfirmMeal presetId={preset ?? ""} dateParam={date} />;
}
