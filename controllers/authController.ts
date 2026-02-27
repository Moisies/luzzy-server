/**
 * controllers/authController.ts
 * Registro de dispositivos y autenticación (Google Sign-In).
 */

import z from "zod";
import db from "../integrations/prisma/db.ts";
import { signToken } from "../utils/auth.ts";

// ─── POST /api/register ───────────────────────────────────────────────────────

const registerSchema = z.object({
  registrationToken: z.string().min(1),
  phone: z.string().min(1),
});

export async function handleRegister(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { registrationToken, phone } = registerSchema.parse(body);

    await db.user.upsert({
      where: { phone },
      create: { phone, registrationToken },
      update: { registrationToken },
    });

    const token = await signToken(phone);
    console.log(`✅ Dispositivo registrado: ${phone}`);
    return Response.json({ token });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// ─── POST /api/auth/google-login ─────────────────────────────────────────────

const googleLoginSchema = z.object({
  email: z.string().email(),
  deviceToken: z.string().min(1),
  displayName: z.string().optional(),
  photoUrl: z.string().optional(),
});

export async function handleGoogleLogin(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { email, deviceToken, displayName, photoUrl } =
      googleLoginSchema.parse(body);

    // Usamos el email como identificador único (en lugar del número de teléfono)
    const phone = email;
    await db.user.upsert({
      where: { phone },
      create: { phone, registrationToken: deviceToken },
      update: { registrationToken: deviceToken },
    });

    const token = await signToken(phone);
    console.log(`✅ Google login: ${email}`);
    return Response.json({
      token,
      user: {
        email,
        displayName: displayName ?? null,
        photoUrl: photoUrl ?? null,
      },
    });
  } catch (e) {
    console.error("❌ Error en Google login:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
}
