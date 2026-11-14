import { redirect } from "next/navigation";

// Keep old links working; the personal setup gate decides the destination.
export default function WelcomePage() {
  redirect("/");
}
