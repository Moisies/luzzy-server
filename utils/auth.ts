import {SignJWT, jwtVerify} from "jose";

const JWT_SECRET = Bun.env.JWT_SECRET ?? "dev-secret";
const encoder = new TextEncoder();
const secretKey = encoder.encode(JWT_SECRET);

type JWTPayload = { phone: string };

export async function signToken(phone: string) {
    return await new SignJWT({phone})
        .setProtectedHeader({alg: "HS256"})
        .setIssuedAt()
        .sign(secretKey);
}

async function verifyToken<JWTPayload extends Record<string, string>>(token: string) {
    return await jwtVerify<JWTPayload>(token, secretKey, {algorithms: ["HS256"]});
}

export function unauthorized(message = "Unauthorized") {
    return new Response(JSON.stringify({error: message}), {
        status: 401,
        headers: {"Content-Type": "application/json"}
    });
}


export async function checkAuth(req: Request) {
    const auth = req.headers.get("authorization") ?? req.headers.get("Authorization");
    if (!auth || !auth.startsWith("Bearer ")) {
        throw new Error("Missing or malformed Authorization header");
    }
    const token = auth.slice("Bearer ".length).trim();
    const {payload: {phone}} = await verifyToken<JWTPayload>(token);
    return phone

}
