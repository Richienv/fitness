import SessionLogger from "./SessionLogger";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SessionLogger workoutId={id} />;
}
