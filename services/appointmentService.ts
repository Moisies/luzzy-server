/**
 * services/appointmentService.ts
 * Lógica de negocio para gestión de citas.
 *
 * Las citas se crean automáticamente cuando el agente IA detecta
 * que el cliente confirmó una cita (intencion === "cita_confirmada").
 */

import db from "../integrations/prisma/db.ts";
import type { AppointmentDetails } from "../models/types.ts";

/**
 * Crea una cita confirmada en la base de datos.
 *
 * @param userPhone   - Teléfono del usuario registrado (el profesional)
 * @param clientPhone - Teléfono del cliente que agendó
 * @param details     - Detalles de la cita extraídos por Gemini
 */
export async function createAppointment(
  userPhone: string,
  clientPhone: string,
  details: AppointmentDetails
) {
  return await db.appointment.create({
    data: {
      userPhone,
      clientPhone,
      service: details.servicio,
      price: details.precio ?? null,
      fecha: details.fecha ?? null,
      hora: details.hora ?? null,
      location: details.lugar ?? null,
      status: "CONFIRMED",
    },
  });
}

/**
 * Devuelve todas las citas del usuario ordenadas de más reciente a más antigua.
 */
export async function getUserAppointments(userPhone: string) {
  return await db.appointment.findMany({
    where: { userPhone },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Devuelve las citas pendientes/confirmadas del usuario (sin canceladas).
 */
export async function getActiveAppointments(userPhone: string) {
  return await db.appointment.findMany({
    where: {
      userPhone,
      status: { in: ["PENDING", "CONFIRMED"] },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Busca una cita específica por ID (solo si pertenece al usuario autenticado).
 */
export async function getAppointmentById(id: string, userPhone: string) {
  return await db.appointment.findFirst({
    where: { id, userPhone },
  });
}

/**
 * Marca una cita como cancelada.
 */
export async function cancelAppointment(id: string, userPhone: string) {
  // Verificar que la cita pertenece al usuario antes de cancelar
  const appointment = await db.appointment.findFirst({
    where: { id, userPhone },
  });

  if (!appointment) {
    throw new Error("Cita no encontrada o sin permisos");
  }

  return await db.appointment.update({
    where: { id },
    data: { status: "CANCELLED" },
  });
}
