/**
 * controllers/whatsappController.ts
 * Endpoints REST para la gestión de sesiones WhatsApp desde el dashboard.
 *
 * Todos los endpoints requieren JWT (Bearer token) para identificar al usuario.
 *
 * GET  /api/whatsapp/status     → { status, connectedPhone }
 * GET  /api/whatsapp/qr         → { qr: string | null }
 * POST /api/whatsapp/connect    → Inicia sesión (genera QR)
 * POST /api/whatsapp/disconnect → Desconecta (mantiene sesión en disco)
 * POST /api/whatsapp/logout     → Desconecta + elimina sesión (logout total)
 */

import { checkAuth, unauthorized } from "../utils/auth.ts";
import { sessionManager } from "../whatsapp/sessionManager.ts";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ─── GET /api/whatsapp/status ─────────────────────────────────────────────────

export async function handleWhatsAppStatus(req: Request): Promise<Response> {
  let userPhone: string;
  try { userPhone = await checkAuth(req); } catch { return unauthorized(); }

  return json({
    status: sessionManager.getStatus(userPhone),
    connectedPhone: sessionManager.getConnectedPhone(userPhone),
  });
}

// ─── GET /api/whatsapp/qr ─────────────────────────────────────────────────────

export async function handleWhatsAppQR(req: Request): Promise<Response> {
  let userPhone: string;
  try { userPhone = await checkAuth(req); } catch { return unauthorized(); }

  return json({ qr: sessionManager.getQR(userPhone) });
}

// ─── POST /api/whatsapp/connect ───────────────────────────────────────────────

export async function handleWhatsAppConnect(req: Request): Promise<Response> {
  let userPhone: string;
  try { userPhone = await checkAuth(req); } catch { return unauthorized(); }

  // No awaitar: la sesión genera QR de forma asíncrona, el cliente hace polling
  sessionManager.startSession(userPhone).catch((err) =>
    console.error(`❌ WA error iniciando sesión de ${userPhone}:`, err)
  );

  return json({ ok: true, message: "Sesión iniciada. Esperando QR..." });
}

// ─── POST /api/whatsapp/disconnect ────────────────────────────────────────────

export async function handleWhatsAppDisconnect(req: Request): Promise<Response> {
  let userPhone: string;
  try { userPhone = await checkAuth(req); } catch { return unauthorized(); }

  sessionManager.stopSession(userPhone);
  return json({ ok: true });
}

// ─── POST /api/whatsapp/logout ────────────────────────────────────────────────

export async function handleWhatsAppLogout(req: Request): Promise<Response> {
  let userPhone: string;
  try { userPhone = await checkAuth(req); } catch { return unauthorized(); }

  sessionManager.deleteSession(userPhone);
  return json({ ok: true });
}
