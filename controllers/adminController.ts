/**
 * controllers/adminController.ts
 * Panel de administración — estadísticas, CRUD de usuarios.
 * Protegido por ADMIN_SECRET (header X-Admin-Key).
 */

import path from "path";
import fs from "fs";
import crypto from "crypto";
import { sessionManager } from "../whatsapp/sessionManager.ts";

const ADMIN_SECRET = Bun.env.ADMIN_SECRET ?? "admin-dev-secret";
const usersFile = path.join(process.cwd(), "users-dev.json");

function checkAdmin(req: Request): boolean {
  const key = req.headers.get("x-admin-key");
  return key === ADMIN_SECRET;
}

function forbidden(): Response {
  return Response.json({ error: "Forbidden" }, { status: 403 });
}

function loadUsers(): Record<string, any> {
  try { return JSON.parse(fs.readFileSync(usersFile, "utf8")); } catch { return {}; }
}
function saveUsers(u: Record<string, any>) {
  fs.writeFileSync(usersFile, JSON.stringify(u, null, 2));
}

function safeUser(u: any) {
  const { passwordHash, ...rest } = u;
  return rest;
}

// ─── GET /api/admin/stats ─────────────────────────────────────────────────────

export async function handleAdminStats(req: Request): Promise<Response> {
  if (!checkAdmin(req)) return forbidden();

  const users = loadUsers();
  const list  = Object.values(users);

  const totalUsers    = list.length;
  const autoRespOn    = list.filter((u: any) => u.settings?.auto_respuesta_activada).length;
  const totalMessages = list.reduce((s: number, u: any) => s + (u.stats?.messages_total ?? 0), 0);
  const totalTokens   = list.reduce((s: number, u: any) => s + (u.stats?.tokens_total  ?? 0), 0);

  // Active WA sessions (connected only)
  let waConnected = 0;
  for (const u of list) {
    if (sessionManager.getStatus(u.email) === "connected") waConnected++;
  }

  return Response.json({
    totalUsers,
    autoRespOn,
    waConnected,
    totalMessages,
    totalTokens,
    uptime: Math.floor(process.uptime()),
  });
}

// ─── GET /api/admin/users ─────────────────────────────────────────────────────

export async function handleAdminListUsers(req: Request): Promise<Response> {
  if (!checkAdmin(req)) return forbidden();

  const users = loadUsers();
  const list = Object.values(users).map((u: any) => ({
    ...safeUser(u),
    waStatus: sessionManager.getStatus(u.email),
  }));

  return Response.json(list);
}

// ─── POST /api/admin/users ────────────────────────────────────────────────────

export async function handleAdminCreateUser(req: Request): Promise<Response> {
  if (!checkAdmin(req)) return forbidden();

  try {
    const { email, password, displayName } = await req.json();
    if (!email || !password) return Response.json({ error: "email and password required" }, { status: 400 });

    const users = loadUsers();
    if (users[email]) return Response.json({ error: "User already exists" }, { status: 409 });

    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(password, salt, 64).toString("hex");

    users[email] = {
      email,
      displayName: displayName ?? null,
      passwordHash: salt + ":" + hash,
      settings: {},
      stats: { messages_total: 0, tokens_total: 0, last_active: null },
    };
    saveUsers(users);

    return Response.json(safeUser(users[email]), { status: 201 });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}

// ─── PATCH /api/admin/users/:email ───────────────────────────────────────────

export async function handleAdminUpdateUser(req: Request, email: string): Promise<Response> {
  if (!checkAdmin(req)) return forbidden();

  try {
    const users = loadUsers();
    const decoded = decodeURIComponent(email);
    if (!users[decoded]) return Response.json({ error: "User not found" }, { status: 404 });

    const body = await req.json();

    if (body.displayName !== undefined) users[decoded].displayName = body.displayName;
    if (body.settings   !== undefined) users[decoded].settings    = body.settings;
    if (body.password) {
      const salt = crypto.randomBytes(16).toString("hex");
      const hash = crypto.scryptSync(body.password, salt, 64).toString("hex");
      users[decoded].passwordHash = salt + ":" + hash;
    }

    saveUsers(users);
    return Response.json(safeUser(users[decoded]));
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}

// ─── DELETE /api/admin/users/:email ──────────────────────────────────────────

export async function handleAdminDeleteUser(req: Request, email: string): Promise<Response> {
  if (!checkAdmin(req)) return forbidden();

  const users = loadUsers();
  const decoded = decodeURIComponent(email);
  if (!users[decoded]) return Response.json({ error: "User not found" }, { status: 404 });

  sessionManager.deleteSession(decoded);
  delete users[decoded];
  saveUsers(users);

  return Response.json({ ok: true });
}
