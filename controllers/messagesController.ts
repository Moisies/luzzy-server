/**
 * controllers/messagesController.ts
 * Controlador principal del agente IA.
 *
 * Flujo completo de un mensaje entrante:
 * 1. Autenticar el request con JWT
 * 2. Cargar el ADN del usuario desde la base de datos
 * 3. Verificar que auto_respuesta_activada === true
 * 4. Persistir el mensaje entrante en el historial
 * 5. Llamar a Gemini con el ADN + historial completo
 * 6. Si la IA detecta una cita confirmada → guardar + notificar al usuario real
 * 7. Enviar la respuesta al cliente via FCM
 */

import z from "zod";
import { checkAuth, unauthorized } from "../utils/auth.ts";
import db from "../integrations/prisma/db.ts";
import messaging from "../integrations/firebase/messaging.ts";
import { generateAgentResponse } from "../services/geminiService.ts";
import { createAppointment } from "../services/appointmentService.ts";
import { notifyAppointmentConfirmed } from "../services/notificationService.ts";
import {
  getOrCreateConversation,
  saveMessage,
} from "../services/conversationService.ts";
import type { UserADN } from "../models/types.ts";

// ─── Validación del body de entrada ──────────────────────────────────────────

const messagesSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  messages: z.array(
    z.object({
      from: z.string(),
      message: z.string(),
      timestamp: z.string(),
    })
  ).min(1),
});

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function handleMessages(req: Request): Promise<Response> {
  // 1. Autenticación JWT
  let userPhone: string;
  try {
    userPhone = await checkAuth(req);
  } catch {
    return unauthorized();
  }

  // 2. Parsear y validar el body
  let body: z.infer<typeof messagesSchema>;
  try {
    const raw = await req.json();
    body = messagesSchema.parse(raw);
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { from, to, messages } = body;

  // El token JWT debe pertenecer al destinatario del mensaje
  if (to !== userPhone) {
    return unauthorized("El token no corresponde al destinatario");
  }

  // El último mensaje debe tener contenido
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage?.message?.trim()) {
    return Response.json("No Answered");
  }

  try {
    // 3. Cargar datos del usuario: FCM token + settings (ADN)
    const user = await db.user.findUniqueOrThrow({
      where: { phone: to },
      select: { registrationToken: true, settings: true },
    });

    const adn = (user.settings as UserADN) ?? {};

    // 4. Solo responder automáticamente si el usuario lo tiene activado
    if (!adn.auto_respuesta_activada) {
      console.log(`ℹ️  Auto-respuesta desactivada para ${to}`);
      return Response.json("No Answered");
    }

    // 5. Persistir mensaje entrante en el historial
    const conversation = await getOrCreateConversation(to, from);
    await saveMessage(
      conversation.id,
      "USER",
      lastMessage.message,
      new Date(lastMessage.timestamp)
    );

    console.log(`📨 Mensaje de ${from} → ${to}: "${lastMessage.message}"`);

    // 6. Generar respuesta con Gemini + ADN
    const geminiResponse = await generateAgentResponse(adn, messages, to);

    console.log(
      `🤖 Respuesta generada [${geminiResponse.intencion}]: "${geminiResponse.mensaje}"`
    );

    // 7. Persistir respuesta del agente
    await saveMessage(conversation.id, "AGENT", geminiResponse.mensaje);

    // 8. Si se confirmó una cita, registrarla y avisar al usuario real
    if (geminiResponse.intencion === "cita_confirmada" && geminiResponse.cita) {
      const appointment = await createAppointment(to, from, geminiResponse.cita);
      console.log(`📅 Cita registrada: ${appointment.id}`);

      await notifyAppointmentConfirmed(to, from, geminiResponse.cita, appointment.id);
    }

    // 9. Enviar respuesta al cliente via FCM
    //    El formato data.to / data.message es el que espera FCMService.kt de Android
    await messaging.send({
      token: user.registrationToken,
      data: {
        to: from,                                   // A quién enviar el SMS desde el dispositivo
        message: geminiResponse.mensaje,
        timestamp: new Date().toISOString(),
      },
    });

    return Response.json("Answered");
  } catch (error) {
    console.error("❌ Error en handleMessages:", error);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
