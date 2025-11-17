// src/app/api/webhooks/stripe/route.ts
import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { db } from "@/lib/firebaseAdmin"
import { getConfig } from "@/lib/config"

const COLLECTION = "cartSessions"

export async function POST(req: NextRequest) {
  try {
    const config = await getConfig()
    const stripeAccounts = config.stripeAccounts.filter(
      (a) => a.secretKey && a.webhookSecret
    )

    if (stripeAccounts.length === 0) {
      console.error("[stripe-webhook] Nessun account Stripe configurato")
      return NextResponse.json({ error: "Config mancante" }, { status: 500 })
    }

    const body = await req.text()
    const signature = req.headers.get("stripe-signature")

    if (!signature) {
      return NextResponse.json({ error: "No signature" }, { status: 400 })
    }

    // Prova ogni account per verificare signature
    let event: Stripe.Event | null = null
    let matchedAccount: any = null

    for (const account of stripeAccounts) {
      try {
        const stripe = new Stripe(account.secretKey)
        event = stripe.webhooks.constructEvent(
          body,
          signature,
          account.webhookSecret
        )
        matchedAccount = account
        console.log(`[stripe-webhook] ✓ Signature valida: ${account.label}`)
        break
      } catch (err) {
        continue
      }
    }

    if (!event || !matchedAccount) {
      console.error("[stripe-webhook] Signature non valida")
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
    }

    console.log(`[stripe-webhook] Evento: ${event.type} (${matchedAccount.label})`)

    // PAYMENT INTENT SUCCEEDED
    if (event.type === "payment_intent.succeeded") {
      const paymentIntent = event.data.object as Stripe.PaymentIntent
      const sessionId = paymentIntent.metadata?.session_id

      if (!sessionId) {
        return NextResponse.json({ received: true }, { status: 200 })
      }

      const snap = await db.collection(COLLECTION).doc(sessionId).get()
      if (!snap.exists) {
        return NextResponse.json({ received: true }, { status: 200 })
      }

      const sessionData: any = snap.data() || {}

      if (sessionData.shopifyOrderId) {
        console.log(`[stripe-webhook] Ordine già creato: ${sessionData.shopifyOrderId}`)
        return NextResponse.json(
          { received: true, alreadyProcessed: true },
          { status: 200 }
        )
      }

      // CREA ORDINE SHOPIFY
      const result = await createShopifyOrder({
        sessionId,
        sessionData,
        paymentIntent,
        config,
        stripeAccountLabel: matchedAccount.label,
      })

      if (result.orderId) {
        await db.collection(COLLECTION).doc(sessionId).update({
          shopifyOrderId: result.orderId,
          shopifyOrderNumber: result.orderNumber,
          orderCreatedAt: new Date().toISOString(),
          paymentStatus: "paid",
        })

        // SVUOTA CARRELLO SHOPIFY
        if (sessionData.rawCart?.id) {
          await clearShopifyCart(sessionData.rawCart.id, config)
        }
      }
    }

    return NextResponse.json({ received: true }, { status: 200 })
  } catch (error: any) {
    console.error("[stripe-webhook] Errore:", error)
    return NextResponse.json({ error: error?.message }, { status: 500 })
  }
}

