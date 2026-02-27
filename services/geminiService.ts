/**
 * services/geminiService.ts
 * Integración con Google Gemini AI.
 *
 * Responsabilidades:
 * - Construir el system prompt dinámicamente con el ADN del usuario
 * - Enviar el historial de conversación a Gemini
 * - Parsear la respuesta JSON estructurada
 * - Detectar la intención del cliente
 */

import { GoogleGenerativeAI, type Content } from "@google/generative-ai";
import { env } from "../config/env.ts";
import type { UserADN, GeminiResponse, IncomingMessage } from "../models/types.ts";

const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);

// ─── System Prompt ────────────────────────────────────────────────────────────

/**
 * Construye el system prompt inyectando el ADN del usuario real.
 * Este prompt es la "identidad" que adoptará Gemini en cada conversación.
 */
function buildSystemPrompt(adn: UserADN): string {
  const nombre = adn.nombre_usuario || "el usuario";

  const serviciosText =
    adn.servicios && adn.servicios.length > 0
      ? adn.servicios
          .map((s) => `  • ${s.servicio}: ${s.precio}`)
          .join("\n")
      : "  • No hay servicios registrados";

  return `\
Eres un asistente de IA que responde mensajes SMS exactamente como si fueras ${nombre}.
Tu misión es atender a los clientes, informar sobre servicios, coordinar citas y cerrar ventas.

════════════════════════════════════════
IDENTIDAD Y ESTILO DE COMUNICACIÓN
════════════════════════════════════════
${adn.adn?.trim() || "Responde de forma amable, profesional y cercana."}

════════════════════════════════════════
SERVICIOS Y PRECIOS
════════════════════════════════════════
${serviciosText}

════════════════════════════════════════
DISPONIBILIDAD Y LUGAR DE TRABAJO
════════════════════════════════════════
${adn.lugar_trabajo?.trim() || "No especificado."}

════════════════════════════════════════
INFORMACIÓN GENERAL
════════════════════════════════════════
${adn.info_general?.trim() || "Sin información adicional."}

════════════════════════════════════════
REGLAS CRÍTICAS — NUNCA LAS INCUMPLAS
════════════════════════════════════════
1. SOLO usa la información de este ADN. Si no sabes algo, di "te lo confirmo en un momento" o "dame un segundo que lo compruebo".
2. Responde SIEMPRE como ${nombre}, en primera persona, con su mismo tono, vocabulario y uso de emojis.
3. NUNCA reveles que eres una IA, un bot o un asistente automático. Eres ${nombre}.
4. NUNCA solicites datos bancarios, tarjetas ni proceses pagos. Si preguntan cómo pagar, di que se coordina en persona o al momento del servicio.
5. Para confirmar una cita necesitas que el cliente dé: servicio + fecha + hora. Si falta alguno, pídelo amablemente.
6. Solo marca "cita_confirmada" cuando tengas los tres datos anteriores acordados explícitamente.
7. Sé conciso. Los mensajes SMS son cortos. Responde de forma directa sin párrafos largos.
8. Si el cliente pregunta algo fuera de tu ADN (tema personal, precio de algo que no ofreces, etc.), dilo amablemente.

════════════════════════════════════════
FORMATO DE RESPUESTA — MUY IMPORTANTE
════════════════════════════════════════
Responde SIEMPRE con un JSON válido. SIN bloques de código markdown, SIN comillas extra alrededor del JSON.
El JSON debe tener exactamente esta estructura:

{
  "mensaje": "El texto exacto que se enviará al cliente por SMS",
  "intencion": "informacion | interes | quiere_agendar | cita_confirmada",
  "cita": null
}

Cuando la intención sea "cita_confirmada", incluye los detalles de la cita:

{
  "mensaje": "¡Perfecto! Te espero el martes 4 de marzo a las 11:00 en mi local 😊",
  "intencion": "cita_confirmada",
  "cita": {
    "servicio": "Masaje relajante (60 min)",
    "precio": "60€",
    "fecha": "2026-03-04",
    "hora": "11:00",
    "lugar": "Local en Calle Mayor 12"
  }
}

Para cualquier otra intención, "cita" siempre es null.`;
}

// ─── Historial de conversación ────────────────────────────────────────────────

/**
 * Convierte el array de mensajes de la app Android al formato que espera Gemini.
 * Los mensajes del usuario real (userPhone) son del rol "model" (respuestas del agente).
 * Los mensajes del contacto son del rol "user" (el cliente).
 */
function buildHistory(
  messages: IncomingMessage[],
  userPhone: string
): Content[] {
  return messages.map((msg) => ({
    role: msg.from === userPhone ? "model" : "user",
    parts: [{ text: msg.message }],
  }));
}

// ─── Función principal ────────────────────────────────────────────────────────

/**
 * Genera una respuesta del agente usando Gemini + el ADN del usuario.
 *
 * @param adn      - Perfil del usuario real (personalidad, servicios, etc.)
 * @param messages - Historial completo de la conversación (incluye el último mensaje)
 * @param userPhone - Teléfono del usuario registrado (para identificar quién es "model")
 */
export async function generateAgentResponse(
  adn: UserADN,
  messages: IncomingMessage[],
  userPhone: string
): Promise<GeminiResponse> {
  if (!env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY no configurada");
  }

  const model = genAI.getGenerativeModel({
    model: env.GEMINI_MODEL,
    systemInstruction: buildSystemPrompt(adn),
    generationConfig: {
      temperature: 0.75,     // Algo de naturalidad sin desviarse del ADN
      maxOutputTokens: 600,  // Respuestas SMS cortas
      responseMimeType: "application/json", // Forzar JSON cuando el modelo lo soporta
    },
  });

  // El historial son todos los mensajes EXCEPTO el último (que es el nuevo mensaje entrante)
  const history = buildHistory(messages.slice(0, -1), userPhone);
  const lastMessage = messages[messages.length - 1];

  if (!lastMessage) {
    throw new Error("No hay mensajes para procesar");
  }

  const chat = model.startChat({ history });
  const result = await chat.sendMessage(lastMessage.message);
  const rawText = result.response.text().trim();

  // Parsear JSON de la respuesta
  try {
    // Limpiar posibles bloques markdown que Gemini podría añadir pese al system prompt
    const cleaned = rawText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const parsed = JSON.parse(cleaned) as GeminiResponse;

    // Validaciones básicas de la respuesta
    if (!parsed.mensaje) {
      throw new Error("Respuesta Gemini sin campo 'mensaje'");
    }

    return parsed;
  } catch (parseError) {
    // Si Gemini no devolvió JSON válido, usar la respuesta como texto plano
    console.error("⚠️  Error parseando JSON de Gemini. Raw:", rawText);
    return {
      mensaje: rawText || "En breve te respondo 😊",
      intencion: "informacion",
      cita: null,
    };
  }
}
