/**
 * controllers/appointmentsController.ts
 * Endpoints REST para consultar y gestionar citas agendadas por el agente IA.
 *
 * GET  /api/appointments        → Lista todas las citas del usuario
 * GET  /api/appointments/active → Solo citas activas (sin canceladas)
 * DELETE /api/appointments/:id  → Cancela una cita
 */

import { checkAuth, unauthorized } from "../utils/auth.ts";
import {
  getUserAppointments,
  getActiveAppointments,
  cancelAppointment,
} from "../services/appointmentService.ts";

// ─── GET /api/appointments ────────────────────────────────────────────────────

export async function listAppointments(req: Request): Promise<Response> {
  let phone: string;
  try {
    phone = await checkAuth(req);
  } catch {
    return unauthorized();
  }

  try {
    const url = new URL(req.url);
    const onlyActive = url.searchParams.get("active") === "true";

    const appointments = onlyActive
      ? await getActiveAppointments(phone)
      : await getUserAppointments(phone);

    return Response.json(appointments);
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// ─── DELETE /api/appointments/:id ─────────────────────────────────────────────

export async function handleDeleteAppointment(
  req: Request,
  id: string
): Promise<Response> {
  let phone: string;
  try {
    phone = await checkAuth(req);
  } catch {
    return unauthorized();
  }

  try {
    await cancelAppointment(id, phone);
    return Response.json("OK");
  } catch (e) {
    const message = (e as Error).message;
    const status = message.includes("no encontrada") ? 404 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
}
