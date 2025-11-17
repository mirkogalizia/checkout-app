// src/app/api/payment-intent/route.ts
import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { db } from "@/lib/firebaseAdmin"
import { getConfig } from "@/lib/config"

const COLLECTION = "cartSessions"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const sessionId = body?.sessionId as string | undefined

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

    const data: any = snap.data() || {}

    // Se abbiamo già un PaymentIntent salvato, riusa quello
    if (data.paymentIntentClientSecret) {
      return NextResponse.json(
        { clientSecret: data.paymentIntentClientSecret },
        { status: 200 },
      )
    }

    const currency = (data.currency || "EUR").toString().toLowerCase()

    // ---------------------------------------------------
    // 2) Calcolo importo basato sui dati Shopify
    // ---------------------------------------------------
    const subtotalCents =
      typeof data.subtotalCents === "number"
        ? data.subtotalCents
        : typeof data.totals?.subtotal === "number"
        ? data.totals.subtotal
        : 0

    const shippingCents =
      typeof data.shippingCents === "number" ? data.shippingCents : 0

    const totalFromSession =
      typeof data.totalCents === "number" ? data.totalCents : 0

    const rawCart = data.rawCart || {}

    let totalFromRawCart = 0
    if (typeof rawCart.total_price === "number") {
      totalFromRawCart = rawCart.total_price
    } else if (typeof rawCart.total_price === "string") {
      const parsed = parseInt(rawCart.total_price, 10)
      if (!Number.isNaN(parsed)) {
        totalFromRawCart = parsed
      }
    }

    // PRIORITÀ:
    // 1) totale Shopify (sconti + spedizione)
    // 2) totalCents salvato in sessione
    // 3) subtotal + shipping
    let amountCents = 0

    if (totalFromRawCart > 0) {
      amountCents = totalFromRawCart
    } else if (totalFromSession > 0) {
      amountCents = totalFromSession
    } else {
      amountCents = subtotalCents + shippingCents
    }

    if (!amountCents || amountCents < 50) {
      console.warn("[/api/payment-intent] amountCents non valido:", {
        subtotalCents,
        shippingCents,
        totalFromSession,
        totalFromRawCart,
        amountCents,
      })

      return NextResponse.json(
        {
          error:
            "Importo non valido. Verifica il totale ordine prima di procedere al pagamento.",
        },
        { status: 400 },
      )
    }

    // ---------------------------------------------------
    // 3) Dati cliente (da Firestore + dal body, se presenti)
    // ---------------------------------------------------
    const customerFromDb = (data.customer || {}) as any
    const customerFromBody = (body?.customer || {}) as any

    // il body (dalla form del checkout) override-a eventuali dati in Firestore
    const customer = { ...customerFromDb, ...customerFromBody }

    const fullNameRaw =
      customer.fullName ||
      `${customer.firstName || ""} ${customer.lastName || ""}`

    const fullName = (fullNameRaw || "").trim()
    const email = (customer.email || customer.contactEmail || "").trim()
    const phone = (customer.phone || "").trim()

    // shipping address: usiamo i campi classici della form
    const address1 =
      customer.address1 || customer.address || customer.street || ""
    const address2 = customer.address2 || ""
    const city = customer.city || ""
    const postalCode = customer.postalCode || customer.zip || ""
    const province = customer.province || customer.state || ""
    const countryCode = customer.countryCode || customer.country || "IT"

    // Prepariamo shipping SOLO se abbiamo almeno un minimo di dati
    let shipping: Stripe.PaymentIntentCreateParams.Shipping | undefined =
      undefined

    if (fullName || address1 || city || postalCode) {
      shipping = {
        name: fullName || " ",
        phone: phone || undefined,
        address: {
          line1: address1 || " ",
          line2: address2 || undefined,
          city: city || undefined,
          postal_code: postalCode || undefined,
          state: province || undefined,
          country: countryCode || undefined,
        },
      }
    }

    // ---------------------------------------------------
    // 4) Config Stripe da Firebase (merchantSite, label, ecc.)
    // ---------------------------------------------------
    const cfg = await getConfig()

    const stripeAccounts = Array.isArray(cfg.stripeAccounts)
      ? cfg.stripeAccounts.filter((a: any) => a.secretKey)
      : []

    const firstStripe = stripeAccounts[0] || null

    const secretKey =
      firstStripe?.secretKey || process.env.STRIPE_SECRET_KEY || ""

    if (!secretKey) {
      console.error(
        "[/api/payment-intent] Nessuna Stripe secret key configurata",
      )
      return NextResponse.json(
        { error: "Configurazione Stripe mancante" },
        { status: 500 },
      )
    }

    const merchantSite: string =
      (firstStripe as any)?.merchantSite ||
      cfg.checkoutDomain ||
      "https://notforresale.it"

    const descriptorRaw = (firstStripe as any)?.label || "NFR"
    const statementDescriptorSuffix =
      descriptorRaw.replace(/[^A-Za-z0-9 ]/g, "").slice(0, 22) || "NFR"

    const stripe = new Stripe(secretKey)

    // descrizione ordine (simile a CarShield: "orderId | customer")
    const firstItemTitle =
      Array.isArray(data.items) && data.items[0]?.title
        ? String(data.items[0].title)
        : ""

    const descriptionParts: string[] = []
    if (data.orderNumber) {
      descriptionParts.push(String(data.orderNumber))
    } else {
      descriptionParts.push(sessionId)
    }
    if (fullName) {
      descriptionParts.push(fullName)
    }
    const description = descriptionParts.join(" | ")

    // ---------------------------------------------------
    // 5) Crea PaymentIntent SOLO CARTA, con metadata e shipping
    // ---------------------------------------------------
    const params: Stripe.PaymentIntentCreateParams = {
      amount: amountCents,
      currency,
      payment_method_types: ["card"],

      metadata: {
        sessionId,
        merchant_site: merchantSite,
        customer_email: email || "",
        customer_name: fullName || "",
        first_item_title: firstItemTitle,
      },

      // come CarShield: suffisso tipo "NFR"
      statement_descriptor_suffix: statementDescriptorSuffix,
    }

    if (shipping) {
      params.shipping = shipping
    }

    if (email) {
      params.receipt_email = email
    }

    if (description) {
      params.description = description
    }

    const paymentIntent = await stripe.paymentIntents.create(params)

    // ---------------------------------------------------
    // 6) Salva info del PaymentIntent dentro alla sessione carrello
    // ---------------------------------------------------
    await db.collection(COLLECTION).doc(sessionId).update({
      paymentIntentId: paymentIntent.id,
      paymentIntentClientSecret: paymentIntent.client_secret,
      stripeAccountLabel: firstStripe?.label || null,
      // utile avere anche una copia dei dati cliente lato server
      customer: {
        fullName,
        email,
        phone,
        address1,
        address2,
        city,
        postalCode,
        province,
        countryCode,
      },
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
          error?.message ||
          "Errore interno nella creazione del pagamento",
      },
      { status: 500 },
    )
  }
}