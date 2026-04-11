import ConfirmMeal from "./ConfirmMeal";

type SP = Promise<{ preset?: string }>;

export default async function ConfirmPage({ searchParams }: { searchParams: SP }) {
  const { preset } = await searchParams;
  return <ConfirmMeal presetId={preset ?? ""} />;
}
