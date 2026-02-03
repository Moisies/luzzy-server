FROM oven/bun:1 AS base
WORKDIR /app

# Instalar dependencias
COPY package.json bun.lock ./
COPY integrations/prisma/schema.prisma ./integrations/prisma/schema.prisma
RUN bun install --frozen-lockfile

# Copiar codigo
COPY . .

# Generar cliente Prisma y ejecutar migraciones
RUN bunx prisma generate --schema=./integrations/prisma/schema.prisma

EXPOSE 3000

CMD ["sh", "-c", "bunx prisma migrate deploy --schema=./integrations/prisma/schema.prisma && bun run index.ts"]
