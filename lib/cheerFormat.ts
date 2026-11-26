// Pure notification & quick-message formatting helpers for "Kirim Semangat".
// Safe on both server routes and client UI (zero "use client", zero Node imports).

export type CheerKind = "say" | "remind" | "cheer";

export type CheerTemplate = {
  kind: CheerKind;
  text: string;
};

export const CHEER_KINDS: readonly {
  kind: CheerKind;
  label: string;
  emoji: string;
  placeholder: string;
}[] = [
  {
    kind: "say",
    label: "Ngomong",
    emoji: "💬",
    placeholder: "Tulis sesuatu buat dia…",
  },
  {
    kind: "remind",
    label: "Ngingetin",
    emoji: "⏰",
    placeholder: "Mau ngingetin apa hari ini?…",
  },
  {
    kind: "cheer",
    label: "Semangat",
    emoji: "💛",
    placeholder: "Kirim kata semangat buat dia…",
  },
];

export const CHEER_TEMPLATES: readonly CheerTemplate[] = [
  // Ngomong
  { kind: "say", text: "Aku lagi mikirin kamu nih ✨" },
  { kind: "say", text: "Bangga banget sama progres kamu hari ini!" },
  { kind: "say", text: "Abis makan ini jangan lupa minum air ya 💧" },
  // Ngingetin
  { kind: "remind", text: "Udah makan siang belum? Jangan skip ya!" },
  { kind: "remind", text: "Jangan lupa timbang badan hari ini ya ⚖️" },
  { kind: "remind", text: "Protein hari ini dikejar dikit lagi yuk! 💪" },
  // Semangat
  { kind: "cheer", text: "Semangat sayang! Sedikit lagi unlock level baru 🔥" },
  { kind: "cheer", text: "Peluk jauh dari aku 🤗" },
  { kind: "cheer", text: "Hari ini pasti kuat, keep going! 💛" },
];

export function normalizeCheerKind(raw: unknown): CheerKind {
  if (raw === "remind" || raw === "cheer" || raw === "say") return raw;
  return "say";
}

export function cleanCheerMessage(raw: unknown, maxLen = 180): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\s+/g, " ").trim().slice(0, maxLen);
}

export type FormattedCheerNotification = {
  kind: CheerKind;
  title: string;
  body: string;
  banner: string;
  shareText: string;
  url: string;
  tag: string;
};

export function formatCheerNotification(input: {
  senderName: string;
  kind: CheerKind | string;
  message: string;
  appUrl?: string;
}): FormattedCheerNotification {
  const kind = normalizeCheerKind(input.kind);
  const sender = (input.senderName || "").trim() || "Pasangan";
  const body = cleanCheerMessage(input.message) || "Semangat hari ini!";

  const title =
    kind === "say"
      ? `💬 ${sender} ngomong`
      : kind === "remind"
        ? `⏰ ${sender} ngingetin`
        : `💛 Semangat dari ${sender}!`;

  const banner =
    kind === "say"
      ? `💬 ${sender} ngomong: ${body}`
      : kind === "remind"
        ? `⏰ ${sender} ngingetin: ${body}`
        : `💛 Semangat dari ${sender}: ${body}`;

  const shareText = input.appUrl
    ? `${title}: "${body}"\nBuka R2 Fit: ${input.appUrl}`
    : `${title}: "${body}" — buka R2 Fit buat lihat progres berdua ✨`;

  return {
    kind,
    title,
    body,
    banner,
    shareText,
    url: "/?couple=1",
    tag: `r2fit-cheer-${kind}`,
  };
}
