/**
 * controllers/settingsController.ts
 * CRUD de settings del usuario (ADN + configuración general).
 * Cuando DATABASE_URL no apunta a Postgres, usa users-dev.json como store.
 */

import z from "zod";
import path from "path";
import fs from "fs";
import { checkAuth, unauthorized } from "../utils/auth.ts";

const USE_DB = !!Bun.env.DATABASE_URL && Bun.env.DATABASE_URL.startsWith("postgres");
const usersFile = path.join(process.cwd(), "users-dev.json");

function loadDevUsers(): Record<string, any> {
  try { return JSON.parse(fs.readFileSync(usersFile, "utf8")); } catch { return {}; }
}
function saveDevUsers(u: Record<string, any>) {
  fs.writeFileSync(usersFile, JSON.stringify(u, null, 2));
}

const settingsSchema = z.record(z.string(), z.any());

// ─── GET /api/settings ────────────────────────────────────────────────────────

export async function getSettings(req: Request): Promise<Response> {
  let phone: string;
  try { phone = await checkAuth(req); } catch { return unauthorized(); }

  try {
    if (USE_DB) {
      const db = (await import("../integrations/prisma/db.ts")).default;
      const { settings } = await db.user.findUniqueOrThrow({ where: { phone } });
      return Response.json(settings ?? {});
    } else {
      const users = loadDevUsers();
      return Response.json(users[phone]?.settings ?? {});
    }
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
  try { phone = await checkAuth(req); } catch { return unauthorized(); }

  try {
    const body = await req.json();
    const settings = settingsSchema.parse(body);

    if (USE_DB) {
      const db = (await import("../integrations/prisma/db.ts")).default;
      await db.user.update({ where: { phone }, data: { settings } });
    } else {
      const users = loadDevUsers();
      if (!users[phone]) return new Response(JSON.stringify({ error: "User not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
      users[phone].settings = settings;
      saveDevUsers(users);
    }
    return Response.json("OK");
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
}
