// src/app/api/payment-intent/route.ts
import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { db } from "@/lib/firebaseAdmin"
import { getConfig } from "@/lib/config"

const COLLECTION = "cartSessions"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const sessionId = (body?.sessionId as string | undefined)?.trim()

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId mancante" },
        { status: 400 },
      )
    }

    // 1) Recupera la sessione carrello da Firestore
    const snap = await db.collection(COLLECTION).doc(sessionId).get()

    if (!snap.exists) {
      return NextResponse.json(
        { error: "Nessun carrello trovato per questa sessione" },
        { status: 404 },
      )
    }

    const data = snap.data() || {}

    // Se abbiamo già un PaymentIntent salvato, riusa quello
    if (data.paymentIntentClientSecret) {
      return NextResponse.json(
        { clientSecret: data.paymentIntentClientSecret },
        { status: 200 },
      )
    }

    const currency = (data.currency || "EUR").toString().toLowerCase()

    // Subtotale (già salvato nella sessione dal backend che legge Shopify)
    const subtotalCents =
      typeof data.subtotalCents === "number"
        ? data.subtotalCents
        : typeof data.totals?.subtotal === "number"
        ? data.totals.subtotal
        : typeof data.rawCart?.items_subtotal_price === "number"
        ? data.rawCart.items_subtotal_price
        : 0

    const shippingCents =
      typeof data.shippingCents === "number" ? data.shippingCents : 0

    // Totale: preferisci quello salvato (già scontato) o fallback a sub + shipping
    const totalCents =
      typeof data.totalCents === "number"
        ? data.totalCents
        : subtotalCents + shippingCents

    if (!totalCents || totalCents < 50) {
      return NextResponse.json(
        {
          error:
            "Importo non valido. Verifica il totale ordine prima di procedere al pagamento.",
        },
        { status: 400 },
      )
    }

    // 2) Config + scelta account Stripe attivo
    const cfg = await getConfig()

    const stripeAccounts = Array.isArray(cfg.stripeAccounts)
      ? cfg.stripeAccounts
      : []

    const activeAccounts = stripeAccounts.filter(
      (acc: any) => acc.secretKey && acc.active !== false,
    )

    const selectedStripe: any =
      activeAccounts[0] ||
      stripeAccounts.find((acc: any) => acc.secretKey) ||
      null

    const secretKey =
      selectedStripe?.secretKey || process.env.STRIPE_SECRET_KEY || ""

    if (!secretKey) {
      console.error("[/api/payment-intent] Nessuna Stripe secret key configurata")
      return NextResponse.json(
        { error: "Configurazione Stripe mancante" },
        { status: 500 },
      )
    }

    const merchantSite: string =
      selectedStripe?.merchantSite ||
      cfg.checkoutDomain ||
      "https://checkout-app"

    const stripe = new Stripe(secretKey)

    // 3) Dati cliente (se salvati nella sessione)
    const customer = (data.customer || {}) as {
      firstName?: string
      lastName?: string
      email?: string
      phone?: string
      address1?: string
      address2?: string
      city?: string
      province?: string
      zip?: string
      country?: string
    }

    const fullName = [customer.firstName, customer.lastName]
      .filter(Boolean)
      .join(" ")
      .trim()

    // Costruisci shipping solo se hai abbastanza dati
    const shippingInfo =
      fullName && customer.address1 && customer.city && customer.zip
        ? {
            name: fullName,
            phone: customer.phone || undefined,
            address: {
              line1: customer.address1,
              ...(customer.address2 ? { line2: customer.address2 } : {}),
              city: customer.city,
              postal_code: customer.zip,
              ...(customer.province ? { state: customer.province } : {}),
              country: (customer.country || "IT").toUpperCase(),
            },
          }
        : undefined

    // 4) Crea PaymentIntent SOLO carta, con metadata + shipping
    const params: Stripe.PaymentIntentCreateParams = {
      amount: totalCents,
      currency,
      payment_method_types: ["card"],
      capture_method: "automatic_async",
      metadata: {
        sessionId,
        merchant_site: merchantSite,
      },
    }

    if (customer.email) {
      params.metadata!.customer_email = customer.email
    }
    if (fullName) {
      params.metadata!.customer_name = fullName
    }
    if (shippingInfo) {
      params.shipping = shippingInfo
    }

    const paymentIntent = await stripe.paymentIntents.create(params)

    // 5) Salva info del PaymentIntent dentro alla sessione carrello
    await db.collection(COLLECTION).doc(sessionId).update({
      paymentIntentId: paymentIntent.id,
      paymentIntentClientSecret: paymentIntent.client_secret,
    })

    return NextResponse.json(
      { clientSecret: paymentIntent.client_secret },
      { status: 200 },
    )
  } catch (error: any) {
    console.error("[/api/payment-intent] errore:", error)
    return NextResponse.json(
      {
        error:
          error?.message || "Errore interno nella creazione del pagamento",
      },
      { status: 500 },
    )
  }
}