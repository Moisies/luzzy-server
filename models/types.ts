/**
 * models/types.ts
 * Interfaces TypeScript que definen la estructura de datos de la aplicación.
 */

// ─── ADN del usuario (almacenado en User.settings) ───────────────────────────

export interface Servicio {
  servicio: string; // Nombre del servicio
  precio: string;   // Precio o "A consultar"
}

export interface UserADN {
  nombre_usuario?: string;
  /** Descripción del tono, estilo, frases típicas, personalidad del usuario real */
  adn?: string;
  servicios?: Servicio[];
  lugar_trabajo?: string;
  info_general?: string;
  mensaje_automatico?: string;
  firma_sms?: string;
  auto_respuesta_activada?: boolean;
  // Campos legacy / generales de config
  [key: string]: unknown;
}

// ─── Mensajes entrantes (payload de /api/messages) ───────────────────────────

export interface IncomingMessage {
  from: string;       // Número de teléfono del remitente
  message: string;
  timestamp: string;  // ISO-8601
}

export interface MessagesRequest {
  from: string;   // Contacto que escribe al usuario registrado
  to: string;     // Usuario registrado en el sistema
  messages: IncomingMessage[];
}

// ─── Respuesta estructurada de Gemini ────────────────────────────────────────

/**
 * Intenciones detectadas por el agente:
 * - informacion    → El cliente solo consulta información general
 * - interes        → Muestra interés en un servicio pero no agenda aún
 * - quiere_agendar → Quiere concretar una cita (falta fecha/hora)
 * - cita_confirmada → Se acordó fecha, hora y servicio. Hay que registrar la cita.
 */
export type Intent =
  | "informacion"
  | "interes"
  | "quiere_agendar"
  | "cita_confirmada";

export interface AppointmentDetails {
  servicio: string;
  precio: string | null;
  fecha: string | null;   // YYYY-MM-DD o null
  hora: string | null;    // HH:MM o null
  lugar: string | null;
}

export interface GeminiResponse {
  mensaje: string;            // Texto exacto que se enviará al cliente
  intencion: Intent;
  cita: AppointmentDetails | null;
}
