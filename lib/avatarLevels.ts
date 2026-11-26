import type { Character } from "./companionProgress.ts";

export const AVATAR_VERSION = "v3";

export type AvatarTier = "pemula" | "naik_kelas" | "keren" | "legendaris";

export type TierMeta = {
  label: string;
  accent: string;
  softBg: string;
  aura: string;
};

export const TIER_META: Record<AvatarTier, TierMeta> = {
  pemula: {
    label: "Pemula",
    accent: "#64748b",
    softBg: "#f1f5f9",
    aura: "radial-gradient(circle, rgba(148,163,184,0.22) 0%, rgba(148,163,184,0) 70%)",
  },
  naik_kelas: {
    label: "Naik Kelas",
    accent: "#2563eb",
    softBg: "#eff6ff",
    aura: "radial-gradient(circle, rgba(59,130,246,0.26) 0%, rgba(250,204,21,0.08) 45%, rgba(59,130,246,0) 72%)",
  },
  keren: {
    label: "Keren",
    accent: "#db2777",
    softBg: "#fdf2f8",
    aura: "radial-gradient(circle, rgba(236,72,153,0.28) 0%, rgba(56,189,248,0.14) 48%, rgba(236,72,153,0) 74%)",
  },
  legendaris: {
    label: "Legendaris",
    accent: "#d97706",
    softBg: "#fffbeb",
    aura: "radial-gradient(circle, rgba(245,158,11,0.34) 0%, rgba(168,85,247,0.18) 48%, rgba(245,158,11,0) 76%)",
  },
};

export type AvatarLevelMeta = {
  level: number;
  title: string;
  tier: AvatarTier;
  subtitle: string;
  companion: string;
};

export const RICHIE_LEVELS: readonly AvatarLevelMeta[] = [
  {
    level: 1,
    title: "Si Baru Bangun",
    tier: "pemula",
    subtitle: "Piyama santai, kopi pagi & sandal beda sebelah",
    companion: "Kucing oren bobo",
  },
  {
    level: 2,
    title: "Anak Jalanan Santai",
    tier: "pemula",
    subtitle: "Topi terbalik, jaket streetwear & jajanan tusuk",
    companion: "Mode solo santai",
  },
  {
    level: 3,
    title: "Rookie Atlet",
    tier: "pemula",
    subtitle: "Headband merah, jaket track & tali skipping",
    companion: "Anak anjing Golden",
  },
  {
    level: 4,
    title: "Detektif Tengah Malam",
    tier: "naik_kelas",
    subtitle: "Topi fedora, trench coat & kaca pembesar emas",
    companion: "Dachshund detektif",
  },
  {
    level: 5,
    title: "Master Koki Naga",
    tier: "naik_kelas",
    subtitle: "Ikat kepala merah, jaket chef naga & wok berapi",
    companion: "Bayi panda koki",
  },
  {
    level: 6,
    title: "Bajak Laut Langit",
    tier: "naik_kelas",
    subtitle: "Bandana, kacamata penerbang & pedang cutlass",
    companion: "Beo steampunk",
  },
  {
    level: 7,
    title: "Pendekar Wuxia",
    tier: "keren",
    subtitle: "Jubah Hanfu hitam-emas, tusuk giok & pedang Jian",
    companion: "Naga giok mini",
  },
  {
    level: 8,
    title: "Panglima Viking",
    tier: "keren",
    subtitle: "Rambut kepang Norse, jubah serigala & kapak es",
    companion: "Anak serigala salju",
  },
  {
    level: 9,
    title: "Cyber Ronin 2099",
    tier: "keren",
    subtitle: "Visor holo, trench techwear & katana plasma cyan",
    companion: "Drone neon bulat",
  },
  {
    level: 10,
    title: "Archmage Bintang",
    tier: "legendaris",
    subtitle: "Halo rune emas, jubah rasi bintang & tongkat galaksi",
    companion: "Griffin bintang mini",
  },
  {
    level: 11,
    title: "Ksatria Naga Api",
    tier: "legendaris",
    subtitle: "Zirah sisik naga obsidian & pedang magma raksasa",
    companion: "Bayi naga api",
  },
  {
    level: 12,
    title: "Dewa Kosmik",
    tier: "legendaris",
    subtitle: "Mahkota melayang, cincin suci & bilah cahaya kembar",
    companion: "Naga roh galaksi",
  },
] as const;

