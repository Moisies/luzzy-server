-- Migration: AI Agent models
-- Agrega tablas para conversaciones, historial de mensajes y citas

-- CreateEnum: rol del mensaje en la conversación
CREATE TYPE "MessageRole" AS ENUM ('USER', 'AGENT');

-- CreateEnum: estado de la cita
CREATE TYPE "AppointmentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED');

-- CreateTable: Conversation (hilo de conversación entre profesional y cliente)
CREATE TABLE "Conversation" (
    "id"           TEXT        NOT NULL,
    "userPhone"    TEXT        NOT NULL,
    "contactPhone" TEXT        NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: par único (usuario, contacto) — una sola conversación por par
CREATE UNIQUE INDEX "Conversation_userPhone_contactPhone_key"
    ON "Conversation"("userPhone", "contactPhone");

-- CreateTable: ConversationMessage (mensajes dentro de una conversación)
CREATE TABLE "ConversationMessage" (
    "id"             TEXT        NOT NULL,
    "conversationId" TEXT        NOT NULL,
    "role"           "MessageRole" NOT NULL,
    "content"        TEXT        NOT NULL,
    "timestamp"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConversationMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Appointment (citas agendadas por el agente IA)
CREATE TABLE "Appointment" (
    "id"          TEXT        NOT NULL,
    "userPhone"   TEXT        NOT NULL,
    "clientPhone" TEXT        NOT NULL,
    "service"     TEXT        NOT NULL,
    "price"       TEXT,
    "fecha"       TEXT,
    "hora"        TEXT,
    "location"    TEXT,
    "notes"       TEXT,
    "status"      "AppointmentStatus" NOT NULL DEFAULT 'CONFIRMED',
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey: Conversation → User
ALTER TABLE "Conversation"
    ADD CONSTRAINT "Conversation_userPhone_fkey"
    FOREIGN KEY ("userPhone") REFERENCES "User"("phone")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: ConversationMessage → Conversation (cascade delete)
ALTER TABLE "ConversationMessage"
    ADD CONSTRAINT "ConversationMessage_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: Appointment → User
ALTER TABLE "Appointment"
    ADD CONSTRAINT "Appointment_userPhone_fkey"
    FOREIGN KEY ("userPhone") REFERENCES "User"("phone")
    ON DELETE RESTRICT ON UPDATE CASCADE;
