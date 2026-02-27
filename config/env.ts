/**
 * config/env.ts
 * Centraliza y valida todas las variables de entorno al arrancar el servidor.
 * Si faltan variables críticas se imprime una advertencia (no lanza excepción
 * para facilitar el desarrollo local con valores por defecto).
 */

export const env = {
  PORT: parseInt(process.env.PORT ?? "3000"),
  JWT_SECRET: process.env.JWT_SECRET ?? "dev-secret",
  DATABASE_URL: process.env.DATABASE_URL ?? "",

  // Google Gemini
  GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? "",
  GEMINI_MODEL: process.env.GEMINI_MODEL ?? "gemini-2.0-flash",

  // Firebase Admin
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID ?? "",
  FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL ?? "",
  FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY ?? "",
} as const;

// Validar variables críticas al arrancar
const required: (keyof typeof env)[] = [
  "GEMINI_API_KEY",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
];

for (const key of required) {
  if (!env[key]) {
    console.warn(`⚠️  Variable de entorno requerida no configurada: ${key}`);
  }
}
