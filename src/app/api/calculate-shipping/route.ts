// src/app/api/calculate-shipping/route.ts
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/firebaseAdmin"
import { getConfig } from "@/lib/config"

const COLLECTION = "cartSessions"

type Destination = {
  address1?: string
  city: string
  province: string
  postalCode: string
  countryCode: string
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const sessionId = body?.sessionId as string | undefined
    const destination = body?.destination as Destination | undefined

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId mancante" }, { status: 400 })
    }

    if (!destination || !destination.countryCode) {
      return NextResponse.json({ error: "Dati destinazione mancanti" }, { status: 400 })
    }

    const snap = await db.collection(COLLECTION).doc(sessionId).get()

    if (!snap.exists) {
      return NextResponse.json({ error: "Sessione carrello non trovata" }, { status: 404 })
    }

    const data: any = snap.data() || {}

    console.log("[calculate-shipping] Sessione:", {
      sessionId,
      hasRawCart: !!data.rawCart,
      hasItems: !!data.items,
      itemsCount: data.rawCart?.items?.length || data.items?.length,
    })

    let cartItems: any[] = []

    if (Array.isArray(data.rawCart?.items) && data.rawCart.items.length > 0) {
      cartItems = data.rawCart.items
      console.log("[calculate-shipping] ✓ Usando rawCart.items")
    } else if (Array.isArray(data.items) && data.items.length > 0) {
      cartItems = data.items
      console.log("[calculate-shipping] ✓ Usando items array")
    }

    if (cartItems.length === 0) {
      console.error("[calculate-shipping] ✗ Carrello vuoto")
      return NextResponse.json({ error: "Carrello vuoto" }, { status: 400 })
    }

    const cfg = await getConfig()
    const shopifyDomain = cfg.shopify.shopDomain
    const adminToken = cfg.shopify.adminToken

    if (!shopifyDomain || !adminToken) {
      console.error("[calculate-shipping] ✗ Config mancante")
      return NextResponse.json({ error: "Configurazione Shopify mancante" }, { status: 500 })
    }

    console.log(`[calculate-shipping] → Calcolo spedizione per ${destination.city}, ${destination.countryCode}`)

    let shippingRates: any[] | null = null
    try {
      shippingRates = await calculateShippingWithAdmin({
        shopifyDomain,
        adminToken,
        cartItems,
        destination,
      })
    } catch (shippingErr: any) {
      console.warn("[calculate-shipping] ⚠ Errore calcolo spedizione, uso fallback:", shippingErr.message)
    }

    if (!shippingRates || shippingRates.length === 0) {
      console.warn("[calculate-shipping] ⚠ Nessuna tariffa da Shopify, uso fallback")
      
      const fallbackShippingCents = getFallbackShipping(destination.countryCode)
      
      await db.collection(COLLECTION).doc(sessionId).update({
        shippingCents: fallbackShippingCents,
        shippingDestination: destination,
        shippingCalculatedAt: new Date().toISOString(),
        shippingMethod: "Spedizione Standard",
      })

      return NextResponse.json({
        shippingCents: fallbackShippingCents,
        destination,
        method: "Spedizione Standard",
        currency: "EUR",
      })
    }

    shippingRates.sort((a: any, b: any) => parseFloat(a.price) - parseFloat(b.price))

    const selectedRate = shippingRates[0]
    const shippingCents = Math.round(parseFloat(selectedRate.price) * 100)

    console.log(`[calculate-shipping] ✅ ${selectedRate.title} = €${(shippingCents / 100).toFixed(2)}`)

    await db.collection(COLLECTION).doc(sessionId).update({
      shippingCents,
      shippingDestination: destination,
      shippingCalculatedAt: new Date().toISOString(),
      shippingMethod: selectedRate.title,
      shippingHandle: selectedRate.handle,
      availableShippingRates: shippingRates.map((rate: any) => ({
        title: rate.title,
        handle: rate.handle,
        priceCents: Math.round(parseFloat(rate.price) * 100),
      })),
    })

    return NextResponse.json({
      shippingCents,
      destination,
      method: selectedRate.title,
      handle: selectedRate.handle,
      currency: "EUR",
      availableRates: shippingRates.map((rate: any) => ({
        title: rate.title,
        handle: rate.handle,
        priceCents: Math.round(parseFloat(rate.price) * 100),
      })),
    })
  } catch (error: any) {
    console.error("[calculate-shipping] ✗ Errore:", error)
    return NextResponse.json(
      { error: error?.message || "Errore calcolo spedizione" },
      { status: 500 }
    )
  }
}

async function calculateShippingWithAdmin({
  shopifyDomain,
  adminToken,
  destination,
}: {
  shopifyDomain: string
  adminToken: string
  cartItems: any[]
  destination: Destination
}) {
  try {
    console.log(`[calculateShippingWithAdmin] → Lettura shipping zones per ${destination.countryCode}`)

    const res = await fetch(
      `https://${shopifyDomain}/admin/api/2024-10/shipping_zones.json`,
      {
        method: "GET",
        headers: {
          "X-Shopify-Access-Token": adminToken,
        },
      }
    )

    if (!res.ok) {
      throw new Error(`Errore shipping_zones: ${res.status}`)
    }

    const data = await res.json()
    const zones: any[] = data.shipping_zones || []

    const countryUpper = (destination.countryCode || "IT").toUpperCase()

    // Trova la zona che include il paese del cliente
    const matchingZone = zones.find((zone: any) =>
      zone.countries?.some((c: any) => c.code?.toUpperCase() === countryUpper)
    )

    if (!matchingZone) {
      console.warn(`[calculateShippingWithAdmin] ⚠ Nessuna zona trovata per ${countryUpper}`)
      return null
    }

    // Prendi le price-based o weight-based rates dalla zona
    const priceRates: any[] = matchingZone.price_based_shipping_rates || []
    const weightRates: any[] = matchingZone.weight_based_shipping_rates || []
    const carrierRates: any[] = matchingZone.carrier_shipping_rate_providers || []

    const allRates = [
      ...priceRates.map((r: any) => ({ title: r.name, price: r.price, handle: "price" })),
      ...weightRates.map((r: any) => ({ title: r.name, price: r.price, handle: "weight" })),
      ...carrierRates.map((r: any) => ({ title: r.name || "Spedizione", price: "5.90", handle: "carrier" })),
    ]

    if (allRates.length === 0) {
      console.warn(`[calculateShippingWithAdmin] ⚠ Zona trovata ma nessuna tariffa per ${countryUpper}`)
      return null
    }

    console.log(
      `[calculateShippingWithAdmin] ✓ Trovate ${allRates.length} tariffe in zona "${matchingZone.name}":`,
      allRates.map((r: any) => `${r.title}: €${r.price}`)
    )

    return allRates
  } catch (error: any) {
    console.error("[calculateShippingWithAdmin] ✗ Errore:", error)
    throw error
  }
}

function getFallbackShipping(countryCode: string): number {
  const country = countryCode.toUpperCase()
  
  console.log(`[getFallbackShipping] Calcolo fallback per ${country}`)
  
  if (country === "IT") {
    return 590 // 5.90€
  } else if (["FR", "DE", "ES", "AT", "BE", "NL", "PT", "IE", "LU"].includes(country)) {
    return 1000 // 10€
  } else if (["GB", "CH", "NO", "SE", "DK", "FI", "PL", "CZ", "HU"].includes(country)) {
    return 1500 // 15€
  } else {
    return 2000 // 20€
  }
}

