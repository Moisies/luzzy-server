/**
 * controllers/settingsController.ts
 * CRUD de settings del usuario (ADN + configuración general).
 */

import z from "zod";
import db from "../integrations/prisma/db.ts";
import { checkAuth, unauthorized } from "../utils/auth.ts";

const settingsSchema = z.record(z.string(), z.any());

// ─── GET /api/settings ────────────────────────────────────────────────────────

export async function getSettings(req: Request): Promise<Response> {
  let phone: string;
  try {
    phone = await checkAuth(req);
  } catch {
    return unauthorized();
  }

  try {
    const { settings } = await db.user.findUniqueOrThrow({ where: { phone } });
    return Response.json(settings ?? {});
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// ─── POST /api/settings ───────────────────────────────────────────────────────

export async function updateSettings(req: Request): Promise<Response> {
  let phone: string;
  try {
    phone = await checkAuth(req);
  } catch {
    return unauthorized();
  }

  try {
    const body = await req.json();
    const settings = settingsSchema.parse(body);
    await db.user.update({ where: { phone }, data: { settings } });
    return Response.json("OK");
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
}
