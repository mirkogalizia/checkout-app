export const runtime = "nodejs"

import { NextResponse } from "next/server"
import crypto from "crypto"

function makeOrderId(sessionId: string) {
  const timestamp = Date.now().toString()
  const numPart = timestamp.slice(-4)
  const alphaPart = sessionId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || timestamp.slice(-8)
  return `${numPart}${alphaPart}`.slice(0, 12)
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { sessionId, amountCents, idOper, customer, billing } = body

    if (!sessionId || !amountCents || !idOper) {
      return NextResponse.json({ 
        error: "Parametri mancanti" 
      }, { status: 400 })
    }

    const merchantCode = process.env.REDSYS_MERCHANT_CODE!
    const terminal = process.env.REDSYS_TERMINAL!
    const secretKey = process.env.REDSYS_SECRET_KEY!
    const isProduction = process.env.REDSYS_ENV === "prod"

    const orderId = makeOrderId(sessionId)

    // ✅ Parametri per trataPeticionREST con idOper
    const params = {
      DS_MERCHANT_AMOUNT: String(amountCents),
      DS_MERCHANT_ORDER: orderId,
      DS_MERCHANT_MERCHANTCODE: merchantCode,
      DS_MERCHANT_CURRENCY: "978",
      DS_MERCHANT_TRANSACTIONTYPE: "0",
      DS_MERCHANT_TERMINAL: terminal,
      DS_MERCHANT_IDOPER: idOper,  // ✅ Usa idOper!
    }

    console.log("💳 Autorizzazione REST con idOper:", { orderId, idOper })

    // Firma
    const paramsBase64 = Buffer.from(JSON.stringify(params)).toString('base64')
    const decodedKey = Buffer.from(secretKey, 'base64')
    const cipher = crypto.createCipheriv('des-ede3-cbc', decodedKey, Buffer.alloc(8, 0))
    const keyEncrypted = cipher.update(orderId, 'utf8', 'base64') + cipher.final('base64')
    const hmac = crypto.createHmac('sha256', Buffer.from(keyEncrypted, 'base64'))
    const signature = hmac.update(paramsBase64).digest('base64')

    // ✅ Chiamata REST trataPeticion
    const restUrl = isProduction
      ? "https://sis.redsys.es/sis/rest/trataPeticionREST"
      : "https://sis-t.redsys.es:25443/sis/rest/trataPeticionREST"

    const restResponse = await fetch(restUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        Ds_SignatureVersion: "HMAC_SHA256_V1",
        Ds_MerchantParameters: paramsBase64,
        Ds_Signature: signature,
      }),
    })

    const restData = await restResponse.json()

    if (!restResponse.ok || restData.errorCode) {
      throw new Error(restData?.errorCode || "Errore autorizzazione")
    }

    // Decodifica risposta
    const responseParams = JSON.parse(
      Buffer.from(restData.Ds_MerchantParameters, 'base64').toString('utf8')
    )

    console.log("✅ Risposta Redsys:", responseParams.Ds_Response)

    if (responseParams.Ds_Response === "0000") {
      // ✅ Pagamento OK
      return NextResponse.json({ 
        ok: true,
        orderId,
        authCode: responseParams.Ds_AuthorisationCode,
      })
    } else {
      throw new Error(`Pagamento rifiutato: ${responseParams.Ds_Response}`)
    }

  } catch (e: any) {
    console.error("❌ Errore pagamento:", e)
    return NextResponse.json({ 
      error: e.message || "Errore pagamento" 
    }, { status: 500 })
  }
}
