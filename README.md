# Luzzy AI Agent Server

Servidor Bun + TypeScript que actúa como **agente de IA** para responder mensajes SMS en nombre del usuario real, usando **Google Gemini** y el **ADN de personalidad** configurado desde la app Android.

## ¿Qué hace?

1. Recibe el historial de mensajes SMS enviado por la app Android
2. Lee el **ADN del usuario** (tono, servicios, precios, horario) desde la base de datos
3. Genera una respuesta con **Gemini**, hablando exactamente como el usuario real
4. Si detecta que el cliente quiere agendar → coordina la cita
5. Cuando la cita se confirma → la guarda en BD y **notifica al usuario real** via FCM push notification
6. Envía la respuesta al cliente via FCM para que la app Android la envíe como SMS

---

## Stack técnico

| Componente | Tecnología |
|-----------|-----------|
| Runtime | [Bun](https://bun.sh) |
| Lenguaje | TypeScript |
| Base de datos | PostgreSQL |
| ORM | Prisma |
| IA | Google Gemini 1.5 Flash |
| Push notifications | Firebase Admin SDK (FCM) |
| Auth | JWT (HS256) |
| Validación | Zod |

---

## Estructura del proyecto

```
server/
├── index.ts                          # Entrada principal del servidor
├── package.json
├── .env                              # Variables de entorno (NO subir a git)
├── .env.example                      # Plantilla de variables de entorno
├── docker-compose.yml                # PostgreSQL en Docker
│
├── config/
│   └── env.ts                        # Validación y exportación de env vars
│
├── models/
│   └── types.ts                      # Interfaces TypeScript (ADN, mensajes, citas)
│
├── controllers/
│   ├── messagesController.ts         # Agente IA — flujo principal
│   ├── authController.ts             # Registro y Google login
│   ├── settingsController.ts         # CRUD de settings/ADN
│   └── appointmentsController.ts     # Gestión de citas
│
├── services/
│   ├── geminiService.ts              # Integración Gemini + construcción del prompt
│   ├── appointmentService.ts         # Lógica de agendamiento
│   ├── notificationService.ts        # Push notifications al usuario real
│   └── conversationService.ts        # Historial de conversaciones en BD
│
├── integrations/
│   ├── firebase/messaging.ts         # Firebase Admin SDK
│   └── prisma/
│       ├── schema.prisma             # Modelos de BD
│       ├── db.ts                     # Cliente Prisma
│       └── migrations/               # Migraciones SQL
│
├── utils/
│   └── auth.ts                       # JWT sign/verify
│
└── data/
    └── adn_example.json              # Ejemplo de ADN completo
```

---

## Configuración inicial

### 1. Copia el archivo de entorno

```bash
cp .env.example .env
```

Edita `.env` con tus claves reales:

| Variable | Descripción | Dónde obtenerla |
|---------|-------------|----------------|
| `DATABASE_URL` | URL de PostgreSQL | Docker Compose o tu servidor |
| `JWT_SECRET` | Clave secreta JWT | Genera una cadena aleatoria |
| `GEMINI_API_KEY` | Clave API de Google Gemini | [aistudio.google.com](https://aistudio.google.com/app/apikey) |
| `GEMINI_MODEL` | Modelo a usar | `gemini-1.5-flash` (default) |
| `FIREBASE_PROJECT_ID` | ID del proyecto Firebase | Firebase Console |
| `FIREBASE_CLIENT_EMAIL` | Email de cuenta de servicio | Firebase Console → Cuentas de servicio |
| `FIREBASE_PRIVATE_KEY` | Clave privada (con `\n` como literales) | Firebase Console → Cuentas de servicio |

### 2. Levanta la base de datos

```bash
docker-compose up -d db
```

### 3. Instala dependencias

```bash
bun install
```

### 4. Ejecuta las migraciones de Prisma

```bash
bunx prisma migrate deploy --schema=./integrations/prisma/schema.prisma
```

### 5. Arranca el servidor

```bash
bun run index.ts
```

El servidor estará disponible en `http://localhost:3000`.

---

## Endpoints

### Autenticación

#### `POST /api/register`
Registra un dispositivo Android con su token FCM.

```bash
curl -X POST http://localhost:3000/api/register \
  -H 'Content-Type: application/json' \
  -d '{"registrationToken": "FCM_TOKEN", "phone": "+34600000000"}'
```

**Respuesta:** `{ "token": "<jwt>" }`

---

#### `POST /api/auth/google-login`
Autenticación con Google (usa email como identificador).

```bash
curl -X POST http://localhost:3000/api/auth/google-login \
  -H 'Content-Type: application/json' \
  -d '{"email": "user@gmail.com", "deviceToken": "FCM_TOKEN", "displayName": "María"}'
```

---

### Agente IA

#### `POST /api/messages` *(requiere Bearer token)*
Endpoint principal. La app Android envía el historial de conversación aquí.
El servidor genera una respuesta con Gemini y la envía de vuelta via FCM.

```bash
curl -X POST http://localhost:3000/api/messages \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <jwt>' \
  -d '{
    "from": "+34611111111",
    "to": "+34600000000",
    "messages": [
      { "from": "+34611111111", "message": "Hola, cuánto cuesta un masaje?", "timestamp": "2026-02-26T10:00:00Z" }
    ]
  }'
```

**Respuesta:** `"Answered"` o `"No Answered"`

> **Nota:** Solo responde si `auto_respuesta_activada: true` en el ADN del usuario.

---

### Configuración / ADN

#### `GET /api/settings` *(requiere Bearer token)*
Devuelve la configuración completa del usuario (incluye ADN).

#### `POST /api/settings` *(requiere Bearer token)*
Actualiza la configuración. La app Android envía aquí el ADN completo.

```bash
curl -X POST http://localhost:3000/api/settings \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <jwt>' \
  -d '{
    "nombre_usuario": "María",
    "adn": "Soy simpática y directa...",
    "servicios": [{"servicio": "Masaje relajante", "precio": "60€"}],
    "lugar_trabajo": "A domicilio, hoteles",
    "auto_respuesta_activada": true
  }'
```

---

### Citas

#### `GET /api/appointments` *(requiere Bearer token)*
Lista todas las citas confirmadas por el agente.

```bash
# Todas las citas
curl http://localhost:3000/api/appointments \
  -H 'Authorization: Bearer <jwt>'

# Solo citas activas (sin canceladas)
curl "http://localhost:3000/api/appointments?active=true" \
  -H 'Authorization: Bearer <jwt>'
```

**Respuesta:**
```json
[
  {
    "id": "uuid",
    "clientPhone": "+34611111111",
    "service": "Masaje relajante (60 min)",
    "price": "60€",
    "fecha": "2026-03-04",
    "hora": "11:00",
    "location": "Calle Alcalá 45, Madrid",
    "status": "CONFIRMED",
    "createdAt": "2026-02-26T10:05:00Z"
  }
]
```

#### `DELETE /api/appointments/:id` *(requiere Bearer token)*
Cancela una cita.

```bash
curl -X DELETE http://localhost:3000/api/appointments/UUID_DE_LA_CITA \
  -H 'Authorization: Bearer <jwt>'
```

---

## Cómo funciona el ADN

El ADN es un objeto JSON libre guardado en `User.settings`. Los campos que usa el agente son:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `nombre_usuario` | string | Nombre del profesional |
| `adn` | string | **El más importante.** Describe el tono, estilo, vocabulario, emojis y personalidad |
| `servicios` | array | Lista de `{servicio, precio}` |
| `lugar_trabajo` | string | Dónde atiende (domicilio, hotel, consulta...) |
| `info_general` | string | Horario, condiciones, métodos de pago, etc. |
| `auto_respuesta_activada` | boolean | Si el agente debe responder automáticamente |

Ver ejemplo completo en `data/adn_example.json`.

---

## Flujo del agente (diagrama simplificado)

```
App Android envía historial de mensajes
         ↓
POST /api/messages
         ↓
Verificar JWT + cargar ADN del usuario
         ↓
¿auto_respuesta_activada === true?
    No → "No Answered"
    Sí ↓
Guardar mensaje entrante en DB
         ↓
Llamar a Gemini con ADN + historial
         ↓
Gemini devuelve: { mensaje, intencion, cita }
         ↓
¿intencion === "cita_confirmada"?
    Sí → Guardar cita en DB + Notificar al usuario real via FCM
         ↓
Enviar respuesta al cliente via FCM
         ↓
"Answered"
```

---

## Producción (Docker)

```bash
# Levantar todo (DB + app)
docker-compose up -d

# Ver logs
docker-compose logs -f app

# Ejecutar migración manualmente
docker-compose exec app bunx prisma migrate deploy --schema=./integrations/prisma/schema.prisma
```
