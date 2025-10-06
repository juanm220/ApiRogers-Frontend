// api/ping-backend.js
export default async function handler(req, res) {
  try {
    const target = "https://TU-BACKEND.onrender.com/health";
    const r = await fetch(target, { method: "GET", cache: "no-store" });
    const data = await r.json().catch(() => ({}));
    return res.status(200).json({ ok: true, upstream: data });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e) });
  }
}