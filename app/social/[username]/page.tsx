import ProfilePage from "./ProfilePage";

export default async function SocialProfileRoute({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  return <ProfilePage username={username} />;
}
