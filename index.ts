import {serve} from "bun";
import z from "zod";
import messaging from "./integrations/firebase/messaging.ts";
import db from "./integrations/prisma/db.ts";
import {checkAuth, signToken, unauthorized} from "./utils/auth.ts";


const server = serve({
    port: 3000,
    routes: {
        "/api/settings": {
            POST: async req => {
                let phone = ""
                try {
                    phone = await checkAuth(req)
                } catch (e) {
                    return unauthorized();
                }
                const schema = z.record(z.string(), z.any());
                try {
                    const body = await req.json();
                    const settings = schema.parse(body);
                    await db.user.update({
                        where: {phone},
                        data: {settings}
                    });
                } catch (e) {
                    return new Response(JSON.stringify({error: (e as Error).message}), {
                        status: 400,
                        headers: {"Content-Type": "application/json"}
                    });
                }
                return Response.json('OK');
            },
            GET: async req => {
                let phone = ""
                try {
                    phone = await checkAuth(req)
                } catch (e) {
                    return unauthorized();
                }
                const {settings} = await db.user.findUniqueOrThrow({where: {phone}})
                return Response.json(settings)
            }
        },
        "/api/register": {
            POST: async req => {
                try {
                    const body = await req.json();
                    const schema = z.object({
                        registrationToken: z.string(),
                        phone: z.string()
                    });
                    const {registrationToken, phone} = schema.parse(body);
                    await db.user.upsert({
                        where: {phone},
                        create: {phone, registrationToken},
                        update: {phone, registrationToken}
                    });
                    const token = await signToken(phone);
                    return Response.json({token});
                } catch (e) {
                    return new Response(JSON.stringify({error: (e as Error).message}), {
                        status: 400,
                        headers: {"Content-Type": "application/json"}
                    });
                }
            }
        },
        "/api/auth/google-login": {
            POST: async req => {
                try {
                    const body = await req.json();
                    const schema = z.object({
                        email: z.string().email(),
                        deviceToken: z.string(),
                        displayName: z.string().optional(),
                        photoUrl: z.string().optional()
                    });
                    const {email, deviceToken, displayName, photoUrl} = schema.parse(body);
                    const phone = email;
                    const registrationToken = deviceToken;
                    await db.user.upsert({
                        where: {phone},
                        create: {phone, registrationToken},
                        update: {registrationToken}
                    });
                    const token = await signToken(phone);
                    return Response.json({
                        token,
                        user: {
                            email,
                            displayName: displayName || null,
                            photoUrl: photoUrl || null
                        }
                    });
                } catch (e) {
                    console.error("Google login error:", e);
                    return new Response(JSON.stringify({error: (e as Error).message}), {
                        status: 400,
                        headers: {"Content-Type": "application/json"}
                    });
                }
            }
        },
        "/api/messages": {
            POST: async req => {
                let phone = ""
                try {
                    phone = await checkAuth(req)
                } catch (e) {
                    return unauthorized();
                }
                const schema = z.object({
                    from: z.string(),
                    to: z.string(),
                    messages: z.array(
                        z.object({
                            from: z.string(),
                            message: z.string(),
                            timestamp: z.string()
                        })
                    )
                });
                try {
                    const body = await req.json();
                    const {from, to, messages} = schema.parse(body);
                    if (to !== phone) {
                        return unauthorized();
                    }
                    const {registrationToken} = await db.user.findUniqueOrThrow({
                        where: {phone: to},
                        select: {registrationToken: true}
                    });
                    if (!!messages[messages.length - 1]?.message) {
                        await messaging.send({
                            data: {
                                to: from,
                                message: `Time: ${new Date().toLocaleTimeString()}`,
                            },
                            token: registrationToken
                        });
                        return Response.json('Answered');
                    }
                    return Response.json('No Answered');
                } catch (e) {
                    return new Response(JSON.stringify({error: (e as Error).message}), {
                        status: 400,
                        headers: {"Content-Type": "application/json"}
                    });
                }
            }
        }
    },
    fetch(req) {
        // Catch-all GET route: respond OK for any unmatched GET path
        if (req.method === "GET") {
            return new Response("OK");
        }
        // Default 404 for other unmatched methods/paths
        return new Response("Not Found", { status: 404 });
    }
});

console.log(`Server running at http://localhost:${server.port}`);

