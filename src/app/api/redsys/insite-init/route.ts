export const runtime = "nodejs"

import { NextResponse } from "next/server"

function makeOrderId(sessionId: string) {
  const timestamp = Date.now().toString()
  const numPart = timestamp.slice(-4)
  const alphaPart = sessionId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || timestamp.slice(-8)
  return `${numPart}${alphaPart}`.slice(0, 12)
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { sessionId, amountCents, email } = body

    if (!sessionId || !amountCents || amountCents <= 0) {
      return NextResponse.json({ 
        error: "sessionId o amountCents mancante/invalido" 
      }, { status: 400 })
    }

    const merchantCode = process.env.REDSYS_MERCHANT_CODE!
    const terminal = process.env.REDSYS_TERMINAL!
    const isProduction = process.env.REDSYS_ENV === "prod"

    if (!merchantCode || !terminal) {
      return NextResponse.json({ 
        error: "Configurazione Redsys mancante" 
      }, { status: 500 })
    }

    const orderId = makeOrderId(sessionId)

    console.log("✅ InSite init:", { orderId, amount: amountCents, env: isProduction ? 'PROD' : 'TEST' })

    return NextResponse.json({
      fuc: merchantCode,
      terminal,
      orderId,
      scriptUrl: isProduction 
        ? "https://sis.redsys.es/sis/NC/redsysV3.js"
        : "https://sis-t.redsys.es:25443/sis/NC/sandbox/redsysV3.js",
    })
  } catch (e: any) {
    console.error("❌ Errore insite-init:", e)
    return NextResponse.json({ 
      error: e.message || "Errore inizializzazione Redsys" 
    }, { status: 500 })
  }
}
