/**
 * whatsapp/agentHandler.ts
 *
 * Pipeline del agente IA para WhatsApp — idéntico al SMS agent pero adaptado:
 * - No usa FCM para enviar: Baileys envía la respuesta directamente.
 * - El historial se carga desde DB (no viene en el request como en SMS).
 * - Usa los mismos servicios: Gemini, Conversation, Appointment, Notification.
 */

import db from "../integrations/prisma/db.ts";
import { generateAgentResponse } from "../services/geminiService.ts";
import { createAppointment } from "../services/appointmentService.ts";
import { notifyAppointmentConfirmed } from "../services/notificationService.ts";
import {
  getOrCreateConversation,
  saveMessage,
  getConversationHistory,
} from "../services/conversationService.ts";
import type { UserADN } from "../models/types.ts";

/**
 * Procesa un mensaje de WhatsApp entrante y devuelve el texto de respuesta.
 *
 * @param userPhone    - Teléfono del profesional (dueño de la sesión WA)
 * @param contactPhone - Teléfono del cliente que escribió
 * @param messageText  - Texto del mensaje recibido
 * @returns Texto de respuesta generado por la IA, o null si no se debe responder
 */
export async function handleWhatsAppMessage(
  userPhone: string,
  contactPhone: string,
  messageText: string
): Promise<string | null> {
  // 1. Cargar usuario y ADN desde DB
  let user: { registrationToken: string; settings: unknown };
  try {
    user = await db.user.findUniqueOrThrow({
      where: { phone: userPhone },
      select: { registrationToken: true, settings: true },
    });
  } catch {
    console.warn(`⚠️  WA: usuario ${userPhone} no encontrado en DB`);
    return null;
  }

  const adn = (user.settings as UserADN) ?? {};

  // 2. Verificar auto-respuesta activada
  if (!adn.auto_respuesta_activada) {
    console.log(`ℹ️  WA: auto-respuesta desactivada para ${userPhone}`);
    return null;
  }

  // 3. Persistir mensaje entrante
  const conversation = await getOrCreateConversation(userPhone, contactPhone);
  await saveMessage(conversation.id, "USER", messageText);

  console.log(`📨 WA ${contactPhone} → ${userPhone}: "${messageText}"`);

  // 4. Cargar historial de conversación para contexto de Gemini
  const history = await getConversationHistory(userPhone, contactPhone, 20);

  // Convertir al formato IncomingMessage que espera generateAgentResponse
  const messages = history.map((m) => ({
    from: m.role === "USER" ? contactPhone : userPhone,
    message: m.content,
    timestamp: m.timestamp.toISOString(),
  }));

  // 5. Generar respuesta con Gemini + ADN
  const geminiResponse = await generateAgentResponse(adn, messages, userPhone);

  console.log(
    `🤖 WA respuesta [${geminiResponse.intencion}]: "${geminiResponse.mensaje}"`
  );

  // 6. Persistir respuesta del agente
  await saveMessage(conversation.id, "AGENT", geminiResponse.mensaje);

  // 7. Si hay cita confirmada → guardar en DB + notificar al profesional por FCM
  if (geminiResponse.intencion === "cita_confirmada" && geminiResponse.cita) {
    const appointment = await createAppointment(
      userPhone,
      contactPhone,
      geminiResponse.cita
    );
    console.log(`📅 WA cita registrada: ${appointment.id}`);
    await notifyAppointmentConfirmed(
      userPhone,
      contactPhone,
      geminiResponse.cita,
      appointment.id
    );
  }

  return geminiResponse.mensaje;
}
