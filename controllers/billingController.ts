/**
 * controllers/billingController.ts
 * Pasarela de pago Stripe — suscripciones para SMS bot y WhatsApp bot.
 *
 * Endpoints:
 *   GET  /api/billing/status       — plan actual del usuario
 *   POST /api/billing/checkout     — crea sesión de pago Stripe
 *   POST /api/billing/portal       — abre portal de gestión Stripe
 *   POST /api/billing/webhook      — recibe eventos de Stripe (sin auth JWT)
 */

import Stripe from "stripe";
import path from "path";
import fs from "fs";
import { checkAuth, unauthorized } from "../utils/auth.ts";

const STRIPE_SECRET   = Bun.env.STRIPE_SECRET_KEY    ?? "";
const WEBHOOK_SECRET  = Bun.env.STRIPE_WEBHOOK_SECRET ?? "";
const PRICE_PRO       = Bun.env.STRIPE_PRICE_PRO      ?? "";

const stripe = STRIPE_SECRET
  ? new Stripe(STRIPE_SECRET, { apiVersion: "2025-06-30.basil" })
  : null;

const USE_DB = !!Bun.env.DATABASE_URL && Bun.env.DATABASE_URL.startsWith("postgres");
const usersFile = path.join(process.cwd(), "users-dev.json");

function loadUsers(): Record<string, any> {
  try { return JSON.parse(fs.readFileSync(usersFile, "utf8")); } catch { return {}; }
}
function saveUsers(u: Record<string, any>) {
  fs.writeFileSync(usersFile, JSON.stringify(u, null, 2));
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

function getOrigin(req: Request): string {
  const origin = req.headers.get("origin");
  if (origin) return origin;
  const host = req.headers.get("host") ?? "localhost:4000";
  return `http://${host}`;
}

// ─── GET /api/billing/status ──────────────────────────────────────────────────

export async function handleBillingStatus(req: Request): Promise<Response> {
  let phone: string;
  try { phone = await checkAuth(req); } catch { return unauthorized(); }

  if (USE_DB) {
    const db = (await import("../integrations/prisma/db.ts")).default;
    const user = await db.user.findUnique({ where: { phone } });
    const sub = (user?.settings as any)?.subscription ?? null;
    return json(sub ?? { plan: "free", status: "inactive" });
  }

  const users = loadUsers();
  const sub = users[phone]?.subscription ?? { plan: "free", status: "inactive" };
  return json(sub);
}

// ─── POST /api/billing/checkout ───────────────────────────────────────────────

export async function handleCreateCheckout(req: Request): Promise<Response> {
  let phone: string;
  try { phone = await checkAuth(req); } catch { return unauthorized(); }
  if (!stripe || !PRICE_PRO) return json({ error: "Stripe not configured" }, 503);

  const origin = getOrigin(req);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: PRICE_PRO, quantity: 1 }],
    customer_email: phone,
    client_reference_id: phone,
    success_url: `${origin}/dashboard?activated=1`,
    cancel_url:  `${origin}/dashboard?cancelled=1`,
    metadata: { userPhone: phone },
    subscription_data: {
      metadata: { userPhone: phone },
    },
  });

  return json({ url: session.url });
}

// ─── POST /api/billing/portal ─────────────────────────────────────────────────

export async function handleBillingPortal(req: Request): Promise<Response> {
  let phone: string;
  try { phone = await checkAuth(req); } catch { return unauthorized(); }
  if (!stripe) return json({ error: "Stripe not configured" }, 503);

  let customerId: string | null = null;

  if (USE_DB) {
    const db = (await import("../integrations/prisma/db.ts")).default;
    const user = await db.user.findUnique({ where: { phone } });
    customerId = (user?.settings as any)?.subscription?.stripeCustomerId ?? null;
  } else {
    customerId = loadUsers()[phone]?.subscription?.stripeCustomerId ?? null;
  }

  if (!customerId) return json({ error: "No active subscription found" }, 404);

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${getOrigin(req)}/dashboard`,
  });

  return json({ url: session.url });
}

// ─── POST /api/billing/webhook ────────────────────────────────────────────────
// Stripe llama a este endpoint directamente — sin JWT

export async function handleWebhook(req: Request): Promise<Response> {
  if (!stripe || !WEBHOOK_SECRET) return json({ error: "Stripe not configured" }, 503);

  const sig  = req.headers.get("stripe-signature") ?? "";
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, WEBHOOK_SECRET);
  } catch (err: any) {
    console.error("Stripe webhook error:", err.message);
    return new Response(`Webhook error: ${err.message}`, { status: 400 });
  }

  await processStripeEvent(event);
  return json({ received: true });
}

async function processStripeEvent(event: Stripe.Event) {
  const users = USE_DB ? null : loadUsers();

  // Suscripción creada o pagada
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const phone   = session.client_reference_id ?? (session.metadata?.userPhone ?? null);
    if (!phone) return;
    await setSubscription(phone, {
      plan: "pro",
      status: "active",
      stripeCustomerId:     String(session.customer ?? ""),
      stripeSubscriptionId: String(session.subscription ?? ""),
    }, users);
  }

  // Estado de suscripción actualizado
  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.created") {
    const sub = event.data.object as Stripe.Subscription;
    await setSubscriptionByCustomer(String(sub.customer), {
      status: sub.status,
      plan:   sub.status === "active" ? "pro" : "free",
      stripeSubscriptionId: sub.id,
      currentPeriodEnd: new Date(sub.current_period_end * 1000).toISOString(),
    }, users);
  }

  // Suscripción cancelada
  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    await setSubscriptionByCustomer(String(sub.customer), {
      plan: "free",
      status: "cancelled",
      stripeSubscriptionId: null,
      currentPeriodEnd: null,
    }, users);
  }

  if (users) saveUsers(users);
}

async function setSubscription(phone: string, data: any, users: Record<string, any> | null) {
  if (USE_DB) {
    const db = (await import("../integrations/prisma/db.ts")).default;
    const user = await db.user.findUnique({ where: { phone } });
    if (!user) return;
    const settings: any = user.settings ?? {};
    settings.subscription = { ...(settings.subscription ?? {}), ...data };
    await db.user.update({ where: { phone }, data: { settings } });
  } else {
    if (!users || !users[phone]) return;
    users[phone].subscription = { ...(users[phone].subscription ?? {}), ...data };
  }
}

async function setSubscriptionByCustomer(customerId: string, data: any, users: Record<string, any> | null) {
  if (USE_DB) {
    const db = (await import("../integrations/prisma/db.ts")).default;
    const all = await db.user.findMany();
    const target = all.find((u: any) => (u.settings as any)?.subscription?.stripeCustomerId === customerId);
    if (!target) return;
    const settings: any = target.settings ?? {};
    settings.subscription = { ...(settings.subscription ?? {}), ...data };
    await db.user.update({ where: { phone: target.phone }, data: { settings } });
  } else {
    if (!users) return;
    const target = Object.values(users).find((u: any) => u.subscription?.stripeCustomerId === customerId);
    if (!target) return;
    target.subscription = { ...(target.subscription ?? {}), ...data };
  }
}
