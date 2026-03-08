/**
 * index.ts — Luzzy Server
 *
 * Endpoints:
 *   POST   /api/register
 *   POST   /api/auth/google-login
 *   POST   /api/auth/web-register
 *   POST   /api/auth/web-login
 *   POST   /api/messages
 *   GET    /api/settings
 *   POST   /api/settings
 *   GET    /api/appointments
 *   DELETE /api/appointments/:id
 *   GET    /api/whatsapp/status
 *   GET    /api/whatsapp/qr
 *   POST   /api/whatsapp/connect
 *   POST   /api/whatsapp/disconnect
 *   POST   /api/whatsapp/logout
 */

import { serve } from "bun";
import { handleRegister, handleGoogleLogin } from "./controllers/authController.ts";
import { handleWebRegister, handleWebLogin } from "./controllers/webAuthController.ts";
import { handleMessages } from "./controllers/messagesController.ts";
import { getSettings, updateSettings } from "./controllers/settingsController.ts";
import {
  listAppointments,
  handleDeleteAppointment,
} from "./controllers/appointmentsController.ts";
import {
  handleWhatsAppStatus,
  handleWhatsAppQR,
  handleWhatsAppConnect,
  handleWhatsAppDisconnect,
  handleWhatsAppLogout,
} from "./controllers/whatsappController.ts";
import {
  handleBillingStatus,
  handleCreateCheckout,
  handleBillingPortal,
  handleWebhook,
} from "./controllers/billingController.ts";
import {
  handleAdminStats,
  handleAdminListUsers,
  handleAdminCreateUser,
  handleAdminUpdateUser,
  handleAdminDeleteUser,
} from "./controllers/adminController.ts";
import { sessionManager } from "./whatsapp/sessionManager.ts";
import { env } from "./config/env.ts";

const server = serve({
  port: env.PORT,

  routes: {
    "/api/register": {
      POST: handleRegister,
    },
    "/api/auth/google-login": {
      POST: handleGoogleLogin,
    },
    "/api/auth/web-register": {
      POST: handleWebRegister,
    },
    "/api/auth/web-login": {
      POST: handleWebLogin,
    },
    "/api/messages": {
      POST: handleMessages,
    },
    "/api/settings": {
      GET: getSettings,
      POST: updateSettings,
    },
    "/api/appointments": {
      GET: listAppointments,
    },
    "/api/whatsapp/status": {
      GET: handleWhatsAppStatus,
    },
    "/api/whatsapp/qr": {
      GET: handleWhatsAppQR,
    },
    "/api/whatsapp/connect": {
      POST: handleWhatsAppConnect,
    },
    "/api/whatsapp/disconnect": {
      POST: handleWhatsAppDisconnect,
    },
    "/api/whatsapp/logout": {
      POST: handleWhatsAppLogout,
    },
    "/api/billing/status": {
      GET: handleBillingStatus,
    },
    "/api/billing/checkout": {
      POST: handleCreateCheckout,
    },
    "/api/billing/portal": {
      POST: handleBillingPortal,
    },
    "/api/billing/webhook": {
      POST: handleWebhook,
    },
    "/api/admin/stats": {
      GET: handleAdminStats,
    },
    "/api/admin/users": {
      GET:  handleAdminListUsers,
      POST: handleAdminCreateUser,
    },
  },

  async fetch(req) {
    const url = new URL(req.url);
    const { pathname } = url;

    const appointmentMatch = pathname.match(/^\/api\/appointments\/([^/]+)$/);
    if (appointmentMatch && req.method === "DELETE") {
      return handleDeleteAppointment(req, appointmentMatch[1]!);
    }

    const adminUserMatch = pathname.match(/^\/api\/admin\/users\/(.+)$/);
    if (adminUserMatch) {
      if (req.method === "PATCH")  return handleAdminUpdateUser(req, adminUserMatch[1]!);
      if (req.method === "DELETE") return handleAdminDeleteUser(req, adminUserMatch[1]!);
    }

    if (req.method === "GET" && pathname === "/admin") {
      const file = Bun.file(new URL("./public/admin.html", import.meta.url));
      return new Response(file, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    if (req.method === "GET" && (pathname === "/" || pathname === "/index.html")) {
      const file = Bun.file(new URL("./public/index.html", import.meta.url));
      return new Response(file, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    if (req.method === "GET" && (pathname === "/privacy" || pathname === "/privacidad" || pathname === "/politicas")) {
      const file = Bun.file(new URL("./public/privacy.html", import.meta.url));
      return new Response(file, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    if (req.method === "GET" && pathname === "/dashboard") {
      const file = Bun.file(new URL("./public/dashboard.html", import.meta.url));
      return new Response(file, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    if (req.method === "GET" && (pathname === "/delete-account" || pathname === "/eliminar-cuenta")) {
      const file = Bun.file(new URL("./public/delete-account.html", import.meta.url));
      return new Response(file, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    if (req.method === "GET" && pathname === "/health") {
      return new Response(
        JSON.stringify({ status: "ok", server: "Luzzy AI Agent" }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Server running on http://localhost:${server.port}`);
console.log(`Gemini model: ${env.GEMINI_MODEL}`);

sessionManager.reconnectAll().catch(console.error);
