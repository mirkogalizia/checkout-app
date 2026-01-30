// src/app/api/cart-session/route.ts
import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { db } from "@/lib/firebaseAdmin"

const COLLECTION = "cartSessions"

type ShopifyCartItem = {
  id: number | string
  title: string
  quantity: number
  price: number
  line_price?: number
  image?: string
  variant_title?: string
  token?: string
}

type ShopifyCart = {
  items?: ShopifyCartItem[]
  items_subtotal_price?: number
  total_price?: number
  currency?: string
  token?: string
}

type CheckoutItem = {
  id: string | number
  title: string
  quantity: number
  priceCents: number
  linePriceCents: number
  image?: string
  variantTitle?: string
}

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST,GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  }
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin")
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(origin),
  })
}

export async function POST(req: NextRequest) {
  try {
    const origin = req.headers.get("origin")
    const body = await req.json().catch(() => null)

    if (!body || !body.cart) {
      return new NextResponse(
        JSON.stringify({ error: "Body non valido o cart mancante" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(origin),
          },
        },
      )
    }

    const cart: ShopifyCart = body.cart

    const items: CheckoutItem[] = Array.isArray(cart.items)
      ? cart.items.map(item => {
          const quantity = Number(item.quantity ?? 0)
          const priceCents = Number(item.price ?? 0)
          const linePriceCents =
            typeof item.line_price === "number"
              ? item.line_price
              : priceCents * quantity

          return {
            id: item.id,
            title: item.title,
            quantity,
            priceCents,
            linePriceCents,
            image: item.image,
            variantTitle: item.variant_title,
          }
        })
      : []

    const subtotalFromCart =
      typeof cart.items_subtotal_price === "number"
        ? cart.items_subtotal_price
        : 0

    const subtotalFromItems = items.reduce((sum, item) => {
      return sum + (item.linePriceCents || 0)
    }, 0)

    const subtotalCents =
      subtotalFromCart && subtotalFromCart > 0
        ? subtotalFromCart
        : subtotalFromItems

    const shippingCents = 0

    const totalCents =
      typeof cart.total_price === "number" && cart.total_price > 0
        ? cart.total_price
        : subtotalCents + shippingCents

    const currency = (cart.currency || "EUR").toString().toUpperCase()
    const sessionId = randomUUID()

    // ✅ Costruisci cartId da token
    const cartId = cart.token ? `gid://shopify/Cart/${cart.token}` : undefined

    const docData = {
      sessionId,
      createdAt: new Date().toISOString(),
      currency,
      items,
      subtotalCents,
      shippingCents,
      totalCents,
      paymentMethod: "redsys", // ✅ Solo Redsys
      rawCart: {
        ...cart,
        id: cartId,
      },
    }

    await db.collection(COLLECTION).doc(sessionId).set(docData)

    console.log("✅ Cart session created:", sessionId)

    return new NextResponse(
      JSON.stringify({
        sessionId,
        currency,
        items,
        subtotalCents,
        shippingCents,
        totalCents,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(origin),
        },
      },
    )
  } catch (err) {
    console.error("[cart-session POST] errore:", err)
    return new NextResponse(
      JSON.stringify({
        error: "Errore interno creazione sessione carrello",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(null),
        },
      },
    )
  }
}

export async function GET(req: NextRequest) {
  try {
    const origin = req.headers.get("origin")
    const { searchParams } = new URL(req.url)
    const sessionId = searchParams.get("sessionId")

    if (!sessionId) {
      return new NextResponse(
        JSON.stringify({ error: "sessionId mancante" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(origin),
          },
        },
      )
    }

    const snap = await db.collection(COLLECTION).doc(sessionId).get()

    if (!snap.exists) {
      return new NextResponse(
        JSON.stringify({ error: "Nessun carrello trovato" }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(origin),
          },
        },
      )
    }

    const data = snap.data() || {}

    const currency = (data.currency || "EUR").toString().toUpperCase()
    const items = Array.isArray(data.items) ? data.items : []

    const subtotalCents =
      typeof data.subtotalCents === "number"
        ? data.subtotalCents
        : typeof data.totals?.subtotal === "number"
        ? data.totals.subtotal
        : 0

    const shippingCents =
      typeof data.shippingCents === "number" ? data.shippingCents : 0

    const totalCents =
      typeof data.totalCents === "number"
        ? data.totalCents
        : subtotalCents + shippingCents

    return new NextResponse(
      JSON.stringify({
        sessionId,
        currency,
        items,
        subtotalCents,
        shippingCents,
        totalCents,
        rawCart: data.rawCart || null,
        shopifyOrderNumber: data.shopifyOrderNumber,
        shopifyOrderId: data.shopifyOrderId,
        customer: data.customer,
        shopDomain: data.shopDomain,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(origin),
        },
      },
    )
  } catch (err) {
    console.error("[cart-session GET] errore:", err)
    return new NextResponse(
      JSON.stringify({
        error: "Errore interno lettura sessione carrello",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(null),
        },
      },
    )
  }
}
