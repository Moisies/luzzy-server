/**
 * services/conversationService.ts
 * Gestión del historial de conversaciones en base de datos.
 *
 * Persiste los mensajes para:
 * - Auditoría y analytics
 * - Recuperar contexto en conversaciones largas (futuro)
 */

import db from "../integrations/prisma/db.ts";

/**
 * Obtiene una conversación existente o crea una nueva.
 * Clave única: (userPhone, contactPhone).
 */
export async function getOrCreateConversation(
  userPhone: string,
  contactPhone: string
) {
  let conversation = await db.conversation.findFirst({
    where: { userPhone, contactPhone },
  });

  if (!conversation) {
    conversation = await db.conversation.create({
      data: { userPhone, contactPhone },
    });
    console.log(`🗨️  Nueva conversación creada: ${userPhone} ↔ ${contactPhone}`);
  }

  return conversation;
}

/**
 * Guarda un mensaje en el historial de la conversación.
 *
 * @param conversationId - ID de la conversación
 * @param role           - "USER" (cliente) o "AGENT" (respuesta del agente IA)
 * @param content        - Texto del mensaje
 * @param timestamp      - Timestamp del mensaje (opcional, default: ahora)
 */
export async function saveMessage(
  conversationId: string,
  role: "USER" | "AGENT",
  content: string,
  timestamp?: Date
) {
  return await db.conversationMessage.create({
    data: {
      conversationId,
      role,
      content,
      timestamp: timestamp ?? new Date(),
    },
  });
}

/**
 * Recupera el historial reciente de una conversación.
 *
 * @param userPhone    - Teléfono del usuario registrado
 * @param contactPhone - Teléfono del contacto
 * @param limit        - Número máximo de mensajes a devolver (default: 30)
 */
export async function getConversationHistory(
  userPhone: string,
  contactPhone: string,
  limit = 30
) {
  const conversation = await db.conversation.findFirst({
    where: { userPhone, contactPhone },
    include: {
      messages: {
        orderBy: { timestamp: "asc" },
        take: limit,
      },
    },
  });

  return conversation?.messages ?? [];
}
