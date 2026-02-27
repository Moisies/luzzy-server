/**
 * index.ts — Luzzy AI Agent Server
 *
 * Servidor Bun que actúa como agente de IA para responder mensajes SMS
 * en nombre del usuario real, usando Google Gemini + el ADN del usuario.
 *
 * Endpoints:
 *   POST   /api/register            → Registrar dispositivo Android
 *   POST   /api/auth/google-login   → Login con Google
 *   POST   /api/messages            → Procesar mensaje entrante (agente IA)
 *   GET    /api/settings            → Obtener configuración/ADN
 *   POST   /api/settings            → Actualizar configuración/ADN
 *   GET    /api/appointments        → Listar citas agendadas por el agente
 *   DELETE /api/appointments/:id    → Cancelar una cita
 */

import { serve } from "bun";
import { handleRegister, handleGoogleLogin } from "./controllers/authController.ts";
import { handleMessages } from "./controllers/messagesController.ts";
import { getSettings, updateSettings } from "./controllers/settingsController.ts";
import {
  listAppointments,
  handleDeleteAppointment,
} from "./controllers/appointmentsController.ts";
import { env } from "./config/env.ts";

// ─── Servidor ─────────────────────────────────────────────────────────────────

const server = serve({
  port: env.PORT,

  routes: {
    // Autenticación y registro de dispositivo
    "/api/register": {
      POST: handleRegister,
    },
    "/api/auth/google-login": {
      POST: handleGoogleLogin,
    },

    // Agente IA — procesamiento de mensajes SMS entrantes
    "/api/messages": {
      POST: handleMessages,
    },

    // Configuración del usuario (ADN + preferencias generales)
    "/api/settings": {
      GET: getSettings,
      POST: updateSettings,
    },

    // Citas agendadas automáticamente por el agente IA
    "/api/appointments": {
      GET: listAppointments,
    },
  },

  /**
   * fetch() maneja rutas dinámicas y cualquier ruta no declarada arriba.
   * Aquí procesamos: DELETE /api/appointments/:id
   */
  async fetch(req) {
    const url = new URL(req.url);
    const { pathname } = url;

    // DELETE /api/appointments/:id → cancelar cita
    const appointmentMatch = pathname.match(/^\/api\/appointments\/([^/]+)$/);
    if (appointmentMatch && req.method === "DELETE") {
      return handleDeleteAppointment(req, appointmentMatch[1]!);
    }

    // Health check
    if (req.method === "GET") {
      return new Response(
        JSON.stringify({ status: "ok", server: "Luzzy AI Agent" }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`🚀 Luzzy AI Agent Server corriendo en http://localhost:${server.port}`);
console.log(`🤖 Modelo Gemini: ${env.GEMINI_MODEL}`);
