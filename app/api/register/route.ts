export async function POST() {
  return Response.json({ error: "Pendaftaran ditutup. Pilih akun Richie atau Renita." }, { status: 403 });
}