export const RENITA_LEVELS: readonly AvatarLevelMeta[] = [
  {
    level: 1,
    title: "Si Baru Bangun",
    tier: "pemula",
    subtitle: "Cepol santai, sleep mask & sandal kelinci empuk",
    companion: "Anak Shiba bobo",
  },
  {
    level: 2,
    title: "Anak Nongkrong",
    tier: "pemula",
    subtitle: "Kuncir dua, overall denim, boba & kamera Polaroid",
    companion: "Anak bebek kuning",
  },
  {
    level: 3,
    title: "Rookie Atlet",
    tier: "pemula",
    subtitle: "Ponytail tinggi, rok tenis & skipping warna-warni",
    companion: "Pomeranian ceria",
  },
  {
    level: 4,
    title: "Detektif Misteri",
    tier: "naik_kelas",
    subtitle: "Baret burgundy, jubah kotak & jam saku emas",
    companion: "Kucing hitam berdasi",
  },
  {
    level: 5,
    title: "Master Patisserie",
    tier: "naik_kelas",
    subtitle: "Kepang mahkota, jas pastry & macaron melayang",
    companion: "Kelinci sous-chef",
  },
  {
    level: 6,
    title: "Kapten Langit",
    tier: "naik_kelas",
    subtitle: "Topi kapten berbulu, mantel emas & teropong kuningan",
    companion: "Rubah terbang berkacamata",
  },
  {
    level: 7,
    title: "Putri Pendekar",
    tier: "keren",
    subtitle: "Hanfu merah-emas, tusuk phoenix & pedang giok",
    companion: "Rubah ekor sembilan",
  },
  {
    level: 8,
    title: "Valkyrie Utara",
    tier: "keren",
    subtitle: "Kepang Nordik, perisai kayu-besi & tombak rune",
    companion: "Burung hantu salju",
  },
  {
    level: 9,
    title: "Neon Kunoichi 2099",
    tier: "keren",
    subtitle: "Headset kucing neon, techwear & belati energi pink",
    companion: "Rubah cyber holo",
  },
  {
    level: 10,
    title: "Penyihir Galaksi",
    tier: "legendaris",
    subtitle: "Tiara bulan sabit, gaun rasi bintang & buku sihir",
    companion: "Kelinci roh bulan",
  },
  {
    level: 11,
    title: "Ratu Phoenix",
    tier: "legendaris",
    subtitle: "Mahkota sayap api, zirah emas & tombak surya",
    companion: "Burung phoenix emas",
  },
  {
    level: 12,
    title: "Dewi Aurora Kosmik",
    tier: "legendaris",
    subtitle: "Sayap cahaya aurora, halo emas & tombak bintang",
    companion: "Phoenix & rubah aurora",
  },
] as const;

export function clampAvatarLevel(level: number): number {
  if (!Number.isFinite(level)) return 1;
  return Math.max(1, Math.min(12, Math.round(level)));
}

export function getAvatarLevelMeta(
  character: Character,
  level: number,
): AvatarLevelMeta {
  const clamped = clampAvatarLevel(level);
  const list = character === "renita" ? RENITA_LEVELS : RICHIE_LEVELS;
  return list[clamped - 1];
}

export function avatarImageSrc(character: Character, level: number): string {
  const clamped = clampAvatarLevel(level);
  return `/avatars/${AVATAR_VERSION}/${character}-level-${String(clamped).padStart(2, "0")}.webp`;
}

export function avatarSheetSrc(character: Character, level: number): string {
  const clamped = clampAvatarLevel(level);
  return `/avatars/v2/${character}-level-${String(clamped).padStart(2, "0")}-sheet.webp`;
}

export function avatarLivingSheetSrc(character: Character, level: number): string {
  const clamped = clampAvatarLevel(level);
  return `/avatars/v4/${character}-level-${String(clamped).padStart(2, "0")}-living.webp`;
}

export const POSE_LABELS = [
  "Santai",
  "Lompat",
  "Rebahan",
  "Squat",
  "Aksi",
] as const;

export const POSE_QUIPS: readonly (readonly string[])[] = [
  ["Siap beraksi!", "Gas hari ini ✨", "Yuk semangat!"],
  ["Woohoo!! 🔥", "Seneng banget!", "Lompat tinggi! 🚀"],
  ["Tiarap santai 😌", "Nge-chill dulu~", "Halo kamu 👀"],
  ["Squat mode! 💪", "Fokus terus 🔥", "Kuat bareng!"],
  ["Jurus andalan ⚡", "Mode Epik ✨", "Liat nih! 😎"],
] as const;
