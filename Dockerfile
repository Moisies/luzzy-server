# ── Stage 1: Instalar dependencias y generar cliente Prisma ──────────────────
FROM oven/bun:1 AS builder
WORKDIR /app

# Copiar archivos de dependencias primero (aprovecha cache de Docker)
COPY package.json bun.lock* ./

# Copiar schema antes de bun install para que postinstall genere el cliente
COPY integrations/prisma/schema.prisma ./integrations/prisma/schema.prisma

RUN bun install

# Copiar el resto del código
COPY . .

# Generar cliente Prisma
RUN bunx prisma generate --schema=./integrations/prisma/schema.prisma

# ── Stage 2: Imagen final de producción ──────────────────────────────────────
FROM oven/bun:1-slim AS runner
WORKDIR /app

# Copiar todo desde el builder (incluyendo node_modules y cliente Prisma generado)
COPY --from=builder /app .

EXPOSE 3000

# Ejecutar migraciones y arrancar el servidor
CMD ["sh", "-c", "bunx prisma migrate deploy --schema=./integrations/prisma/schema.prisma && bun run index.ts"]
