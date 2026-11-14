"use client";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { useAccountSetup } from "../SetupProvider";
import { PERSON } from "@/lib/setup";
export default function SettingsPage() {
  const account = useAccountSetup();
  if (!account?.setup) return null;
  const s = account.setup;
  return (
    <main className={`setup-shell settings-overview ${account.person}`}>
      <header className="setup-header">
        <Link href="/" className="entry-back" aria-label="Beranda">
          ←
        </Link>
        <span>Settings</span>
        <Link href="/welcome">Welcome ↗</Link>
      </header>
      <div className="settings-person">
        <img
          src={`/avatars/v2/${account.person}-level-01-poster.webp`}
          alt=""
          width="105"
          height="140"
        />
        <div>
          <p>AKUN PRIBADI</p>
          <h1>{PERSON[account.person].name}</h1>
          <span>Data tersimpan di akunmu.</span>
        </div>
      </div>
      <div className="settings-deal">
        <span>Target {s.deadline.split("-").reverse().join(" / ")}</span>
        <strong>
          {s.targetWeightKg}
          <small> kg</small>
        </strong>
        <Link href="/onboarding?edit=target">Ubah target →</Link>
      </div>
      <div className="setup-review-list">
        {[
          [
            "body",
            "Data tubuh",
            `${s.profile.age} tahun · ${s.profile.heightCm} cm · ${s.profile.weightKg} kg`,
          ],
          [
            "target",
            "Fokus & ukuran",
            `${s.draft.goal === "recomp" ? "Lebih kuat, lebih lean" : "Target pribadi"} · ${s.measurement.waistCm ? `pinggang ${s.measurement.waistCm} cm` : "lingkar tubuh belum diukur"}`,
          ],
          [
            "routine",
            "Rutinitas",
            `${s.trainingDays.length} hari latihan · tidur ${s.sleepHours} jam`,
          ],
          [
            "food",
            "Makan & preferensi",
            `${s.targets.gymDay.kcal} / ${s.targets.restDay.kcal} kcal · protein ${s.targets.gymDay.protein} g`,
          ],
        ].map(([section, title, description]) => (
          <Link key={section} href={`/onboarding?edit=${section}`}>
            <span>
              <b>{title}</b>
              <small>{description}</small>
            </span>
            <em>Ubah</em>
          </Link>
        ))}
      </div>
      <div className="settings-extras">
        <Link href="/dashboard/progress">Catat penimbangan baru →</Link>
        <Link href="/settings/advanced">Pustaka & pengaturan lanjutan →</Link>
        <Link href="/companion">Lihat 12 level avatar →</Link>
      </div>
      <button
        className="entry-secondary full"
        onClick={() => signOut({ callbackUrl: "/login" })}
      >
        Keluar / ganti akun
      </button>
      <p className="setup-draft-note">
        {account.offline
          ? "Salinan offline. Perubahan perlu disimpan saat tersambung."
          : "Pengaturan mengikuti akun saat login di perangkat lain."}
      </p>
    </main>
  );
}
