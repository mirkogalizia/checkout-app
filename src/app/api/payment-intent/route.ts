// src/app/api/payment-intent/route.ts
import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { db } from "@/lib/firebaseAdmin"
import { getConfig } from "@/lib/config"

const COLLECTION = "cartSessions"

type CustomerPayload = {
  fullName?: string
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  address1?: string
  address2?: string
  city?: string
  postalCode?: string
  province?: string
  countryCode?: string
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)

    const sessionId = body?.sessionId as string | undefined
    const amountCents = body?.amountCents as number | undefined
    const customerBody = (body?.customer || {}) as CustomerPayload

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId mancante" },
        { status: 400 },
      )
    }

    if (typeof amountCents !== "number" || amountCents < 50) {
      return NextResponse.json(
        {
          error:
            "Importo non valido o mancante. Assicurati di passare amountCents (in centesimi) dal frontend.",
        },
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
    // 2) Dati cliente SOLO dal body (form checkout)
    // ---------------------------------------------------
    const fullNameRaw =
      customerBody.fullName ||
      `${customerBody.firstName || ""} ${customerBody.lastName || ""}`

    const fullName = (fullNameRaw || "").trim()
    const email = (customerBody.email || "").trim()
    const phone = (customerBody.phone || "").trim()

    const address1 =
      customerBody.address1 || customerBody.address2 || "" // address2 lo usiamo solo come fallback
    const address2 = customerBody.address2 || ""
    const city = customerBody.city || ""
    const postalCode = customerBody.postalCode || ""
    const province = customerBody.province || ""
    const countryCode = customerBody.countryCode || "IT"

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
    // 3) Config Stripe da Firebase (merchantSite, label, ecc.)
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
    // 4) Crea il PaymentIntent con amountCents passato dal frontend
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

    // 5) Salva info del PaymentIntent + cliente in Firestore
    await db.collection(COLLECTION).doc(sessionId).update({
      paymentIntentId: paymentIntent.id,
      paymentIntentClientSecret: paymentIntent.client_secret,
      stripeAccountLabel: firstStripe?.label || null,
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