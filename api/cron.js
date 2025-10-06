// api/cron.js
export default async function handler(req, res) {
  // 1) Autorización del cron de Vercel
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end('Unauthorized');
  }

  // 2) URL de tu backend (Render)
  const base = process.env.BACKEND_BASE_URL; // ej: https://apirogers-backend.onrender.com
  if (!base) {
    return res.status(500).json({ ok: false, error: 'BACKEND_BASE_URL missing' });
  }

  try {
    // 3) ¿Está activo el keepalive?
    const rStatus = await fetch(`${base}/api/keepalive/status`, {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      cache: 'no-store',
    });
    const status = await rStatus.json().catch(() => null);

    if (!status?.enabled) {
      return res.status(200).json({ ok: true, skipped: true, reason: 'disabled' });
    }

    // 4) Registra el ping (para "último ping" en UI)
    const rPing = await fetch(`${base}/api/keepalive/cron-ping`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      cache: 'no-store',
    });
    const pingData = await rPing.json().catch(() => ({}));

    // 5) Calienta el backend
    const warm = await fetch(`${base}/health`, { cache: 'no-store' });
    const text = await warm.text().catch(() => '');

    return res.status(200).json({
      ok: true,
      pinged: true,
      statusCode: warm.status,
      preview: text.slice(0, 160),
      remainingMinutes: status?.remainingMinutes ?? pingData?.remainingMinutes,
      lastPingIso: pingData?.lastPingIso ?? null,
      when: new Date().toISOString(),
    });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e) });
  }
}
