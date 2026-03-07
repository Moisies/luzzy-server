/**
 * whatsapp/sessionManager.ts
 *
 * Gestor de sesiones de WhatsApp usando @whiskeysockets/baileys.
 * Soporta múltiples usuarios simultáneos (multi-tenant):
 *   - Cada profesional tiene su propia sesión Baileys.
 *   - La sesión se persiste en sessions/{userPhone}/ para sobrevivir reinicios.
 *   - El QR se guarda en memoria para que el dashboard lo pueda mostrar.
 *
 * Ciclo de vida de una sesión:
 *   startSession(phone) → genera QR → profesional escanea → 'connected'
 *   stopSession(phone)  → desconecta y elimina de memoria (sesión persiste en disco)
 *   deleteSession(phone) → desconecta + borra archivos de sesión (logout)
 */

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  type WASocket,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import path from "path";
import fs from "fs";
import { handleWhatsAppMessage } from "./agentHandler.ts";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type SessionStatus = "disconnected" | "waiting_qr" | "connected";

interface Session {
  socket: WASocket;
  status: SessionStatus;
  /** QR string crudo (cliente lo renderiza con qrcode.js). Null cuando ya conectado. */
  qr: string | null;
  /** Número WA real del profesional una vez conectado (e.g. "5491112345678"). */
  connectedPhone: string | null;
}

// ─── Directorio de sesiones ────────────────────────────────────────────────────

const SESSIONS_DIR = path.join(process.cwd(), "sessions");
fs.mkdirSync(SESSIONS_DIR, { recursive: true });

// ─── Manager ───────────────────────────────────────────────────────────────────

class WhatsAppSessionManager {
  private sessions = new Map<string, Session>();

  /**
   * Inicia (o reconecta) una sesión Baileys para el usuario dado.
   * Si ya hay una sesión activa, no hace nada.
   */
  async startSession(userPhone: string): Promise<void> {
    const existing = this.sessions.get(userPhone);
    if (existing?.status === "connected") {
      console.log(`ℹ️  WA: sesión de ${userPhone} ya está conectada`);
      return;
    }
    // Si hay una sesión en otro estado, limpiarla antes de reconectar
    if (existing) {
      try { existing.socket.end(undefined); } catch { /* ignore */ }
      this.sessions.delete(userPhone);
    }

    const sessionDir = path.join(SESSIONS_DIR, userPhone);
    fs.mkdirSync(sessionDir, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const socket = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      // Identificador de navegador que aparece en los dispositivos vinculados de WA
      browser: ["Luzzy AI", "Chrome", "1.0.0"],
      // Desactivar logging verboso de Baileys
      logger: { level: "silent" } as any,
    });

    const session: Session = {
      socket,
      status: "waiting_qr",
      qr: null,
      connectedPhone: null,
    };
    this.sessions.set(userPhone, session);

    // Guardar credenciales cuando se actualicen
    socket.ev.on("creds.update", saveCreds);

    // Evento de conexión: QR / open / close
    socket.ev.on("connection.update", async ({ qr, connection, lastDisconnect }) => {
      if (qr) {
        session.qr = qr;
        session.status = "waiting_qr";
        console.log(`📱 WA QR generado para ${userPhone}`);
      }

      if (connection === "open") {
        session.status = "connected";
        session.qr = null;
        // El ID del socket tiene formato "phone:device@s.whatsapp.net"
        session.connectedPhone = socket.user?.id.split(":")[0] ?? null;
        console.log(
          `✅ WA conectado para ${userPhone} (número: ${session.connectedPhone})`
        );
      }

      if (connection === "close") {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;

        console.log(
          `❌ WA desconectado para ${userPhone} (código: ${statusCode}, logout: ${loggedOut})`
        );

        session.status = "disconnected";
        session.qr = null;
        session.connectedPhone = null;

        if (loggedOut) {
          // El usuario cerró sesión desde el teléfono → borrar archivos y salir
          this.sessions.delete(userPhone);
          fs.rmSync(sessionDir, { recursive: true, force: true });
          console.log(`🗑️  WA sesión eliminada para ${userPhone} (logout)`);
        } else {
          // Otro error de red → reintentar en 5s
          setTimeout(() => this.startSession(userPhone), 5000);
        }
      }
    });

    // Evento de mensajes entrantes
    socket.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;

      for (const msg of messages) {
        // Ignorar mensajes propios, sin texto, o de grupos
        if (msg.key.fromMe) continue;
        if (!msg.message) continue;
        if (msg.key.remoteJid?.endsWith("@g.us")) continue;

        const jid = msg.key.remoteJid!;
        const contactPhone = jid.replace("@s.whatsapp.net", "");

        // Extraer texto del mensaje (varios tipos de mensaje de WA)
        const text =
          msg.message.conversation ??
          msg.message.extendedTextMessage?.text ??
          msg.message.ephemeralMessage?.message?.extendedTextMessage?.text ??
          "";

        if (!text.trim()) continue;

        try {
          const reply = await handleWhatsAppMessage(userPhone, contactPhone, text);
          if (reply) {
            await socket.sendMessage(jid, { text: reply });
            console.log(`📤 WA respuesta enviada a ${contactPhone}`);
          }
        } catch (err) {
          console.error(`❌ WA error procesando mensaje de ${contactPhone}:`, err);
        }
      }
    });
  }

  /** Desconecta la sesión (mantiene archivos en disco para reconectar luego). */
  stopSession(userPhone: string): void {
    const session = this.sessions.get(userPhone);
    if (session) {
      try { session.socket.end(undefined); } catch { /* ignore */ }
      this.sessions.delete(userPhone);
      console.log(`🛑 WA sesión detenida para ${userPhone}`);
    }
  }

  /** Desconecta y elimina todos los archivos de sesión (logout total). */
  deleteSession(userPhone: string): void {
    this.stopSession(userPhone);
    const sessionDir = path.join(SESSIONS_DIR, userPhone);
    fs.rmSync(sessionDir, { recursive: true, force: true });
    console.log(`🗑️  WA sesión eliminada para ${userPhone}`);
  }

  getStatus(userPhone: string): SessionStatus {
    return this.sessions.get(userPhone)?.status ?? "disconnected";
  }

  getQR(userPhone: string): string | null {
    return this.sessions.get(userPhone)?.qr ?? null;
  }

  getConnectedPhone(userPhone: string): string | null {
    return this.sessions.get(userPhone)?.connectedPhone ?? null;
  }

  /**
   * Al arrancar el servidor, reconectar automáticamente todos los usuarios
   * que ya tenían una sesión guardada en disco.
   */
  async reconnectAll(): Promise<void> {
    if (!fs.existsSync(SESSIONS_DIR)) return;
    const dirs = fs.readdirSync(SESSIONS_DIR, { withFileTypes: true });
    for (const dir of dirs) {
      if (dir.isDirectory()) {
        const userPhone = dir.name;
        console.log(`🔄 WA reconectando sesión guardada de ${userPhone}`);
        // No awaitar para no bloquear el arranque del servidor
        this.startSession(userPhone).catch((err) =>
          console.error(`❌ WA error reconectando ${userPhone}:`, err)
        );
      }
    }
  }
}

// Exportar singleton
export const sessionManager = new WhatsAppSessionManager();
