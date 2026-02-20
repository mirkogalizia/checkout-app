// src/app/api/upsell-charge/route.ts
import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { db } from "@/lib/firebaseAdmin"
import { getConfig } from "@/lib/config"

const COLLECTION = "cartSessions"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { sessionId, variantId, variantTitle, productTitle, priceCents, image } = body

    if (!sessionId || !variantId || !priceCents) {
      return NextResponse.json({ error: "Parametri mancanti" }, { status: 400 })
    }

    // 1. Carica sessione originale da Firestore
    const snap = await db.collection(COLLECTION).doc(sessionId).get()
    if (!snap.exists) {
      return NextResponse.json({ error: "Sessione non trovata" }, { status: 404 })
    }
    const sessionData: any = snap.data()

    // 2. Verifica che l'ordine originale sia stato pagato
    if (sessionData.paymentStatus !== "paid") {
      return NextResponse.json({ error: "Ordine originale non ancora confermato" }, { status: 400 })
    }

    // 3. Verifica che l'upsell non sia già stato addebitato
    if (sessionData.upsellStatus === "paid") {
      return NextResponse.json({ error: "Upsell già addebitato" }, { status: 400 })
    }

    const stripeCustomerId = sessionData.stripeCustomerId
    const stripePaymentMethodId = sessionData.stripePaymentMethodId
    const stripeAccountLabel = sessionData.stripeAccountUsed

    if (!stripeCustomerId || !stripePaymentMethodId) {
      return NextResponse.json({
        error: "Metodo di pagamento non disponibile per questo ordine. Il cliente deve reinserire la carta.",
      }, { status: 400 })
    }

    // 4. Carica account Stripe corretto (quello usato per l'ordine originale)
    const config = await getConfig()
    const stripeAccounts = config.stripeAccounts || []
    const account = stripeAccounts.find((a: any) => a.label === stripeAccountLabel && a.secretKey)
      || stripeAccounts.find((a: any) => a.secretKey && a.active)

    if (!account) {
      return NextResponse.json({ error: "Account Stripe non trovato" }, { status: 500 })
    }

    const stripe = new Stripe(account.secretKey, { apiVersion: "2025-10-29.clover" as any })

    // 5. Addebito off-session
    console.log(`[upsell-charge] 💳 Addebito off-session: €${(priceCents / 100).toFixed(2)}`)
    console.log(`[upsell-charge] Customer: ${stripeCustomerId}`)
    console.log(`[upsell-charge] PaymentMethod: ${stripePaymentMethodId}`)

    const paymentIntent = await stripe.paymentIntents.create({
      amount: priceCents,
      currency: (sessionData.currency || "EUR").toLowerCase(),
      customer: stripeCustomerId,
      payment_method: stripePaymentMethodId,
      confirm: true,
      off_session: true,
      description: `Upsell: ${productTitle} (${variantTitle}) — Ordine #${sessionData.shopifyOrderNumber}`,
      metadata: {
        session_id: sessionId,
        original_order_id: String(sessionData.shopifyOrderId || ""),
        original_order_number: String(sessionData.shopifyOrderNumber || ""),
        upsell: "true",
        product_title: productTitle || "",
        variant_title: variantTitle || "",
      },
      statement_descriptor_suffix: "UPSELL ORDER".slice(0, 22),
    })

    if (paymentIntent.status !== "succeeded") {
      console.error(`[upsell-charge] ❌ Pagamento fallito: ${paymentIntent.status}`)
      return NextResponse.json({
        error: "Pagamento non riuscito. Riprova o contatta il supporto.",
      }, { status: 402 })
    }

    console.log(`[upsell-charge] ✅ Pagamento riuscito: ${paymentIntent.id}`)

    // 6. Aggiungi prodotto all'ordine Shopify esistente
    const shopifyOrderId = sessionData.shopifyOrderId
    const shopifyDomain = config.shopify?.shopDomain
    const adminToken = config.shopify?.adminToken

    let shopifyUpdated = false

    if (shopifyOrderId && shopifyDomain && adminToken) {
      try {
        console.log(`[upsell-charge] 🛍️ Aggiunta prodotto all'ordine Shopify #${sessionData.shopifyOrderNumber}`)

        const upsellPriceStr = (priceCents / 100).toFixed(2)

        // Aggiungi line item all'ordine
        const editRes = await fetch(
          `https://${shopifyDomain}/admin/api/2024-10/orders/${shopifyOrderId}/fulfillments.json`,
          { method: "GET", headers: { "X-Shopify-Access-Token": adminToken } }
        )

        // Usa l'endpoint per aggiungere un line item tramite order edit
        // Shopify non permette di modificare ordini già pagati via REST direttamente,
        // quindi creiamo un secondo ordine separato collegato allo stesso cliente
        const customer = sessionData.customer || {}
        const nameParts = (customer.fullName || "Cliente").split(" ")
        const firstName = nameParts[0]
        const lastName = nameParts.slice(1).join(" ") || "."
        const phoneNumber = customer.phone || "+39 000 0000000"

        const upsellOrderPayload = {
          order: {
            email: customer.email || "",
            fulfillment_status: "unfulfilled",
            financial_status: "paid",
            send_receipt: true,
            send_fulfillment_receipt: false,
            note: `UPSELL post-acquisto — Ordine originale #${sessionData.shopifyOrderNumber} — Session: ${sessionId}`,
            tags: `upsell,checkout-custom,stripe-paid,${stripeAccountLabel}`,

            line_items: [{
              variant_id: parseInt(variantId),
              quantity: 1,
              price: upsellPriceStr,
            }],

            shipping_address: {
              first_name: firstName,
              last_name: lastName,
              address1: customer.address1 || "N/A",
              address2: customer.address2 || "",
              city: customer.city || "N/A",
              province: customer.province || "",
              zip: customer.postalCode || "00000",
              country_code: (customer.countryCode || "IT").toUpperCase(),
              phone: phoneNumber,
            },

            billing_address: {
              first_name: firstName,
              last_name: lastName,
              address1: customer.address1 || "N/A",
              city: customer.city || "N/A",
              zip: customer.postalCode || "00000",
              country_code: (customer.countryCode || "IT").toUpperCase(),
              phone: phoneNumber,
            },

            shipping_lines: [{
              title: "Spedizione inclusa",
              price: "0.00",
              code: "FREE_UPSELL",
            }],

            transactions: [{
              kind: "sale",
              status: "success",
              amount: upsellPriceStr,
              currency: (sessionData.currency || "EUR").toUpperCase(),
              gateway: `Stripe (${stripeAccountLabel})`,
              authorization: paymentIntent.id,
            }],

            // Collega al cliente esistente se disponibile
            ...(sessionData.stripeCustomerId && customer.email ? {
              customer: { email: customer.email }
            } : {}),
          }
        }

        const orderRes = await fetch(
          `https://${shopifyDomain}/admin/api/2024-10/orders.json`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Shopify-Access-Token": adminToken,
            },
            body: JSON.stringify(upsellOrderPayload),
          }
        )

        const orderData = await orderRes.json()

        if (orderRes.ok && orderData.order?.id) {
          shopifyUpdated = true
          console.log(`[upsell-charge] ✅ Ordine upsell Shopify creato: #${orderData.order.order_number}`)

          // Salva su Firestore
          await db.collection(COLLECTION).doc(sessionId).update({
            upsellStatus: "paid",
            upsellPaidAt: new Date().toISOString(),
            upsellPaymentIntentId: paymentIntent.id,
            upsellAmountCents: priceCents,
            upsellProduct: { variantId, variantTitle, productTitle, image },
            upsellShopifyOrderId: orderData.order.id,
            upsellShopifyOrderNumber: orderData.order.order_number,
          })
        } else {
          console.error("[upsell-charge] ❌ Errore creazione ordine Shopify:", orderData)
        }
      } catch (shopifyErr: any) {
        console.error("[upsell-charge] ❌ Errore Shopify:", shopifyErr.message)
      }
    }

    if (!shopifyUpdated) {
      // Pagamento riuscito ma ordine Shopify fallito — salva comunque
      await db.collection(COLLECTION).doc(sessionId).update({
        upsellStatus: "paid",
        upsellPaidAt: new Date().toISOString(),
        upsellPaymentIntentId: paymentIntent.id,
        upsellAmountCents: priceCents,
        upsellProduct: { variantId, variantTitle, productTitle, image },
        upsellShopifyOrderError: "Ordine Shopify non creato - richiede revisione manuale",
      })
    }

    return NextResponse.json({
      success: true,
      paymentIntentId: paymentIntent.id,
      shopifyUpdated,
    })
  } catch (err: any) {
    console.error("[upsell-charge] 💥 Errore:", err)

    // Gestione errore autenticazione carta (carta scaduta, fondamenti insufficienti, ecc.)
    if (err?.type === "StripeCardError" || err?.code === "authentication_required") {
      return NextResponse.json({
        error: "La carta richiede autenticazione aggiuntiva. Impossibile procedere automaticamente.",
        requiresAction: true,
      }, { status: 402 })
    }

    return NextResponse.json({ error: err.message || "Errore interno" }, { status: 500 })
  }
}
