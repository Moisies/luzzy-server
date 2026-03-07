/**
 * controllers/webAuthController.ts
 * Registro e inicio de sesión vía web (email + contraseña).
 */

import z from "zod";
import db from "../integrations/prisma/db.ts";
import { signToken } from "../utils/auth.ts";

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

    const existing = await db.user.findUnique({ where: { phone: email } });
    if (existing) {
      return Response.json({ error: "Email already registered" }, { status: 409 });
    }

    const passwordHash = await Bun.password.hash(password);
    // Para usuarios web usamos el email como phone y un token aleatorio
    const registrationToken = crypto.randomUUID();

    await db.user.create({
      data: {
        phone: email,
        registrationToken,
        passwordHash,
        displayName: displayName ?? null,
      },
    });

    const token = await signToken(email);
    console.log(`✅ Web register: ${email}`);
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

    const user = await db.user.findUnique({ where: { phone: email } });
    if (!user || !user.passwordHash) {
      return Response.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const valid = await Bun.password.verify(password, user.passwordHash);
    if (!valid) {
      return Response.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const token = await signToken(email);
    console.log(`✅ Web login: ${email}`);
    return Response.json({
      token,
      user: { email, displayName: user.displayName ?? null },
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
