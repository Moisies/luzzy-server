/**
 * controllers/webAuthController.ts
 * Registro e inicio de sesión vía web (email + contraseña).
 * Si DATABASE_URL no está configurada, usa un archivo JSON local (modo dev).
 */

import z from "zod";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { signToken } from "../utils/auth.ts";

const USE_DB = !!Bun.env.DATABASE_URL && Bun.env.DATABASE_URL.startsWith("postgres");

// ─── Dev store (flat JSON file) ───────────────────────────────────────────────

const usersFile = path.join(process.cwd(), "users-dev.json");

interface DevUser {
  email: string;
  displayName: string | null;
  passwordHash: string;
}

function loadDevUsers(): Record<string, DevUser> {
  try { return JSON.parse(fs.readFileSync(usersFile, "utf8")); } catch { return {}; }
}
function saveDevUsers(u: Record<string, DevUser>) {
  fs.writeFileSync(usersFile, JSON.stringify(u, null, 2));
}

// Usa scrypt igual que el preview server, para compatibilidad con hashes existentes
function hashDevPassword(pw: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(pw, salt, 64).toString("hex");
  return salt + ":" + hash;
}
function verifyDevPassword(pw: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  const attempt = crypto.scryptSync(pw, salt, 64).toString("hex");
  return attempt === hash;
}

// ─── POST /api/auth/web-register ──────────────────────────────────────────────

const webRegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  displayName: z.string().optional(),
});

export async function handleWebRegister(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { email, password, displayName } = webRegisterSchema.parse(body);
    if (USE_DB) {
      const passwordHash = await Bun.password.hash(password);
      const db = (await import("../integrations/prisma/db.ts")).default;
      const existing = await db.user.findUnique({ where: { phone: email } });
      if (existing) {
        return Response.json({ error: "Email already registered" }, { status: 409 });
      }
      await db.user.create({
        data: { phone: email, registrationToken: crypto.randomUUID(), passwordHash, displayName: displayName ?? null },
      });
    } else {
      const users = loadDevUsers();
      if (users[email]) {
        return Response.json({ error: "Email already registered" }, { status: 409 });
      }
      users[email] = { email, displayName: displayName ?? null, passwordHash: hashDevPassword(password) };
      saveDevUsers(users);
    }

    const token = await signToken(email);
    console.log(`Web register: ${email}`);
    return Response.json({ token, user: { email, displayName: displayName ?? null } });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}

// ─── POST /api/auth/web-login ─────────────────────────────────────────────────

const webLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function handleWebLogin(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { email, password } = webLoginSchema.parse(body);

    let storedHash: string | null = null;
    let displayName: string | null = null;

    if (USE_DB) {
      const db = (await import("../integrations/prisma/db.ts")).default;
      const user = await db.user.findUnique({ where: { phone: email } });
      if (!user || !user.passwordHash) {
        return Response.json({ error: "Invalid email or password" }, { status: 401 });
      }
      storedHash = user.passwordHash;
      displayName = user.displayName ?? null;
    } else {
      const users = loadDevUsers();
      const user = users[email];
      if (!user) {
        return Response.json({ error: "Invalid email or password" }, { status: 401 });
      }
      storedHash = user.passwordHash;
      displayName = user.displayName ?? null;
    }

    const valid = USE_DB
      ? await Bun.password.verify(password, storedHash!)
      : verifyDevPassword(password, storedHash!);
    if (!valid) {
      return Response.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const token = await signToken(email);
    console.log(`Web login: ${email}`);
    return Response.json({ token, user: { email, displayName } });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
