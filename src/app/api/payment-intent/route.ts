// src/app/api/payment-intent/route.ts
import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { db } from "@/lib/firebaseAdmin"
import { getActiveStripeAccount } from "@/lib/stripeRotation"
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
      return NextResponse.json({ error: "sessionId mancante" }, { status: 400 })
    }

    if (typeof amountCents !== "number" || amountCents < 50) {
      return NextResponse.json(
        { error: "Importo non valido (minimo 50 centesimi)" },
        { status: 400 }
      )
    }

    const snap = await db.collection(COLLECTION).doc(sessionId).get()

    if (!snap.exists) {
      return NextResponse.json(
        { error: "Nessun carrello trovato per questa sessione" },
        { status: 404 }
      )
    }

    const data: any = snap.data() || {}
    const currency = (data.currency || "EUR").toString().toLowerCase()

    const existingPaymentIntentId = data.paymentIntentId as string | undefined

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

    // ✅ LOGICA FISSA ACCOUNT PER SESSIONE
    let activeAccount: any
    let shouldCreateNewPI = false

    // Se esiste già un account salvato per questa sessione, USALO
    if (data.sessionStripeAccountLabel && data.sessionStripeAccountSecretKey) {
      console.log(`[payment-intent] ♻️ Riuso account sessione: ${data.sessionStripeAccountLabel}`)
      
      activeAccount = {
        label: data.sessionStripeAccountLabel,
        secretKey: data.sessionStripeAccountSecretKey,
        publishableKey: data.sessionStripeAccountPublishableKey,
        merchantSite: data.sessionMerchantSite || 'https://nfrcheckout.com',
        productTitle1: data.sessionProductTitle1 || '',
        productTitle2: data.sessionProductTitle2 || '',
        productTitle3: data.sessionProductTitle3 || '',
        productTitle4: data.sessionProductTitle4 || '',
        productTitle5: data.sessionProductTitle5 || '',
        productTitle6: data.sessionProductTitle6 || '',
        productTitle7: data.sessionProductTitle7 || '',
        productTitle8: data.sessionProductTitle8 || '',
        productTitle9: data.sessionProductTitle9 || '',
        productTitle10: data.sessionProductTitle10 || '',
        order: data.sessionStripeAccountOrder || 0,
      }
    } else {
      // Prima volta: determina account attivo e SALVALO per tutta la sessione
      console.log('[payment-intent] 🆕 Prima richiesta, determino account attivo')
      activeAccount = await getActiveStripeAccount()
      
      // ✅ SALVA account per questa sessione
      await db.collection(COLLECTION).doc(sessionId).update({
        sessionStripeAccountLabel: activeAccount.label,
        sessionStripeAccountSecretKey: activeAccount.secretKey,
        sessionStripeAccountPublishableKey: activeAccount.publishableKey,
        sessionStripeAccountOrder: activeAccount.order || 0,
        sessionMerchantSite: activeAccount.merchantSite || '',
        sessionProductTitle1: activeAccount.productTitle1 || '',
        sessionProductTitle2: activeAccount.productTitle2 || '',
        sessionProductTitle3: activeAccount.productTitle3 || '',
        sessionProductTitle4: activeAccount.productTitle4 || '',
        sessionProductTitle5: activeAccount.productTitle5 || '',
        sessionProductTitle6: activeAccount.productTitle6 || '',
        sessionProductTitle7: activeAccount.productTitle7 || '',
        sessionProductTitle8: activeAccount.productTitle8 || '',
        sessionProductTitle9: activeAccount.productTitle9 || '',
        sessionProductTitle10: activeAccount.productTitle10 || '',
        sessionCreatedAt: new Date().toISOString(),
      })
      
      console.log(`[payment-intent] ✅ Account fissato per sessione: ${activeAccount.label}`)
    }

    const secretKey = activeAccount.secretKey
    const merchantSite = activeAccount.merchantSite || 'https://nfrcheckout.com'

    const descriptorRaw = activeAccount.label || "NFR"
    const statementDescriptorSuffix =
      descriptorRaw.replace(/[^A-Za-z0-9 ]/g, "").slice(0, 22) || "NFR"

    // Product title random
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

    console.log(`[payment-intent] 🔄 Account: ${activeAccount.label}`)
    console.log(`[payment-intent] 🎲 Product title: ${randomProductTitle}`)
    console.log(`[payment-intent] 💰 Amount: €${(amountCents / 100).toFixed(2)}`)

    // Inizializza Stripe con l'account fisso
    const stripe = new Stripe(secretKey, {
      apiVersion: "2025-10-29.clover",
    })

    // ✅ VERIFICA SE IL PI ESISTE ANCORA
    if (existingPaymentIntentId) {
      try {
        await stripe.paymentIntents.retrieve(existingPaymentIntentId)
        console.log(`[payment-intent] ✓ PaymentIntent esistente trovato: ${existingPaymentIntentId}`)
      } catch (err: any) {
        console.log(`[payment-intent] ⚠️ PI non trovato su questo account, ne creo uno nuovo`)
        shouldCreateNewPI = true
        
        // Rimuovi il vecchio PI ID
        await db.collection(COLLECTION).doc(sessionId).update({
          paymentIntentId: null,
          paymentIntentClientSecret: null,
        })
      }
    }

    // ✅ CREA O OTTIENI CUSTOMER STRIPE
    let stripeCustomerId = data.stripeCustomerId as string | undefined

    if (!stripeCustomerId && email) {
      try {
        const existingCustomers = await stripe.customers.list({
          email: email,
          limit: 1,
        })

        if (existingCustomers.data.length > 0) {
          stripeCustomerId = existingCustomers.data[0].id
          console.log(`[payment-intent] ✓ Customer esistente: ${stripeCustomerId}`)
        } else {
          const customer = await stripe.customers.create({
            email: email,
            name: fullName || undefined,
            phone: phone || undefined,
            address: address1 ? {
              line1: address1,
              line2: address2 || undefined,
              city: city || undefined,
              postal_code: postalCode || undefined,
              state: province || undefined,
              country: countryCode || undefined,
            } : undefined,
            metadata: {
              merchant_site: merchantSite,
              session_id: sessionId,
              stripe_account: activeAccount.label,
            },
          })

          stripeCustomerId = customer.id
          console.log(`[payment-intent] ✓ Nuovo customer: ${stripeCustomerId}`)

          await db.collection(COLLECTION).doc(sessionId).update({
            stripeCustomerId,
          })
        }
      } catch (customerError: any) {
        console.error("[payment-intent] Errore customer:", customerError)
      }
    }

    const orderNumber = data.orderNumber || sessionId
    const description = `${orderNumber} | ${fullName || "Guest"}`

    let shipping: Stripe.PaymentIntentCreateParams.Shipping | undefined

    if (fullName && address1 && city && postalCode) {
      shipping = {
        name: fullName,
        phone: phone || undefined,
        address: {
          line1: address1,
          line2: address2 || undefined,
          city: city,
          postal_code: postalCode,
          state: province,
          country: countryCode,
        },
      }
    }

    let paymentIntent: Stripe.PaymentIntent

    if (existingPaymentIntentId && !shouldCreateNewPI) {
      // ✅ AGGIORNA PaymentIntent esistente
      console.log(`[payment-intent] Aggiornamento PI ${existingPaymentIntentId}`)

      const updateParams: Stripe.PaymentIntentUpdateParams = {
        amount: amountCents,
        customer: stripeCustomerId || undefined,
        description: description,
        receipt_email: email || undefined,
        shipping: shipping,
        metadata: {
          session_id: sessionId,
          merchant_site: merchantSite,
          customer_email: email || "",
          customer_name: fullName || "",
          order_id: orderNumber,
          first_item_title: randomProductTitle,
          stripe_account: activeAccount.label,
          stripe_account_order: String(activeAccount.order || 0),
        },
      }

      paymentIntent = await stripe.paymentIntents.update(
        existingPaymentIntentId,
        updateParams
      )

      console.log(`[payment-intent] ✅ PI aggiornato: ${paymentIntent.id}`)
    } else {
      // ✅ CREA nuovo PaymentIntent
      console.log(`[payment-intent] Creazione nuovo PI`)

      const params: Stripe.PaymentIntentCreateParams = {
        amount: amountCents,
        currency,
        customer: stripeCustomerId || undefined,
        description: description,
        receipt_email: email || undefined,
        statement_descriptor_suffix: statementDescriptorSuffix,
        
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: "always",
        },

        shipping: shipping,

        metadata: {
          session_id: sessionId,
          merchant_site: merchantSite,
          customer_email: email || "",
          customer_name: fullName || "",
          order_id: orderNumber,
          first_item_title: randomProductTitle,
          stripe_account: activeAccount.label,
          stripe_account_order: String(activeAccount.order || 0),
          rotation_timestamp: new Date().toISOString(),
        },
      }

      paymentIntent = await stripe.paymentIntents.create(params)

      console.log(`[payment-intent] ✅ PI creato: ${paymentIntent.id}`)

      await db.collection(COLLECTION).doc(sessionId).update({
        paymentIntentId: paymentIntent.id,
        paymentIntentClientSecret: paymentIntent.client_secret,
      })
    }

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
        accountUsed: activeAccount.label,
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error("[payment-intent] errore:", error)
    return NextResponse.json(
      { error: error?.message || "Errore interno nella creazione del pagamento" },
      { status: 500 }
    )
  }
}
