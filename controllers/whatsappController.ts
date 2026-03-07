import { checkAuth, unauthorized } from "../utils/auth.ts";
import { sessionManager } from "../whatsapp/sessionManager.ts";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function handleWhatsAppStatus(req: Request): Promise<Response> {
  let userPhone: string;
  try { userPhone = await checkAuth(req); } catch { return unauthorized(); }

  return json({
    status: sessionManager.getStatus(userPhone),
    connectedPhone: sessionManager.getConnectedPhone(userPhone),
  });
}

export async function handleWhatsAppQR(req: Request): Promise<Response> {
  let userPhone: string;
  try { userPhone = await checkAuth(req); } catch { return unauthorized(); }

  return json({ qr: sessionManager.getQRDataUrl(userPhone) });
}

export async function handleWhatsAppConnect(req: Request): Promise<Response> {
  let userPhone: string;
  try { userPhone = await checkAuth(req); } catch { return unauthorized(); }

  sessionManager.startSession(userPhone).catch((err) =>
    console.error("WA connect error:", err)
  );

  return json({ ok: true });
}

export async function handleWhatsAppDisconnect(req: Request): Promise<Response> {
  let userPhone: string;
  try { userPhone = await checkAuth(req); } catch { return unauthorized(); }

  sessionManager.stopSession(userPhone);
  return json({ ok: true });
}

export async function handleWhatsAppLogout(req: Request): Promise<Response> {
  let userPhone: string;
  try { userPhone = await checkAuth(req); } catch { return unauthorized(); }

  sessionManager.deleteSession(userPhone);
  return json({ ok: true });
}
