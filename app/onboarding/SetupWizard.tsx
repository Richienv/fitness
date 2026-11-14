"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  newSetupDraft,
  validateSetupStep,
  setupTargets,
  PERSON,
  type SetupDraft,
} from "@/lib/setup";
import { getSettings } from "@/lib/settings";
import { scopedKey } from "@/lib/userScope";
import { todayKey } from "@/lib/targets";
import { useAccountSetup } from "../SetupProvider";
const titles = [
  "Kenalan dengan\ntubuhmu.",
  "Targetnya,\nkita sepakati.",
  "Sesuaikan dengan\nhari-harimu.",
  "Makan yang\ncocok buatmu.",
  "Sudah sesuai?",
];
const labels = ["Tubuh", "Target", "Rutinitas", "Makan", "Konfirmasi"];
const weekdays = [
  { n: 1, s: "Sen" },
  { n: 2, s: "Sel" },
  { n: 3, s: "Rab" },
  { n: 4, s: "Kam" },
  { n: 5, s: "Jum" },
  { n: 6, s: "Sab" },
  { n: 0, s: "Min" },
];
const activities = [
  { n: "1.2", title: "Banyak duduk", detail: "Aktivitas harian sedikit" },
  {
    n: "1.375",
    title: "Cukup bergerak",
    detail: "Jalan kaki dan aktivitas ringan",
  },
  { n: "1.55", title: "Aktif", detail: "Sering bergerak dan latihan" },
  {
    n: "1.725",
    title: "Sangat aktif",
    detail: "Kerja fisik atau aktivitas tinggi",
  },
];
export default function SetupWizard() {
  const account = useAccountSetup(),
    router = useRouter();
  const [draft, setDraft] = useState<SetupDraft | null>(null),
    [step, setStep] = useState(0),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [confirmed, setConfirmed] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null),
    initialized = useRef(false);
  useEffect(() => {
    if (!account || initialized.current) return;
    initialized.current = true;
    const params = new URLSearchParams(window.location.search),
      edit = params.get("edit");
    let d = account.setup?.draft
      ? { ...account.setup.draft }
      : newSetupDraft(account.person, todayKey());
    if (!account.setup) {
      const p = getSettings().profile,
        m = account.latest;
      d = {
        ...d,
        age: p.age ? String(p.age) : "",
        height: p.heightCm ? String(p.heightCm) : "",
        weight: m?.weightKg ? String(m.weightKg) : "",
        measurementDate: m?.date || d.measurementDate,
      };
    }
    try {
      const saved = JSON.parse(
        localStorage.getItem(scopedKey("r2.setupDraft.v1")) || "null",
      );
      if (saved && saved.base === (account.setup?.updatedAt ?? null)) {
        d = { ...d, ...saved.draft };
        if (!edit) setStep(Math.min(4, Math.max(0, saved.step || 0)));
      }
    } catch {}
    if (edit)
      setStep(Math.max(0, ["body", "target", "routine", "food"].indexOf(edit)));
    setDraft(d);
  }, [account]);
  useEffect(() => {
    if (draft && account) {
      try {
        localStorage.setItem(
          scopedKey("r2.setupDraft.v1"),
          JSON.stringify({
            draft,
            step,
            base: account.setup?.updatedAt ?? null,
          }),
        );
      } catch {}
    }
  }, [draft, step, account]);
  function update<K extends keyof SetupDraft>(key: K, value: SetupDraft[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
    setError("");
    setConfirmed(false);
  }
  function move(n: number) {
    setStep(n);
    setError("");
    window.scrollTo({ top: 0, behavior: "instant" });
    requestAnimationFrame(() => heading.current?.focus());
  }
  async function next(e: FormEvent) {
    e.preventDefault();
    if (!draft || !account || saving) return;
    const problem = validateSetupStep(draft, step, todayKey());
    if (problem) {
      setError(problem);
      return;
    }
    if (step < 4) {
      move(step + 1);
      return;
    }
    for (let i = 0; i < 4; i++) {
      const problem = validateSetupStep(draft, i, todayKey());
      if (problem) {
        move(i);
        setError(problem);
        return;
      }
    }
    if (!confirmed) {
      setError("Konfirmasi dulu bahwa data ini milikmu dan sudah sesuai.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const r = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error || "Belum tersimpan.");
      account.accept(result.setup);
      localStorage.removeItem(scopedKey("r2.setupDraft.v1"));
      router.replace(account.setup ? "/settings" : "/");
      router.refresh();
    } catch (e) {
      setError((e as Error).message || "Koneksi terputus. Coba simpan lagi.");
      setSaving(false);
    }
  }
  if (!account || !draft)
    return <main className="entry-loading">Menyiapkan form…</main>;
  const field = (
    key: keyof SetupDraft,
    label: string,
    unit: string,
    min: number,
    max: number,
    increment = "0.1",
  ) => (
    <label className="setup-field" key={key}>
      <span>{label}</span>
      <div>
        <input
          aria-label={label}
          type="number"
          inputMode={increment === "1" ? "numeric" : "decimal"}
          value={String(draft[key])}
          onChange={(e) => update(key, e.target.value as never)}
          min={min}
          max={max}
          step={increment}
        />
        <em>{unit}</em>
      </div>
    </label>
  );
  let targets: ReturnType<typeof setupTargets> | null = null;
  if (
    !validateSetupStep(draft, 0, todayKey()) &&
    !validateSetupStep(draft, 2, todayKey())
  )
    targets = setupTargets(draft);
  return (
    <main className={`setup-shell ${account.person}`}>
      <header className="setup-header">
        <Link
          href={account.setup ? "/settings" : "/welcome"}
          className="entry-back"
          aria-label="Kembali"
        >
          ←
        </Link>
        <span>Data {PERSON[account.person].name}</span>
        <button
          className="entry-link"
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          Ganti akun
        </button>
      </header>
      <div className="setup-steps" aria-label={`Langkah ${step + 1} dari 5`}>
        {labels.map((l, i) => (
          <span key={l} className={i <= step ? "filled" : ""} />
        ))}
      </div>
      <p className="setup-overline">
        {String(step + 1).padStart(2, "0")} / 05 · {labels[step]}
      </p>
      <h1 ref={heading} tabIndex={-1}>
        {titles[step]}
      </h1>
      <form onSubmit={next} noValidate className="setup-form">
        {step === 0 && (
          <>
            <p className="setup-note">
              Gunakan angka timbangan dan ukuran tubuhmu sendiri.
            </p>
            <div className="setup-segment" aria-label="Profil tubuh">
              {(["male", "female"] as const).map((s) => (
                <button
                  type="button"
                  key={s}
                  aria-pressed={draft.sex === s}
                  onClick={() => update("sex", s)}
                >
                  {s === "male" ? "Pria" : "Wanita"}
                </button>
              ))}
            </div>
            <div className="setup-two">
              {field("age", "Usia", "tahun", 18, 100, "1")}
              {field("height", "Tinggi badan", "cm", 100, 230)}
            </div>
            {field("weight", "Berat dari timbangan", "kg", 25, 350)}
            <label className="setup-field">
              <span>Tanggal penimbangan</span>
              <input
                aria-label="Tanggal penimbangan"
                type="date"
                value={draft.measurementDate}
                max={todayKey()}
                min="2020-01-01"
                onChange={(e) => update("measurementDate", e.target.value)}
              />
            </label>
          </>
        )}
        {step === 1 && (
          <>
            <div className="setup-two">
              {field("target", "Target berat", "kg", 25, 350)}
              <label className="setup-field">
                <span>Tanggal target</span>
                <input
                  aria-label="Tanggal target"
                  type="date"
                  value={draft.deadline}
                  onChange={(e) => update("deadline", e.target.value)}
                />
              </label>
            </div>
            <label className="setup-field">
              <span>Fokus</span>
              <select
                aria-label="Fokus"
                value={draft.goal}
                onChange={(e) =>
                  update("goal", e.target.value as SetupDraft["goal"])
                }
              >
                <option value="recomp">Lebih kuat, lebih lean</option>
                <option value="fat_loss">Turun lemak</option>
                <option value="muscle_gain">Tambah otot</option>
                <option value="maintain">Pertahankan kondisi</option>
              </select>
            </label>
            <p className="setup-note">
              Tanggal ini adalah target pribadi. Progres mengikuti catatan
              nyata.
            </p>
            <fieldset className="setup-choice">
              <legend>Sudah ukur lingkar tubuh?</legend>
              <div className="setup-segment">
                <button
                  type="button"
                  aria-pressed={draft.bodyMeasured === "yes"}
                  onClick={() => update("bodyMeasured", "yes")}
                >
                  Sudah
                </button>
                <button
                  type="button"
                  aria-pressed={draft.bodyMeasured === "later"}
                  onClick={() => update("bodyMeasured", "later")}
                >
                  Belum diukur
                </button>
              </div>
            </fieldset>
            {draft.bodyMeasured === "yes" && (
              <>
                {field("waist", "Lingkar pinggang", "cm", 30, 250)}
                <div className="setup-two">
                  {field("hip", "Pinggul (opsional)", "cm", 30, 250)}
                  {field("shoulder", "Bahu (opsional)", "cm", 30, 250)}
                </div>
              </>
            )}
            {draft.bodyMeasured === "later" && (
              <p className="setup-note">
                Disimpan sebagai belum diukur. Bisa dilengkapi di Settings.
              </p>
            )}
          </>
        )}
        {step === 2 && (
          <>
            <fieldset className="setup-choice">
              <legend>Aktivitas harian</legend>
              <div className="setup-options">
                {activities.map((a) => (
                  <button
                    type="button"
                    key={a.n}
                    aria-pressed={draft.activity === a.n}
                    onClick={() => update("activity", a.n)}
                  >
                    <strong>{a.title}</strong>
                    <small>{a.detail}</small>
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className="setup-choice">
              <legend>Hari latihan yang realistis</legend>
              <div className="setup-week">
                {weekdays.map((d) => (
                  <button
                    type="button"
                    key={d.n}
                    aria-pressed={draft.trainingDays.includes(d.n)}
                    onClick={() =>
                      update(
                        "trainingDays",
                        draft.trainingDays.includes(d.n)
                          ? draft.trainingDays.filter((n) => n !== d.n)
                          : [...draft.trainingDays, d.n],
                      )
                    }
                  >
                    {d.s}
                  </button>
                ))}
              </div>
              <p className="setup-note">
                {draft.trainingDays.length
                  ? `${draft.trainingDays.length} hari per minggu. Hari lain untuk istirahat.`
                  : "Belum rutin? Biarkan kosong, lalu atur nanti."}
              </p>
            </fieldset>
            {field("sleep", "Target tidur", "jam", 4, 12, "0.5")}
          </>
        )}
        {step === 3 && (
          <>
            <label className="setup-field">
              <span>Preferensi makan</span>
              <select
                aria-label="Preferensi makan"
                value={draft.foodStyle}
                onChange={(e) => update("foodStyle", e.target.value)}
              >
                <option value="" disabled>
                  Pilih preferensi
                </option>
                <option value="bebas">Tidak ada batasan khusus</option>
                <option value="halal">Halal</option>
                <option value="vegetarian">Vegetarian</option>
                <option value="pescatarian">Pescatarian</option>
              </select>
            </label>
            <fieldset className="setup-choice">
              <legend>Alergi atau pantangan?</legend>
              <div className="setup-segment">
                <button
                  type="button"
                  aria-pressed={draft.allergyMode === "none"}
                  onClick={() => update("allergyMode", "none")}
                >
                  Tidak ada
                </button>
                <button
                  type="button"
                  aria-pressed={draft.allergyMode === "list"}
                  onClick={() => update("allergyMode", "list")}
                >
                  Ada
                </button>
              </div>
            </fieldset>
            {draft.allergyMode === "list" && (
              <label className="setup-field">
                <span>Alergi / pantangan</span>
                <textarea
                  aria-label="Alergi atau pantangan"
                  maxLength={500}
                  value={draft.allergies}
                  onChange={(e) => update("allergies", e.target.value)}
                  placeholder="Contoh: kacang, udang…"
                />
              </label>
            )}
            <fieldset className="setup-choice">
              <legend>Target makan</legend>
              <div className="setup-segment">
                <button
                  type="button"
                  aria-pressed={draft.nutritionMode === "estimate"}
                  onClick={() => update("nutritionMode", "estimate")}
                >
                  Estimasi dari profil
                </button>
                <button
                  type="button"
                  aria-pressed={draft.nutritionMode === "manual"}
                  onClick={() => {
                    if (targets)
                      setDraft({
                        ...draft,
                        nutritionMode: "manual",
                        gymKcal: String(targets.gymDay.kcal),
                        restKcal: String(targets.restDay.kcal),
                        protein: String(targets.gymDay.protein),
                      });
                  }}
                >
                  Isi sendiri
                </button>
              </div>
            </fieldset>
            {draft.nutritionMode === "manual" ? (
              <>
                <div className="setup-two">
                  {field(
                    "gymKcal",
                    "Kalori hari latihan",
                    "kcal",
                    1000,
                    6000,
                    "1",
                  )}
                  {field(
                    "restKcal",
                    "Kalori hari istirahat",
                    "kcal",
                    1000,
                    6000,
                    "1",
                  )}
                </div>
                {field("protein", "Protein harian", "g", 20, 350, "1")}
              </>
            ) : (
              targets && (
                <div className="setup-nutrition">
                  <span>
                    Latihan
                    <strong>
                      {targets.gymDay.kcal}
                      <small> kcal</small>
                    </strong>
                  </span>
                  <span>
                    Istirahat
                    <strong>
                      {targets.restDay.kcal}
                      <small> kcal</small>
                    </strong>
                  </span>
                  <span>
                    Protein
                    <strong>
                      {targets.gymDay.protein}
                      <small> g</small>
                    </strong>
                  </span>
                </div>
              )
            )}
            <p className="setup-note">
              Estimasi awal dari profil, belum hasil kalibrasi metabolisme.
              Preferensi dan alergi menjadi catatan, bukan jaminan hasil
              scanner.
            </p>
          </>
        )}
        {step === 4 && (
          <>
            <div className="setup-review-avatar">
              <img
                src={`/avatars/v2/${account.person}-level-01-poster.webp`}
                width="90"
                height="120"
                alt=""
              />
              <div>
                <span>{PERSON[account.person].name}</span>
                <strong>
                  {draft.weight} → {draft.target}
                  <small> kg</small>
                </strong>
                <p>Target {draft.deadline.split("-").reverse().join(" / ")}</p>
              </div>
            </div>
            <div className="setup-review-list">
              {[
                [
                  "Tubuh",
                  `${draft.age} tahun · ${draft.height} cm · ditimbang ${draft.measurementDate}`,
                  0,
                ],
                [
                  "Target",
                  `${draft.target} kg · ${draft.goal === "recomp" ? "lebih kuat, lebih lean" : draft.goal.replaceAll("_", " ")}${draft.bodyMeasured === "yes" ? ` · pinggang ${draft.waist} cm` : " · lingkar tubuh belum diukur"}`,
                  1,
                ],
                [
                  "Rutinitas",
                  `${draft.trainingDays.length} hari latihan · tidur ${draft.sleep} jam`,
                  2,
                ],
                [
                  "Makan",
                  `${draft.foodStyle} · ${draft.allergyMode === "list" ? draft.allergies : "tanpa alergi/pantangan"}`,
                  3,
                ],
              ].map(([label, desc, index]) => (
                <button
                  type="button"
                  key={label}
                  onClick={() => move(Number(index))}
                >
                  <span>
                    <b>{label}</b>
                    <small>{desc}</small>
                  </span>
                  <em>Ubah</em>
                </button>
              ))}
            </div>
            <label className="setup-confirm">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              <span>
                Data ini milik {PERSON[account.person].name}. Angka berat dan
                ukuran yang diisi berasal dari pengukuran sendiri.
              </span>
            </label>
          </>
        )}
        {error && (
          <p className="entry-error" role="alert">
            {error}
          </p>
        )}
        <footer className="setup-actions">
          {step > 0 && (
            <button
              type="button"
              className="entry-secondary"
              disabled={saving}
              onClick={() => move(step - 1)}
            >
              Kembali
            </button>
          )}
          <button
            className="entry-primary"
            disabled={saving || (step === 4 && !confirmed)}
          >
            {saving ? "Menyimpan…" : step === 4 ? "Simpan & lanjut" : "Lanjut"}
            <span aria-hidden="true">→</span>
          </button>
        </footer>
        <p className="setup-draft-note">
          {account.offline
            ? "Sedang offline. Perlu koneksi untuk menyimpan ke akun."
            : "Draft tersimpan di perangkat ini. Final disimpan ke akun setelah konfirmasi."}
        </p>
      </form>
    </main>
  );
}
