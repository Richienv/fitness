import SessionComplete from "./SessionComplete";

export default async function SessionCompletePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SessionComplete workoutId={id} />;
}
