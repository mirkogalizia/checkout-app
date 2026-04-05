// src/app/api/airwallex-update-intent/route.ts
import { NextRequest, NextResponse } from "next/server"
import { getConfig } from "@/lib/config"
import { db } from "@/lib/firebaseAdmin"

const BASE_URLS = {
  demo: "https://api-demo.airwallex.com",
  prod: "https://api.airwallex.com",
}

let cachedToken: { token: string; expiresAt: number } | null = null

async function getAuthToken(config: any): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token

  const baseUrl = BASE_URLS[config.environment as "demo" | "prod"]
  const res = await fetch(`${baseUrl}/api/v1/authentication/login`, {
    method: "POST",
    headers: {
      "x-client-id": config.clientId,
      "x-api-key": config.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  })
  if (!res.ok) throw new Error(`Airwallex auth failed: ${res.status}`)
  const data = await res.json()
  cachedToken = { token: data.token, expiresAt: Date.now() + 25 * 60 * 1000 }
  return data.token
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { intentId, newAmountCents, sessionId } = body

    if (!intentId || !newAmountCents || !sessionId) {
      return NextResponse.json({ error: "Parametri mancanti" }, { status: 400 })
    }

    const config = await getConfig()
    if (!config.airwallex?.clientId || !config.airwallex?.apiKey) {
      return NextResponse.json({ error: "Airwallex non configurato" }, { status: 500 })
    }

    const token = await getAuthToken(config.airwallex)
    const baseUrl = BASE_URLS[config.airwallex.environment]

    const res = await fetch(`${baseUrl}/api/v1/pa/payment_intents/${intentId}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: newAmountCents / 100,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error("[airwallex-update-intent] Errore:", err)
      return NextResponse.json({ error: "Aggiornamento PI fallito" }, { status: 500 })
    }

    // Aggiorna Firebase con il nuovo totale
    await db.collection("cartSessions").doc(sessionId).update({
      totalCents: newAmountCents,
      updatedAt: new Date().toISOString(),
    })

    return NextResponse.json({ success: true, newAmountCents })
  } catch (err: any) {
    console.error("[airwallex-update-intent] Errore:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
