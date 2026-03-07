import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
  type WASocket,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import QRCode from "qrcode";
import path from "path";
import fs from "fs";
import { handleWhatsAppMessage } from "./agentHandler.ts";

// Baileys requires a pino-compatible logger; this no-op implementation silences all output
const noOpLogger: any = {
  level: "silent",
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: (msg: any) => console.error("[WA]", msg),
  fatal: (msg: any) => console.error("[WA FATAL]", msg),
  child: () => noOpLogger,
};

export type SessionStatus = "disconnected" | "waiting_qr" | "connected";

interface Session {
  socket: WASocket;
  status: SessionStatus;
  qrDataUrl: string | null;
  connectedPhone: string | null;
}

const SESSIONS_DIR = path.join(process.cwd(), "sessions");
fs.mkdirSync(SESSIONS_DIR, { recursive: true });

class WhatsAppSessionManager {
  private sessions = new Map<string, Session>();

  async startSession(userPhone: string): Promise<void> {
    const existing = this.sessions.get(userPhone);
    if (existing?.status === "connected") return;

    if (existing) {
      try { existing.socket.end(undefined); } catch {}
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
      browser: Browsers.ubuntu("Chrome"),
      logger: noOpLogger,
    });

    const session: Session = {
      socket,
      status: "waiting_qr",
      qrDataUrl: null,
      connectedPhone: null,
    };
    this.sessions.set(userPhone, session);

    socket.ev.on("creds.update", saveCreds);

    socket.ev.on("connection.update", async ({ qr, connection, lastDisconnect }) => {
      if (qr) {
        console.log(`[WA] New QR for ${userPhone} (length: ${qr.length})`);
        session.qrDataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
        session.status = "waiting_qr";
      }

      if (connection === "open") {
        console.log(`[WA] Connected for ${userPhone}: ${socket.user?.id}`);
        session.status = "connected";
        session.qrDataUrl = null;
        session.connectedPhone = socket.user?.id.split(":")[0] ?? null;
      }

      if (connection === "close") {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;

        session.status = "disconnected";
        session.qrDataUrl = null;
        session.connectedPhone = null;

        if (loggedOut) {
          this.sessions.delete(userPhone);
          fs.rmSync(sessionDir, { recursive: true, force: true });
        } else {
          setTimeout(() => this.startSession(userPhone), 5000);
        }
      }
    });

    socket.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;

      for (const msg of messages) {
        if (msg.key.fromMe) continue;
        if (!msg.message) continue;
        if (msg.key.remoteJid?.endsWith("@g.us")) continue;

        const jid = msg.key.remoteJid!;
        const contactPhone = jid.replace("@s.whatsapp.net", "");

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
          }
        } catch (err) {
          console.error("WA message error:", err);
        }
      }
    });
  }

  stopSession(userPhone: string): void {
    const session = this.sessions.get(userPhone);
    if (session) {
      try { session.socket.end(undefined); } catch {}
      this.sessions.delete(userPhone);
    }
  }

  deleteSession(userPhone: string): void {
    this.stopSession(userPhone);
    const sessionDir = path.join(SESSIONS_DIR, userPhone);
    fs.rmSync(sessionDir, { recursive: true, force: true });
  }

  getStatus(userPhone: string): SessionStatus {
    return this.sessions.get(userPhone)?.status ?? "disconnected";
  }

  getQRDataUrl(userPhone: string): string | null {
    return this.sessions.get(userPhone)?.qrDataUrl ?? null;
  }

  getConnectedPhone(userPhone: string): string | null {
    return this.sessions.get(userPhone)?.connectedPhone ?? null;
  }

  async reconnectAll(): Promise<void> {
    if (!fs.existsSync(SESSIONS_DIR)) return;
    const dirs = fs.readdirSync(SESSIONS_DIR, { withFileTypes: true });
    for (const dir of dirs) {
      if (dir.isDirectory()) {
        this.startSession(dir.name).catch((err) =>
          console.error("WA reconnect error:", err)
        );
      }
    }
  }
}

export const sessionManager = new WhatsAppSessionManager();
