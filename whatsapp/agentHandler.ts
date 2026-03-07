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

export async function handleWhatsAppMessage(
  userPhone: string,
  contactPhone: string,
  messageText: string
): Promise<string | null> {
  let user: { registrationToken: string; settings: unknown };
  try {
    user = await db.user.findUniqueOrThrow({
      where: { phone: userPhone },
      select: { registrationToken: true, settings: true },
    });
  } catch {
    return null;
  }

  const adn = (user.settings as UserADN) ?? {};

  if (!adn.auto_respuesta_activada) {
    return null;
  }

  const conversation = await getOrCreateConversation(userPhone, contactPhone);
  await saveMessage(conversation.id, "USER", messageText);

  const history = await getConversationHistory(userPhone, contactPhone, 20);

  const messages = history.map((m) => ({
    from: m.role === "USER" ? contactPhone : userPhone,
    message: m.content,
    timestamp: m.timestamp.toISOString(),
  }));

  const geminiResponse = await generateAgentResponse(adn, messages, userPhone);

  await saveMessage(conversation.id, "AGENT", geminiResponse.mensaje);

  if (geminiResponse.intencion === "cita_confirmada" && geminiResponse.cita) {
    const appointment = await createAppointment(
      userPhone,
      contactPhone,
      geminiResponse.cita
    );
    await notifyAppointmentConfirmed(
      userPhone,
      contactPhone,
      geminiResponse.cita,
      appointment.id
    );
  }

  return geminiResponse.mensaje;
}
