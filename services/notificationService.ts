/**
 * services/notificationService.ts
 * Envía notificaciones push al usuario REAL (el profesional) cuando ocurre
 * un evento importante: cita confirmada, mensaje recibido fuera de horario, etc.
 *
 * Usa Firebase Cloud Messaging (FCM) via el token registrado del dispositivo.
 */

import messaging from "../integrations/firebase/messaging.ts";
import db from "../integrations/prisma/db.ts";
import type { AppointmentDetails } from "../models/types.ts";

/**
 * Notifica al usuario real que el agente IA confirmó una cita con un cliente.
 * Se envía como push notification al dispositivo Android del profesional.
 *
 * @param userPhone   - Teléfono del profesional (usuario registrado)
 * @param clientPhone - Teléfono del cliente que agendó
 * @param details     - Detalles de la cita
 * @param appointmentId - ID de la cita en DB (para deep link)
 */
export async function notifyAppointmentConfirmed(
  userPhone: string,
  clientPhone: string,
  details: AppointmentDetails,
  appointmentId: string
): Promise<void> {
  try {
    const user = await db.user.findUnique({
      where: { phone: userPhone },
      select: { registrationToken: true },
    });

    if (!user?.registrationToken) {
      console.warn(`⚠️  Sin FCM token para usuario ${userPhone}`);
      return;
    }

    // Construir texto legible de fecha/hora
    const fechaHora =
      [details.fecha, details.hora ? `a las ${details.hora}` : null]
        .filter(Boolean)
        .join(" ") || "Fecha por confirmar";

    const titulo = "📅 ¡Nueva cita confirmada!";
    const cuerpo = `${clientPhone} → ${details.servicio} · ${fechaHora}`;

    await messaging.send({
      token: user.registrationToken,
      // Payload de datos (para que la app lo procese en background)
      data: {
        type: "APPOINTMENT_CONFIRMED",
        appointmentId,
        clientPhone,
        service: details.servicio,
        price: details.precio ?? "",
        fecha: details.fecha ?? "",
        hora: details.hora ?? "",
        location: details.lugar ?? "",
        title: titulo,
        body: cuerpo,
      },
      // Notificación visual (sistema operativo)
      notification: {
        title: titulo,
        body: cuerpo,
      },
      android: {
        priority: "high",
        notification: {
          channelId: "appointments",
          sound: "default",
        },
      },
    });

    console.log(`✅ Notificación de cita enviada a ${userPhone}: ${cuerpo}`);
  } catch (error) {
    // No fallar silenciosamente — loguear pero no bloquear el flujo principal
    console.error("❌ Error enviando notificación de cita:", error);
  }
}

/**
 * Notifica al usuario real que llegó un mensaje nuevo de un contacto.
 * Útil cuando auto_respuesta_activada = false pero igual quiero avisar.
 *
 * @param userPhone    - Teléfono del profesional
 * @param clientPhone  - Teléfono del cliente que escribió
 * @param messageText  - Texto del mensaje recibido
 */
export async function notifyNewMessage(
  userPhone: string,
  clientPhone: string,
  messageText: string
): Promise<void> {
  try {
    const user = await db.user.findUnique({
      where: { phone: userPhone },
      select: { registrationToken: true },
    });

    if (!user?.registrationToken) return;

    await messaging.send({
      token: user.registrationToken,
      data: {
        type: "NEW_MESSAGE",
        from: clientPhone,
        message: messageText.slice(0, 200), // Limitar longitud
      },
      notification: {
        title: `💬 Mensaje de ${clientPhone}`,
        body: messageText.slice(0, 100),
      },
      android: {
        priority: "high",
      },
    });
  } catch (error) {
    console.error("❌ Error enviando notificación de mensaje:", error);
  }
}