async function createShopifyOrder({
  sessionId,
  sessionData,
  paymentIntent,
  config,
  stripeAccountLabel,
}: any) {
  try {
    const shopifyDomain = config.shopify?.shopDomain
    const adminToken = config.shopify?.adminToken

    if (!shopifyDomain || !adminToken) {
      console.error("[createShopifyOrder] Config Shopify mancante")
      return { orderId: null, orderNumber: null }
    }

    const customer = sessionData.customer || {}
    const items = sessionData.items || []

    if (items.length === 0) {
      console.error("[createShopifyOrder] Nessun item")
      return { orderId: null, orderNumber: null }
    }

    const lineItems = items.map((item: any) => {
      let variantId = item.variant_id || item.id
      if (typeof variantId === "string" && variantId.startsWith("gid://")) {
        variantId = variantId.split("/").pop()
      }

      return {
        variant_id: variantId,
        quantity: item.quantity || 1,
        price: ((item.linePriceCents || 0) / 100).toFixed(2),
      }
    })

    const totalCents = paymentIntent.amount

    const orderPayload = {
      order: {
        email: customer.email,
        fulfillment_status: "unfulfilled",
        financial_status: "paid",

        line_items: lineItems,

        customer: {
          email: customer.email,
          first_name: customer.fullName?.split(" ")[0] || "",
          last_name: customer.fullName?.split(" ").slice(1).join(" ") || "",
          phone: customer.phone,
        },

        shipping_address: {
          first_name: customer.fullName?.split(" ")[0] || "",
          last_name: customer.fullName?.split(" ").slice(1).join(" ") || "",
          address1: customer.address1,
          address2: customer.address2 || "",
          city: customer.city,
          province: customer.province,
          zip: customer.postalCode,
          country_code: customer.countryCode || "IT",
          phone: customer.phone,
        },

        billing_address: {
          first_name: customer.fullName?.split(" ")[0] || "",
          last_name: customer.fullName?.split(" ").slice(1).join(" ") || "",
          address1: customer.address1,
          address2: customer.address2 || "",
          city: customer.city,
          province: customer.province,
          zip: customer.postalCode,
          country_code: customer.countryCode || "IT",
          phone: customer.phone,
        },

        shipping_lines: [
          {
            title: "Spedizione Standard",
            price: "5.90",
            code: "STANDARD",
          },
        ],

        transactions: [
          {
            kind: "sale",
            status: "success",
            amount: (totalCents / 100).toFixed(2),
            gateway: `Stripe (${stripeAccountLabel})`,
            authorization: paymentIntent.id,
          },
        ],

        note: `Checkout custom - Session: ${sessionId} - Stripe: ${stripeAccountLabel}`,
        tags: `checkout-custom, stripe-paid, ${stripeAccountLabel}`,
      },
    }

    const response = await fetch(
      `https://${shopifyDomain}/admin/api/2024-10/orders.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": adminToken,
        },
        body: JSON.stringify(orderPayload),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[createShopifyOrder] Errore:", response.status, errorText)
      return { orderId: null, orderNumber: null }
    }

    const result = await response.json()

    if (result.order?.id) {
      console.log(
        `[createShopifyOrder] ✅ Ordine #${result.order.order_number} (${result.order.id})`
      )
      return {
        orderId: result.order.id,
        orderNumber: result.order.order_number,
      }
    }

    return { orderId: null, orderNumber: null }
  } catch (error: any) {
    console.error("[createShopifyOrder] Errore:", error)
    return { orderId: null, orderNumber: null }
  }
}

async function clearShopifyCart(cartId: string, config: any) {
  try {
    const shopifyDomain = config.shopify?.shopDomain
    const storefrontToken = config.shopify?.storefrontToken

    if (!shopifyDomain || !storefrontToken) {
      return
    }

    // Prima ottieni line IDs
    const queryCart = `
      query getCart($cartId: ID!) {
        cart(id: $cartId) {
          lines(first: 100) {
            edges {
              node {
                id
              }
            }
          }
        }
      }
    `

    const cartResponse = await fetch(
      `https://${shopifyDomain}/api/2024-10/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Storefront-Access-Token": storefrontToken,
        },
        body: JSON.stringify({
          query: queryCart,
          variables: { cartId },
        }),
      }
    )

    const cartData = await cartResponse.json()
    const lineIds =
      cartData.data?.cart?.lines?.edges?.map((edge: any) => edge.node.id) || []

    if (lineIds.length === 0) {
      console.log("[clearShopifyCart] Già vuoto")
      return
    }

    // Rimuovi linee
    const mutation = `
      mutation cartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
        cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
          cart {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `

    await fetch(`https://${shopifyDomain}/api/2024-10/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token": storefrontToken,
      },
      body: JSON.stringify({
        query: mutation,
        variables: { cartId, lineIds },
      }),
    })

    console.log(`[clearShopifyCart] ✅ Carrello svuotato`)
  } catch (error: any) {
    console.error("[clearShopifyCart] Errore:", error)
  }
}
