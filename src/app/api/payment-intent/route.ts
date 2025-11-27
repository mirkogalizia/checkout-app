// src/app/api/payment-intent/route.ts
import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { db } from "@/lib/firebaseAdmin"
import { getActiveStripeAccount } from "@/lib/stripeRotation"

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
      return NextResponse.json({ error: "sessionId mancante" }, { status: 400 })
    }

    if (typeof amountCents !== "number" || amountCents < 50) {
      return NextResponse.json(
        { error: "Importo non valido (minimo 50 centesimi)" },
        { status: 400 }
      )
    }

    // Carica sessione carrello
    const snap = await db.collection(COLLECTION).doc(sessionId).get()
    if (!snap.exists) {
      return NextResponse.json(
        { error: "Nessun carrello trovato per questa sessione" },
        { status: 404 }
      )
    }

    const data: any = snap.data() || {}
    const currency = (data.currency || "EUR").toString().toLowerCase()

    // Normalizzazione customer
    const fullNameRaw =
      customerBody.fullName ||
      `${customerBody.firstName || ""} ${customerBody.lastName || ""}`.trim()

    const fullName = fullNameRaw || ""
    const email = (customerBody.email || "").trim()
    const phone = (customerBody.phone || "").trim()
    const address1 = customerBody.address1 || ""
    const address2 = customerBody.address2 || ""
    const city = customerBody.city || ""
    const postalCode = customerBody.postalCode || ""
    const province = customerBody.province || ""
    const countryCode = (customerBody.countryCode || "IT").toUpperCase()

    // Recupero account stripe attivo
    const activeAccount = await getActiveStripeAccount()

    const secretKey = activeAccount.secretKey
    const publishableKey = activeAccount.publishableKey
    const merchantSite = activeAccount.merchantSite || 'https://nfrcheckout.com'
    const descriptorRaw = activeAccount.label || "NFR"

    const statementDescriptorSuffix =
      descriptorRaw.replace(/[^A-Za-z0-9 ]/g, "").slice(0, 22) || "NFR"

    // Product title random (NON MODIFICARE - richiesta utente)
    const productTitles: string[] = []
    for (let i = 1; i <= 10; i++) {
      const key = `productTitle${i}` as keyof typeof activeAccount
      const title = activeAccount[key]
      if (title && typeof title === 'string' && title.trim()) {
        productTitles.push(title.trim())
      }
    }
    const randomProductTitle = productTitles.length
      ? productTitles[Math.floor(Math.random() * productTitles.length)]
      : 'NFR Product'

    const stripe = new Stripe(secretKey)
    

    // --- CREA O OTTIENI CUSTOMER ---
    let stripeCustomerId = data.stripeCustomerId as string | undefined

    if (!stripeCustomerId && email) {
      try {
        const existing = await stripe.customers.list({ email, limit: 1 })
        if (existing.data.length > 0) {
          stripeCustomerId = existing.data[0].id
        } else {
          const customer = await stripe.customers.create({
            email,
            name: fullName || undefined,
            phone: phone || undefined,
            address: address1
              ? {
                  line1: address1,
                  line2: address2 || undefined,
                  city,
                  postal_code: postalCode,
                  state: province,
                  country: countryCode,
                }
              : undefined,
            metadata: {
              merchant_site: merchantSite,
              session_id: sessionId,
              stripe_account: activeAccount.label,
            },
          })
          stripeCustomerId = customer.id
          await db.collection(COLLECTION).doc(sessionId).update({
            stripeCustomerId,
          })
        }
      } catch (e) {
        console.error("Errore customer:", e)
      }
    }

    const orderNumber = data.orderNumber || sessionId
    const description = `${orderNumber} | ${fullName || "Guest"}`

    let shipping
    if (fullName && address1 && city && postalCode) {
      shipping = {
        name: fullName,
        phone: phone || undefined,
        address: {
          line1: address1,
          line2: address2 || undefined,
          city,
          postal_code: postalCode,
          state: province,
          country: countryCode,
        },
      }
    }

    // --- 🔥 LOGICA CRITICA: RIUTILIZZA PAYMENT INTENT ---
    let paymentIntentId = data.paymentIntentId as string | undefined
    let paymentIntent

    if (paymentIntentId) {
      try {
        paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)

        // SE È ANCORA VALIDO → UPDATE
        if (
          paymentIntent.status === "requires_payment_method" ||
          paymentIntent.status === "requires_confirmation"
        ) {
          paymentIntent = await stripe.paymentIntents.update(paymentIntentId, {
            amount: amountCents,
            currency,
            customer: stripeCustomerId || undefined,
            shipping,
            metadata: {
              ...paymentIntent.metadata,
              amount_updated_at: new Date().toISOString(),
            },
          })
        }
      } catch {
        paymentIntent = null
      }
    }

    // --- SE NON ESISTE O È INVALIDO → CREANE UNO NUOVO ---
    if (!paymentIntent) {
      const params: Stripe.PaymentIntentCreateParams = {
        amount: amountCents,
        currency,
        customer: stripeCustomerId || undefined,
        description,
        receipt_email: email || undefined,
        statement_descriptor_suffix: statementDescriptorSuffix,

        // 🔥 MIGLIORE APPROVAZIONE
        automatic_payment_methods: { enabled: true },

        shipping,

        metadata: {
          session_id: sessionId,
          merchant_site: merchantSite,
          customer_email: email || "",
          customer_name: fullName || "",
          order_id: orderNumber,
          first_item_title: randomProductTitle,
          stripe_account: activeAccount.label,
          stripe_account_order: String(activeAccount.order || 0),
          created_at: new Date().toISOString(),
        },
      }

      paymentIntent = await stripe.paymentIntents.create(params)

      // Salva PI nella sessione Firebase
      await db.collection(COLLECTION).doc(sessionId).update({
        paymentIntentId: paymentIntent.id,
      })
    }

    // --- Aggiorna dati customer ---
    await db.collection(COLLECTION).doc(sessionId).update({
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
      {
        clientSecret: paymentIntent.client_secret,
        publishableKey,
        accountUsed: activeAccount.label,
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error("[payment-intent] errore:", error)
    return NextResponse.json(
      { error: error?.message || "Errore interno" },
      { status: 500 }
    )
  }
}