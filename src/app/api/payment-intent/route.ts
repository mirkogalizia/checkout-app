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
    const shopifyOrderId = body?.shopifyOrderId as string | undefined // 🔥 NUOVO
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

    // 🔥 Recupera sessione esistente
    const snap = await db.collection(COLLECTION).doc(sessionId).get()
    if (!snap.exists) {
      return NextResponse.json(
        { error: "Nessun carrello trovato per questa sessione" },
        { status: 404 }
      )
    }

    const data: any = snap.data() || {}
    const currency = (data.currency || "EUR").toString().toLowerCase()

    // 🔥 Estrai dati cliente
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

    // 🔥 Recupera account Stripe attivo
    const activeAccount = await getActiveStripeAccount()
    const secretKey = activeAccount.secretKey
    const publishableKey = activeAccount.publishableKey
    const merchantSite = activeAccount.merchantSite || "https://nfrcheckout.com"

    const descriptorRaw = activeAccount.label || "NFR"
    const statementDescriptorSuffix =
      `${descriptorRaw.replace(/[^A-Za-z0-9 ]/g, "").slice(0, 18)} ORDER`.slice(
        0,
        22
      )

    // 🔥 Product title random DA FIREBASE CONFIG (come originale)
    const productTitles: string[] = []
    for (let i = 1; i <= 10; i++) {
      const key = `productTitle${i}` as keyof typeof activeAccount
      const title = activeAccount[key]
      if (title && typeof title === "string" && title.trim()) {
        productTitles.push(title.trim())
      }
    }
    const randomProductTitle =
      productTitles.length > 0
        ? productTitles[Math.floor(Math.random() * productTitles.length)]
        : "NFR Product"

    console.log(`[payment-intent] 🔄 Account attivo: ${activeAccount.label}`)

    // 🔥 Inizializza Stripe
    const stripe = new Stripe(secretKey, {
      apiVersion: "2025-10-29.clover",
    })

    // 🔥 VERIFICA SE ESISTE GIÀ UN PAYMENT INTENT
    const existingPaymentIntentId = data.paymentIntentId as string | undefined

    if (existingPaymentIntentId) {
      try {
        console.log(`[payment-intent] 🔄 Verifico PI esistente: ${existingPaymentIntentId}`)
        
        const existingPI = await stripe.paymentIntents.retrieve(existingPaymentIntentId)

        // Se il PI è ancora utilizzabile
        if (
          existingPI.status === "requires_payment_method" ||
          existingPI.status === "requires_confirmation" ||
          existingPI.status === "requires_action"
        ) {
          // Verifica se l'amount è cambiato
          if (existingPI.amount === amountCents) {
            console.log(`[payment-intent] ♻️ Riuso PI esistente (amount invariato)`)
            
            return NextResponse.json(
              {
                id: existingPI.id,
                clientSecret: existingPI.client_secret,
                publishableKey: publishableKey,
                accountUsed: activeAccount.label,
              },
              { status: 200 }
            )
          } else {
            // Amount cambiato → UPDATE
            console.log(
              `[payment-intent] 🔄 UPDATE PI (€${existingPI.amount / 100} → €${amountCents / 100})`
            )

            const updatedPI = await stripe.paymentIntents.update(existingPaymentIntentId, {
              amount: amountCents,
              metadata: {
                ...existingPI.metadata,
                amount_updated: "true",
                updated_at: new Date().toISOString(),
                shopify_order_id: shopifyOrderId || existingPI.metadata.shopify_order_id,
              },
            })

            await db.collection(COLLECTION).doc(sessionId).update({
              totalCents: amountCents,
              paymentIntentUpdated: true,
              updatedAt: new Date().toISOString(),
            })

            return NextResponse.json(
              {
                id: updatedPI.id,
                clientSecret: updatedPI.client_secret,
                publishableKey: publishableKey,
                accountUsed: activeAccount.label,
              },
              { status: 200 }
            )
          }
        } else {
          console.log(
            `[payment-intent] ⚠️ PI esistente non riutilizzabile (status: ${existingPI.status}), creo nuovo`
          )
        }
      } catch (retrieveError: any) {
        console.log(
          `[payment-intent] ⚠️ Errore retrieve PI: ${retrieveError.message}, creo nuovo`
        )
      }
    }

    // 🔥 CREA NUOVO PAYMENT INTENT

    // 🔥 CREA O OTTIENI CUSTOMER
    let stripeCustomerId = data.stripeCustomerId as string | undefined

    if (!stripeCustomerId && email) {
      try {
        const existingCustomers = await stripe.customers.list({
          email,
          limit: 1,
        })

        if (existingCustomers.data.length > 0) {
          stripeCustomerId = existingCustomers.data[0].id
          console.log(`[payment-intent] ♻️ Customer esistente: ${stripeCustomerId}`)
        } else {
          const customer = await stripe.customers.create({
            email,
            name: fullName || undefined,
            phone: phone || undefined,
            address: address1
              ? {
                  line1: address1,
                  line2: address2 || undefined,
                  city: city || undefined,
                  postal_code: postalCode || undefined,
                  state: province || undefined,
                  country: countryCode || undefined,
                }
              : undefined,
            metadata: {
              merchant_site: merchantSite,
              session_id: sessionId,
              stripe_account: activeAccount.label,
            },
          })

          stripeCustomerId = customer.id
          console.log(`[payment-intent] 🆕 Customer creato: ${stripeCustomerId}`)

          await db.collection(COLLECTION).doc(sessionId).update({
            stripeCustomerId,
          })
        }
      } catch (customerError: any) {
        console.error("[payment-intent] ❌ Errore customer:", customerError.message)
      }
    }

    const orderNumber = shopifyOrderId || data.orderNumber || sessionId
    const description = `${orderNumber} | ${fullName || "Guest"}`

    // 🔥 Shipping
    let shipping: Stripe.PaymentIntentCreateParams.Shipping | undefined
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

    // 🔥 IP e User-Agent per Radar
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown"

    const userAgent = req.headers.get("user-agent") || "unknown"

    // 🔥 PARAMETRI PAYMENT INTENT
    const params: Stripe.PaymentIntentCreateParams = {
      amount: amountCents,
      currency,
      capture_method: "automatic",
      customer: stripeCustomerId || undefined,
      description,
      receipt_email: email || undefined,
      statement_descriptor_suffix: statementDescriptorSuffix,

      // 🔥 SUPPORTA TUTTI I METODI DI PAGAMENTO
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: "always",
      },

      // 🔥 3DS FORZATO PER CARTE
      payment_method_options: {
        card: {
          request_three_d_secure: "any",
        },
      },

      // 📦 Shipping (usato da Radar)
      shipping,

      // 🔒 METADATA ANTIFRODE COMPLETI
      metadata: {
        session_id: sessionId,
        merchant_site: merchantSite,
        order_id: orderNumber,
        shopify_order_id: shopifyOrderId || orderNumber, // 🔥 NUOVO

        // 🔥 Product title random DA CONFIG
        first_item_title: randomProductTitle,

        // 🧠 Dati cliente
        customer_email: email || "",
        customer_name: fullName || "",
        customer_phone: phone || "",

        // 📦 Address matching
        shipping_address: address1 || "",
        shipping_city: city || "",
        shipping_postal_code: postalCode || "",
        shipping_country: countryCode,

        // 🕵️‍♂️ Identificazione
        stripe_account: activeAccount.label,
        stripe_account_order: String(activeAccount.order || 0),
        checkout_type: "custom",

        // 📅 Timestamp
        created_at: new Date().toISOString(),

        // 🔥 Antifrode tecnico
        customer_ip: clientIp,
        user_agent: userAgent,
      },
    }

    console.log(`[payment-intent] 🆕 Creazione PI per €${amountCents / 100}`)

    // 🔥 CREA PAYMENT INTENT
    const paymentIntent = await stripe.paymentIntents.create(params)

    console.log(`[payment-intent] ✅ PI creato: ${paymentIntent.id}`)

    // 🔥 SALVA IN FIREBASE
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
      paymentIntentId: paymentIntent.id,
      items: data.items || [],
      subtotalCents: data.subtotalCents,
      shippingCents: 590,
      totalCents: amountCents,
      currency: currency.toUpperCase(),
      shopifyOrderNumber: orderNumber,
      shopifyOrderId: shopifyOrderId || null, // 🔥 NUOVO
      stripeAccountUsed: activeAccount.label,
      stripeCustomerId: stripeCustomerId,
      clientIp: clientIp,
      updatedAt: new Date().toISOString(),
    })

    return NextResponse.json(
      {
        id: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
        publishableKey: publishableKey,
        accountUsed: activeAccount.label,
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error("[payment-intent] ❌ Errore:", error)
    return NextResponse.json(
      { error: error?.message || "Errore interno del server" },
      { status: 500 }
    )
  }
}
