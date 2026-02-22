// src/app/api/webhooks/stripe/route.ts

import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { db } from "@/lib/firebaseAdmin"
import { getConfig } from "@/lib/config"
import crypto from "crypto"

const COLLECTION = "cartSessions"

export async function POST(req: NextRequest) {
  try {
    console.log("[stripe-webhook] ════════════════════════════════════")
    console.log("[stripe-webhook] 🔔 Webhook ricevuto:", new Date().toISOString())

    const config = await getConfig()
    const stripeAccounts = config.stripeAccounts.filter(
      (a: any) => a.secretKey && a.webhookSecret && a.active
    )

    if (stripeAccounts.length === 0) {
      console.error("[stripe-webhook] ❌ Nessun account Stripe attivo configurato")
      return NextResponse.json({ error: "Config mancante" }, { status: 500 })
    }

    console.log(`[stripe-webhook] 📋 Account attivi: ${stripeAccounts.length}`)

    const body = await req.text()
    const signature = req.headers.get("stripe-signature")

    if (!signature) {
      console.error("[stripe-webhook] ❌ Signature mancante")
      return NextResponse.json({ error: "No signature" }, { status: 400 })
    }

    let event: Stripe.Event | null = null
    let matchedAccount: any = null

    console.log(`[stripe-webhook] 🔍 Verifica signature con ${stripeAccounts.length} account...`)

    for (const account of stripeAccounts) {
      try {
        const stripe = new Stripe(account.secretKey)
        event = stripe.webhooks.constructEvent(body, signature, account.webhookSecret)
        matchedAccount = account
        console.log(`[stripe-webhook] ✅ Signature VALIDA per: ${account.label}`)
        console.log(`[stripe-webhook] 🔑 Webhook Secret: ${account.webhookSecret.substring(0, 20)}...`)
        break
      } catch (err: any) {
        console.log(`[stripe-webhook] ❌ Signature NON valida per ${account.label}: ${err.message}`)
        continue
      }
    }

    if (!event || !matchedAccount) {
      console.error("[stripe-webhook] 💥 NESSUN ACCOUNT HA VALIDATO LA SIGNATURE!")
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
    }

    console.log(`[stripe-webhook] 📨 Evento: ${event.type}`)
    console.log(`[stripe-webhook] 🏦 Account: ${matchedAccount.label}`)

    if (event.type === "payment_intent.succeeded") {
      const paymentIntent = event.data.object as Stripe.PaymentIntent

      console.log(`[stripe-webhook] 💳 Payment Intent ID: ${paymentIntent.id}`)
      console.log(`[stripe-webhook] 💰 Importo: €${(paymentIntent.amount / 100).toFixed(2)}`)
      console.log(`[stripe-webhook] 📋 Metadata:`, JSON.stringify(paymentIntent.metadata, null, 2))

      const sessionId = paymentIntent.metadata?.session_id

      if (!sessionId) {
        console.error("[stripe-webhook] ❌ NESSUN session_id nei metadata!")
        return NextResponse.json({ received: true, warning: "no_session_id" }, { status: 200 })
      }

      console.log(`[stripe-webhook] 🔑 Session ID: ${sessionId}`)

      const snap = await db.collection(COLLECTION).doc(sessionId).get()

      if (!snap.exists) {
        console.error(`[stripe-webhook] ❌ Sessione ${sessionId} NON TROVATA in Firebase`)
        return NextResponse.json({ received: true, error: "session_not_found" }, { status: 200 })
      }

      const sessionData: any = snap.data() || {}

      console.log(`[stripe-webhook] ✅ Sessione trovata`)
      console.log(`[stripe-webhook] 📦 Items: ${sessionData.items?.length || 0}`)
      console.log(`[stripe-webhook] 👤 Cliente: ${sessionData.customer?.email || "N/A"}`)

      if (sessionData.shopifyOrderId) {
        console.log(`[stripe-webhook] ℹ️ Ordine già esistente: #${sessionData.shopifyOrderNumber}`)
        return NextResponse.json({ received: true, alreadyProcessed: true }, { status: 200 })
      }

      console.log("[stripe-webhook] 🚀 CREAZIONE ORDINE SHOPIFY...")

      const result = await createShopifyOrder({
        sessionId,
        sessionData,
        paymentIntent,
        config,
        stripeAccountLabel: matchedAccount.label,
      })

      if (result.orderId) {
        console.log(`[stripe-webhook] 🎉 Ordine creato: #${result.orderNumber} (ID: ${result.orderId})`)

        await db.collection(COLLECTION).doc(sessionId).update({
          shopifyOrderId:       result.orderId,
          shopifyOrderNumber:   result.orderNumber,
          orderCreatedAt:       new Date().toISOString(),
          paymentStatus:        "paid",
          webhookProcessedAt:   new Date().toISOString(),
          stripeAccountUsed:    matchedAccount.label,
          // ← AGGIUNTE PER UPSELL ONE-CLICK
          stripePaymentMethodId: paymentIntent.payment_method ?? null,
          stripeCustomerId: typeof paymentIntent.customer === "string"
            ? paymentIntent.customer
            : null,
        })

        console.log("[stripe-webhook] ✅ Dati salvati in Firebase")
        console.log(`[stripe-webhook] 💳 PaymentMethod: ${paymentIntent.payment_method}`)
        console.log(`[stripe-webhook] 👤 Customer: ${paymentIntent.customer}`)

        // ✅ SALVA STATISTICHE GIORNALIERE
        const today = new Date().toISOString().split("T")[0]
        const statsRef = db.collection("dailyStats").doc(today)

        await db.runTransaction(async (transaction) => {
          const statsDoc = await transaction.get(statsRef)
          if (!statsDoc.exists) {
            transaction.set(statsRef, {
              date: today,
              accounts: {
                [matchedAccount.label]: {
                  totalCents:       paymentIntent.amount,
                  transactionCount: 1,
                },
              },
              totalCents:        paymentIntent.amount,
              totalTransactions: 1,
            })
          } else {
            const data = statsDoc.data()!
            const accountStats = data.accounts?.[matchedAccount.label] || {
              totalCents: 0,
              transactionCount: 0,
            }
            transaction.update(statsRef, {
              [`accounts.${matchedAccount.label}.totalCents`]:       accountStats.totalCents + paymentIntent.amount,
              [`accounts.${matchedAccount.label}.transactionCount`]: accountStats.transactionCount + 1,
              totalCents:        (data.totalCents || 0) + paymentIntent.amount,
              totalTransactions: (data.totalTransactions || 0) + 1,
            })
          }
        })

        console.log("[stripe-webhook] 💾 Statistiche giornaliere aggiornate")

        // ✅ INVIO META CONVERSIONS API
        await sendMetaPurchaseEvent({
          paymentIntent,
          sessionData,
          sessionId,
          orderId:     result.orderId,
          orderNumber: result.orderNumber,
          req,
        })

        // Svuota carrello
        if (sessionData.rawCart?.id) {
          console.log(`[stripe-webhook] 🧹 Svuotamento carrello...`)
          await clearShopifyCart(sessionData.rawCart.id, config)
        }

        console.log("[stripe-webhook] ════════════════════════════════════")
        console.log("[stripe-webhook] ✅ COMPLETATO CON SUCCESSO")
        console.log("[stripe-webhook] ════════════════════════════════════")

        return NextResponse.json({
          received:    true,
          orderId:     result.orderId,
          orderNumber: result.orderNumber,
        }, { status: 200 })

      } else {
        console.error("[stripe-webhook] ❌ Creazione ordine FALLITA")
        return NextResponse.json({ received: true, error: "order_creation_failed" }, { status: 200 })
      }
    }

    console.log(`[stripe-webhook] ℹ️ Evento ${event.type} ignorato`)
    return NextResponse.json({ received: true }, { status: 200 })

  } catch (error: any) {
    console.error("[stripe-webhook] 💥 ERRORE CRITICO:")
    console.error("[stripe-webhook] Messaggio:", error.message)
    console.error("[stripe-webhook] Stack:", error.stack)
    return NextResponse.json({ error: error?.message }, { status: 500 })
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// META CONVERSIONS API
// FIX applicati:
//   1. fbc validato con regex — formato fb.1.<ms>.<fbclid>
//   2. fbp validato con regex — formato fb.1.<ts>.<random>
//   3. event_id usa purchase_${orderNumber} (stesso che userà thank-you fbq)
//   4. value come float con toFixed(2), mai centesimi
//   5. currency sempre uppercase
// ═══════════════════════════════════════════════════════════════════════════════

function buildFbc(
  rawFbc:     string | undefined,
  fbclid:     string | undefined,
  clickTimeRaw: string | undefined
): string | undefined {
  // 1. Cookie già nel formato corretto → usalo direttamente
  if (rawFbc && /^fb\.\d+\.\d{10,}\..+$/.test(rawFbc)) {
    return rawFbc
  }
  // 2. Abbiamo fbclid → costruiamo fbc
  if (fbclid && fbclid.length > 5) {
    let tsMs: number
    if (clickTimeRaw) {
      const parsed = Number(clickTimeRaw)
      tsMs = parsed < 1e11 ? parsed * 1000 : parsed // secondi → ms se necessario
    } else {
      tsMs = Date.now()
    }
    return `fb.1.${tsMs}.${fbclid}`
  }
  // 3. rawFbc esiste ma malformato → ignora, evita errore Meta
  if (rawFbc) {
    console.warn("[stripe-webhook] ⚠️ fbc malformato ignorato:", rawFbc)
  }
  return undefined
}

function buildFbp(rawFbp: string | undefined): string | undefined {
  if (rawFbp && /^fb\.\d+\.\d{10,}\.\d+$/.test(rawFbp)) {
    return rawFbp
  }
  if (rawFbp) {
    console.warn("[stripe-webhook] ⚠️ fbp malformato ignorato:", rawFbp)
  }
  return undefined
}

async function sendMetaPurchaseEvent({
  paymentIntent,
  sessionData,
  sessionId,
  orderId,
  orderNumber,
  req,
}: {
  paymentIntent: any
  sessionData:   any
  sessionId:     string
  orderId:       string | number
  orderNumber:   string | number
  req:           NextRequest
}) {
  const pixelId     = process.env.NEXT_PUBLIC_FB_PIXEL_ID
  const accessToken = process.env.FB_CAPI_ACCESS_TOKEN

  if (!pixelId || !accessToken) {
    console.log("[stripe-webhook] ⚠️ Meta Pixel non configurato (skip CAPI)")
    return
  }

  try {
    console.log("[stripe-webhook] 📊 Invio Meta Conversions API...")

    const customer  = sessionData.customer || {}
    const cartAttrs = sessionData.rawCart?.attributes || {}

    // ── HASH ──────────────────────────────────────────────────────────────────
    const hash = (val: string): string =>
      crypto.createHash("sha256").update(val.toLowerCase().trim()).digest("hex")

    // ── UTM ───────────────────────────────────────────────────────────────────
    const utm = {
      source:    cartAttrs._wt_last_source    || cartAttrs._wt_first_source    || null,
      medium:    cartAttrs._wt_last_medium    || cartAttrs._wt_first_medium    || null,
      campaign:  cartAttrs._wt_last_campaign  || cartAttrs._wt_first_campaign  || null,
      content:   cartAttrs._wt_last_content   || cartAttrs._wt_first_content   || null,
      term:      cartAttrs._wt_last_term      || cartAttrs._wt_first_term      || null,
      fbclid:    cartAttrs._wt_last_fbclid    || cartAttrs._wt_first_fbclid    || null,
      gclid:     cartAttrs._wt_last_gclid     || cartAttrs._wt_first_gclid     || null,
      clickTime: cartAttrs._wt_last_click_time || cartAttrs._wt_first_click_time || null,
    }

    console.log("[stripe-webhook] 📍 UTM:", {
      source:   utm.source   || "N/A",
      campaign: utm.campaign || "N/A",
      fbclid:   utm.fbclid   ? utm.fbclid.slice(0, 12) + "..." : "N/A",
    })

    // ── EVENT ID ──────────────────────────────────────────────────────────────
    // ✅ FIX: purchase_${orderNumber} → stesso che userà thank-you page per deduplica
    const eventId = orderNumber
      ? `purchase_${orderNumber}`
      : `purchase_pi_${paymentIntent.id}`

    console.log("[stripe-webhook] 🎯 Event ID:", eventId)

    const eventTime = Math.floor(Date.now() / 1000) // Unix seconds

    // ── USER DATA ─────────────────────────────────────────────────────────────
    const userData: Record<string, any> = {
      client_ip_address:
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        req.headers.get("x-real-ip") ||
        "0.0.0.0",
      client_user_agent: req.headers.get("user-agent") || "",
    }

    if (customer.email)      userData.em  = hash(customer.email)
    if (customer.phone) {
      const p = customer.phone.replace(/\D/g, "")
      if (p.length >= 8)     userData.ph  = hash(p)
    }
    if (customer.fullName) {
      const parts = customer.fullName.trim().split(/\s+/)
      if (parts[0])          userData.fn  = hash(parts[0])
      if (parts.length > 1)  userData.ln  = hash(parts.slice(1).join(" "))
    }
    if (customer.city)       userData.ct  = hash(customer.city)
    if (customer.postalCode) userData.zp  = hash(customer.postalCode.replace(/\s/g, "").toLowerCase())
    if (customer.countryCode) userData.country = hash(customer.countryCode.toLowerCase().substring(0, 2))

    // ── FBP ───────────────────────────────────────────────────────────────────
    // ✅ FIX: valida formato prima di inviare
    const rawFbp   = cartAttrs._wt_fbp || paymentIntent.metadata?.fbp
    const validFbp = buildFbp(rawFbp)
    if (validFbp) {
      userData.fbp = validFbp
      console.log("[stripe-webhook] 🍪 fbp:", validFbp)
    } else {
      console.log("[stripe-webhook] 🍪 fbp: N/A (non trovato o malformato)")
    }

    // ── FBC ───────────────────────────────────────────────────────────────────
    // ✅ FIX PRINCIPALE: costruisce fbc nel formato fb.1.<ms>.<fbclid>
    const rawFbc   = cartAttrs._wt_fbc || paymentIntent.metadata?.fbc
    const validFbc = buildFbc(rawFbc, utm.fbclid ?? undefined, utm.clickTime ?? undefined)
    if (validFbc) {
      userData.fbc = validFbc
      console.log("[stripe-webhook] 🍪 fbc:", validFbc)
    } else {
      console.log("[stripe-webhook] 🍪 fbc: N/A (nessun fbclid disponibile)")
    }

    // ── CUSTOM DATA ───────────────────────────────────────────────────────────
    // ✅ FIX: value come float, non centesimi
    const value    = parseFloat((paymentIntent.amount / 100).toFixed(2))
    const currency = (paymentIntent.currency || "eur").toUpperCase()

    const customData: Record<string, any> = {
      value,
      currency,
      content_type: "product",
      order_id:     String(orderNumber || orderId),
    }

    if (utm.source)   customData.utm_source   = utm.source
    if (utm.medium)   customData.utm_medium   = utm.medium
    if (utm.campaign) customData.utm_campaign = utm.campaign
    if (utm.content)  customData.utm_content  = utm.content
    if (utm.term)     customData.utm_term     = utm.term

    if (sessionData.items?.length > 0) {
      customData.content_ids = sessionData.items.map((item: any) =>
        String(item.variant_id || item.id)
      )
      customData.num_items = sessionData.items.reduce(
        (sum: number, item: any) => sum + (item.quantity || 1), 0
      )
      customData.contents = sessionData.items.map((item: any) => ({
        id:         String(item.variant_id || item.id),
        quantity:   item.quantity || 1,
        item_price: parseFloat(((item.priceCents || 0) / 100).toFixed(2)),
      }))
    }

    // ── PAYLOAD ───────────────────────────────────────────────────────────────
    const payload = {
      data: [{
        event_name:       "Purchase",
        event_time:       eventTime,
        event_id:         eventId,
        event_source_url: `https://nfrcheckout.com/thank-you?sessionId=${sessionId}`,
        action_source:    "website",
        user_data:        userData,
        custom_data:      customData,
      }],
      access_token: accessToken,
    }

    console.log("[stripe-webhook] 📤 Invio CAPI a Meta...")
    console.log("[stripe-webhook]   event_id:", eventId)
    console.log("[stripe-webhook]   value:   ", value, currency)
    console.log("[stripe-webhook]   source:  ", utm.source   || "direct")
    console.log("[stripe-webhook]   campaign:", utm.campaign || "direct")
    console.log("[stripe-webhook]   fbp:     ", userData.fbp  || "N/A")
    console.log("[stripe-webhook]   fbc:     ", userData.fbc  || "N/A")
    console.log("[stripe-webhook]   em:      ", userData.em   ? "✅ hashed" : "❌ mancante")

    const response = await fetch(
      `https://graph.facebook.com/v18.0/${pixelId}/events`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      }
    )

    const result = await response.json()

    if (response.ok && result.events_received > 0) {
      console.log("[stripe-webhook] ✅ Meta CAPI Purchase OK")
      console.log("[stripe-webhook]   events_received:", result.events_received)
      console.log("[stripe-webhook]   fbtrace_id:     ", result.fbtrace_id)

      try {
        await db.collection(COLLECTION).doc(sessionId).update({
          "tracking.webhook": {
            metaCapi: {
              sent:           true,
              sentAt:         new Date().toISOString(),
              eventId,
              fbtraceId:      result.fbtrace_id,
              eventsReceived: result.events_received,
              value,
              currency,
            },
            utm,
            cookies: {
              fbp: userData.fbp || null,
              fbc: userData.fbc || null,
            },
          },
        })
        console.log("[stripe-webhook] 💾 Tracking salvato su Firebase")
      } catch (e) {
        console.error("[stripe-webhook] ⚠️ Errore salvataggio tracking:", e)
      }

    } else {
      console.error("[stripe-webhook] ❌ Errore Meta CAPI:", JSON.stringify(result, null, 2))
      try {
        await db.collection(COLLECTION).doc(sessionId).update({
          "tracking.webhook.metaCapi": {
            sent:   false,
            sentAt: new Date().toISOString(),
            error:  result?.error?.message || JSON.stringify(result),
          },
        })
      } catch (e) {}
    }

  } catch (error: any) {
    console.error("[stripe-webhook] ⚠️ Errore critico CAPI:", error.message)
    try {
      await db.collection(COLLECTION).doc(sessionId).update({
        "tracking.webhook.metaCapi": {
          sent:          false,
          sentAt:        new Date().toISOString(),
          criticalError: error.message,
        },
      })
    } catch (e) {}
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CREA ORDINE SHOPIFY CON GESTIONE CLIENTI ESISTENTI
// ═══════════════════════════════════════════════════════════════════════════════

async function createShopifyOrder({
  sessionId,
  sessionData,
  paymentIntent,
  config,
  stripeAccountLabel,
}: any) {
  try {
    const shopifyDomain = config.shopify?.shopDomain
    const adminToken    = config.shopify?.adminToken

    console.log("[createShopifyOrder] 🔍 Config Shopify:")
    console.log("[createShopifyOrder] Domain:", shopifyDomain || "❌ MANCANTE")
    console.log("[createShopifyOrder] Token:", adminToken ? "✅ Presente" : "❌ MANCANTE")

    if (!shopifyDomain || !adminToken) {
      console.error("[createShopifyOrder] ❌ Config Shopify mancante")
      return { orderId: null, orderNumber: null }
    }

    const customer = sessionData.customer || {}
    const items    = sessionData.items    || []

    if (items.length === 0) {
      console.error("[createShopifyOrder] ❌ Nessun prodotto nel carrello")
      return { orderId: null, orderNumber: null }
    }

    console.log(`[createShopifyOrder] 📦 Prodotti: ${items.length}`)
    console.log(`[createShopifyOrder] 👤 Cliente: ${customer.email || "N/A"}`)

    // ✅ CERCA CLIENTE ESISTENTE SU SHOPIFY
    let existingCustomerId: number | null = null
    if (customer.email) {
      console.log("[createShopifyOrder] 🔍 Ricerca cliente esistente per email...")
      try {
        const searchResponse = await fetch(
          `https://${shopifyDomain}/admin/api/2024-10/customers/search.json?query=email:${encodeURIComponent(customer.email)}`,
          {
            method:  "GET",
            headers: {
              "Content-Type":          "application/json",
              "X-Shopify-Access-Token": adminToken,
            },
          }
        )
        if (searchResponse.ok) {
          const searchData = await searchResponse.json()
          if (searchData.customers?.length > 0) {
            existingCustomerId = searchData.customers[0].id
            console.log(`[createShopifyOrder] ✅ Cliente esistente trovato: ID ${existingCustomerId}`)
          } else {
            console.log("[createShopifyOrder] ℹ️ Cliente non trovato, verrà creato con l'ordine")
          }
        }
      } catch (searchErr: any) {
        console.log(`[createShopifyOrder] ⚠️ Errore ricerca cliente (proseguo): ${searchErr.message}`)
      }
    }

    let phoneNumber = (customer.phone || "").trim()
    if (!phoneNumber || phoneNumber.length < 5) {
      phoneNumber = "+39 000 0000000"
      console.log("[createShopifyOrder] ⚠️ Telefono mancante, uso fallback")
    }

    const lineItems = items.map((item: any, index: number) => {
      let variantId = item.variant_id || item.id
      if (typeof variantId === "string") {
        if (variantId.includes("gid://")) {
          variantId = variantId.split("/").pop()
        }
        variantId = variantId.replace(/\D/g, "")
      }
      const variantIdNum = parseInt(variantId)
      if (isNaN(variantIdNum) || variantIdNum <= 0) {
        console.error(`[createShopifyOrder] ❌ Variant ID invalido per item ${index + 1}`)
        return null
      }
      const quantity  = item.quantity || 1
      const lineTotal = (item.linePriceCents || item.priceCents * quantity || 0) / 100
      const price     = lineTotal.toFixed(2)
      console.log(`[createShopifyOrder] ${index + 1}. ${item.title} - €${price}`)
      return { variant_id: variantIdNum, quantity, price }
    }).filter((item: any) => item !== null)

    if (lineItems.length === 0) {
      console.error("[createShopifyOrder] ❌ Nessun line item valido")
      return { orderId: null, orderNumber: null }
    }

    const totalAmount = (paymentIntent.amount / 100).toFixed(2)
    console.log(`[createShopifyOrder] 💰 Totale: €${totalAmount}`)

    const nameParts = (customer.fullName || "Cliente Checkout").trim().split(/\s+/)
    const firstName = nameParts[0] || "Cliente"
    const lastName  = nameParts.slice(1).join(" ") || "Checkout"

    const address = {
      first_name:   firstName,
      last_name:    lastName,
      address1:     customer.address1  || "N/A",
      address2:     customer.address2  || "",
      city:         customer.city      || "N/A",
      province:     customer.province  || "",
      zip:          customer.postalCode || "00000",
      country_code: (customer.countryCode || "IT").toUpperCase(),
      phone:        phoneNumber,
    }

    const orderPayload: any = {
      order: {
        email:                   customer.email || "noreply@notforresale.it",
        fulfillment_status:      "unfulfilled",
        financial_status:        "paid",
        send_receipt:            true,
        send_fulfillment_receipt: false,
        line_items:              lineItems,
        shipping_address:        address,
        billing_address:         address,
        shipping_lines: [{
          title: "Spedizione Standard",
          price: "5.90",
          code:  "STANDARD",
        }],
        transactions: [{
          kind:          "sale",
          status:        "success",
          amount:        totalAmount,
          currency:      (paymentIntent.currency || "EUR").toUpperCase(),
          gateway:       `Stripe (${stripeAccountLabel})`,
          authorization: paymentIntent.id,
        }],
        note: `Checkout custom - Session: ${sessionId} - Stripe Account: ${stripeAccountLabel} - Payment Intent: ${paymentIntent.id}`,
        tags: `checkout-custom,stripe-paid,${stripeAccountLabel},automated`,
      },
    }

    if (existingCustomerId) {
      orderPayload.order.customer = { id: existingCustomerId }
      console.log(`[createShopifyOrder] 🔗 Collego ordine al cliente esistente: ${existingCustomerId}`)
    } else {
      orderPayload.order.customer = {
        email:      customer.email || "noreply@notforresale.it",
        first_name: firstName,
        last_name:  lastName,
        phone:      phoneNumber,
      }
      console.log(`[createShopifyOrder] 👤 Creazione nuovo cliente`)
    }

    console.log("[createShopifyOrder] 📤 Invio a Shopify API...")

    const response = await fetch(
      `https://${shopifyDomain}/admin/api/2024-10/orders.json`,
      {
        method:  "POST",
        headers: {
          "Content-Type":          "application/json",
          "X-Shopify-Access-Token": adminToken,
        },
        body: JSON.stringify(orderPayload),
      }
    )

    const responseText = await response.text()

    if (!response.ok) {
      console.error("[createShopifyOrder] ❌ ERRORE API Shopify")
      console.error("[createShopifyOrder] Status:", response.status)
      console.error("[createShopifyOrder] Risposta:", responseText)

      try {
        const errorData = JSON.parse(responseText)
        console.error("[createShopifyOrder] Errori:", JSON.stringify(errorData, null, 2))

        if (
          errorData.errors?.["customer.phone_number"] ||
          errorData.errors?.phone ||
          JSON.stringify(errorData).includes("phone")
        ) {
          console.log("[createShopifyOrder] ⚠️ Errore telefono, riprovo senza campo customer...")
          delete orderPayload.order.customer

          const retryResponse = await fetch(
            `https://${shopifyDomain}/admin/api/2024-10/orders.json`,
            {
              method:  "POST",
              headers: {
                "Content-Type":          "application/json",
                "X-Shopify-Access-Token": adminToken,
              },
              body: JSON.stringify(orderPayload),
            }
          )
          const retryText = await retryResponse.text()
          if (retryResponse.ok) {
            const retryResult = JSON.parse(retryText)
            if (retryResult.order?.id) {
              console.log("[createShopifyOrder] ✅ ORDINE CREATO AL SECONDO TENTATIVO!")
              console.log(`[createShopifyOrder] #${retryResult.order.order_number} (ID: ${retryResult.order.id})`)
              return {
                orderId:     retryResult.order.id,
                orderNumber: retryResult.order.order_number,
              }
            }
          }
        }
      } catch (e) {}

      return { orderId: null, orderNumber: null }
    }

    const result = JSON.parse(responseText)

    if (result.order?.id) {
      console.log("[createShopifyOrder] 🎉 ORDINE CREATO!")
      console.log(`[createShopifyOrder] #${result.order.order_number} (ID: ${result.order.id})`)
      return {
        orderId:     result.order.id,
        orderNumber: result.order.order_number,
      }
    }

    console.error("[createShopifyOrder] ❌ Risposta senza order.id")
    return { orderId: null, orderNumber: null }

  } catch (error: any) {
    console.error("[createShopifyOrder] 💥 ERRORE:", error.message)
    return { orderId: null, orderNumber: null }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SVUOTA CARRELLO
// ═══════════════════════════════════════════════════════════════════════════════

async function clearShopifyCart(cartId: string, config: any) {
  try {
    const shopifyDomain   = config.shopify?.shopDomain
    const storefrontToken = config.shopify?.storefrontToken

    if (!shopifyDomain || !storefrontToken) {
      console.log("[clearShopifyCart] ⚠️ Config mancante, skip")
      return
    }

    const queryCart = `
      query getCart($cartId: ID!) {
        cart(id: $cartId) {
          lines(first: 100) {
            edges { node { id } }
          }
        }
      }
    `

    const cartResponse = await fetch(
      `https://${shopifyDomain}/api/2024-10/graphql.json`,
      {
        method:  "POST",
        headers: {
          "Content-Type":                     "application/json",
          "X-Shopify-Storefront-Access-Token": storefrontToken,
        },
        body: JSON.stringify({ query: queryCart, variables: { cartId } }),
      }
    )

    const cartData = await cartResponse.json()

    if (cartData.errors) {
      console.error("[clearShopifyCart] ❌ Errore query:", cartData.errors)
      return
    }

    const lineIds: string[] =
      cartData.data?.cart?.lines?.edges?.map((edge: any) => edge.node.id) || []

    if (lineIds.length === 0) {
      console.log("[clearShopifyCart] ℹ️ Carrello già vuoto")
      return
    }

    const mutation = `
      mutation cartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
        cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
          cart { id totalQuantity }
          userErrors { field message }
        }
      }
    `

    const removeResponse = await fetch(
      `https://${shopifyDomain}/api/2024-10/graphql.json`,
      {
        method:  "POST",
        headers: {
          "Content-Type":                     "application/json",
          "X-Shopify-Storefront-Access-Token": storefrontToken,
        },
        body: JSON.stringify({ query: mutation, variables: { cartId, lineIds } }),
      }
    )

    const removeData = await removeResponse.json()

    if (removeData.data?.cartLinesRemove?.userErrors?.length > 0) {
      console.error("[clearShopifyCart] ❌ Errori:", removeData.data.cartLinesRemove.userErrors)
    } else {
      console.log("[clearShopifyCart] ✅ Carrello svuotato")
    }

  } catch (error: any) {
    console.error("[clearShopifyCart] ❌ Errore:", error.message)
  }
}
