# API de Luzzy (Servidor Bun)

Este documento describe las llamadas del API expuestas por el servidor y cómo funciona la autorización. Se centra exclusivamente en los endpoints disponibles y sus cabeceras/parámetros.

- Base URL por defecto: `http://luzzy.app/api`
- Formato de contenido: `application/json`

## Autorización

- Esquema: Bearer Token (JWT)
- Algoritmo: HS256
- Reclamos principales: `{ "phone": string }`
- Expiración: 7 días
- Encabezado: `Authorization: Bearer <token>`

Cómo se obtiene el token:
1. Regístrate (o actualiza tu registro) con `/api/register` para recibir un JWT.
2. Usa ese token en el header `Authorization` para llamar a endpoints protegidos como `/api/message`.

Respuestas de error relacionadas:
- `401 Unauthorized` cuando falta el header, está mal formado o el token no es válido/expiró.

---

## Endpoints

### POST /api/register
Registra (o actualiza) el dispositivo/usuario y devuelve un JWT para autenticación posterior.

- Body
```json
{
  "registrationToken": "string",
  "phone": "string"
}
```
    Campos:
        - registrationToken: Token unico del dispositivo android Firebase Cloud Messaging (FCM)
        - phoneL Numero telefonico del dispositivo mobil, en formato E.164. e.g. +61412345678

- Respuesta 200
```json
{
  "token": "<jwt>"
}
```

- Respuesta 400
```json
{ "error": "<mensaje>" }
```

- Ejemplo cURL
```bash
curl -X POST \
  http://localhost:3000/api/register \
  -H 'Content-Type: application/json' \
  -d '{
    "registrationToken": "fcm-device-token",
    "phone": "+34600000000"
  }'
```

---

### POST /api/messages
Envía un mensaje para que el servidor procese y, si corresponde, responda vía FCM al destinatario registrado.

- Autorización requerida: `Authorization: Bearer <token>` (obtenido en `/api/register`).

- Body
```json
{
  "from": "string",
  "to": "string",
  "messages": [
    {
      "from": "string",
      "message": "string",
      "timestamp": "ISO-8601"
    }
  ]
}
```
    Campos:
        - from: numero telefonico de quien envio al dispositvo registrado en nuestro sistema, en formato E.164. e.g. +61412345678
        - to: numero telefonico del dispositivo mobil registrado en nuestro sistema, en formato E.164. e.g. +61412345678
        - messages: array de mensajes de la conversacion
        - messages.from: numero telefonico del remitente, dependiendo si es inbound o outbound, sera el igual al compro "from" o "to" descritos anteriormente
        - messages.message: texto del mensaje
        - messages.timestamp: fecha/hora del mensaje, en formato ISO-8601

- Respuesta 200 (texto plano)
```
Answered
```
ó
```
No Answered
```

- Respuestas de error
  - 400: `{"error": "<mensaje>"}`
  - 401: `{"error": "Missing or malformed Authorization header"}` o `{"error": "Invalid token"}`

- Ejemplo cURL
```bash
curl -X POST \
  http://localhost:3000/api/message \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <jwt>' \
  -d '{
    "from": "+34600000000",
    "to": "+34999999999",
    "messages": [
      {
        "from": "+34600000000",
        "message": "Hola!",
        "timestamp": "2025-11-04T13:35:00Z"
      }
    ]
  }'
```



---

### GET /api/settings
Obtiene las preferencias/ajustes (`settings`) del usuario autenticado.

- Autorización requerida: `Authorization: Bearer <token>`.
- Respuesta 200 (ejemplo)
```json
{
  "theme": "dark",
  "notifications": {"email": true, "push": false},
  "itemsPerPage": 20
}
```
- Respuestas de error
  - 400: `{"error": "<mensaje>"}`
  - 401: `{"error": "Unauthorized"}` u otro mensaje relacionado con autorización

- Ejemplo cURL
```bash
curl -X GET \
  http://localhost:3000/api/settings \
  -H 'Authorization: Bearer <jwt>'
```

---

### POST /api/settings
Actualiza las preferencias/ajustes (`settings`) del usuario autenticado. El cuerpo puede ser un objeto JSON con claves de tipo string y valores de cualquier tipo JSON (string, number, boolean, object, array, null).

- Autorización requerida: `Authorization: Bearer <token>`.

- Body (ejemplo)
```json
{
  "setting1": "setting1",
  "setting2": {"setting2.1": 1},
  "setting3": 333
}
```

- Respuesta 200 (texto plano)
```
OK
```

- Respuestas de error
  - 400: `{"error": "<mensaje>"}` (cuando el cuerpo no es un objeto con claves string o falla la validación)
  - 401: `{"error": "Unauthorized"}` u otro mensaje relacionado con autorización

- Ejemplo cURL
```bash
curl -X POST \
  http://localhost:3000/api/settings \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <jwt>' \
  -d '{
    "setting1": "setting1",
    "setting2": {"setting2.1": 1},
    "setting3": 333
  }'
```
