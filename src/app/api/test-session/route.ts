// src/app/api/test-session/route.ts
// Endpoint temporaneo per creare sessioni di test — rimuovere dopo i test
import { NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { db } from "@/lib/firebaseAdmin"
import { getConfig } from "@/lib/config"

export async function GET() {
  try {
    const cfg = await getConfig()
    const activeGateway = cfg.activeGateway || "stripe"

    const sessionId = randomUUID()
    const totalCents = 100 // €1.00

    const docData = {
      sessionId,
      createdAt: new Date().toISOString(),
      currency: "EUR",
      items: [
        {
          id: "test-product-1",
          title: "Prodotto Test €1",
          quantity: 1,
          priceCents: 100,
          linePriceCents: 100,
          image: null,
          variantTitle: null,
        },
      ],
      subtotalCents: totalCents,
      shippingCents: 0,
      totalCents,
      gatewayType: activeGateway,
      rawCart: {
        token: null,
        attributes: {},
      },
      customer: null,
      shopDomain: null,
      discountCode: null,
      isTest: true,
    }

    await db.collection("cartSessions").doc(sessionId).set(docData)

    const checkoutUrl = `${process.env.NEXT_PUBLIC_CHECKOUT_DOMAIN || ""}/checkout?sessionId=${sessionId}`

    console.log(`[test-session] ✓ Sessione test creata: ${sessionId} (gateway: ${activeGateway})`)

    return NextResponse.json({
      sessionId,
      checkoutUrl,
      gatewayType: activeGateway,
      totalCents,
      message: `Sessione test da €1 creata con gateway: ${activeGateway}`,
    })
  } catch (err: any) {
    console.error("[test-session] error:", err)
    return NextResponse.json(
      { error: err.message || "Errore creazione sessione test" },
      { status: 500 },
    )
  }
}
