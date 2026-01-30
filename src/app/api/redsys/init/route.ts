export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { createRedsysAPI, SANDBOX_URLS, PRODUCTION_URLS, type RedirectInputParams } from "redsys-easy"

function makeOrderId(sessionId: string) {
  const timestamp = Date.now().toString()
  const numPart = timestamp.slice(-4)
  const alphaPart = sessionId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || timestamp.slice(-8)
  return `${numPart}${alphaPart}`.slice(0, 12)
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const sessionId = String(body.sessionId || "")
    const amountCents = Number(body.amountCents ?? 0)

    if (!sessionId || amountCents <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 })
    }

    const merchantCode = process.env.REDSYS_MERCHANT_CODE!
    const terminal = process.env.REDSYS_TERMINAL!
    const secretKey = process.env.REDSYS_SECRET_KEY!
    const isProduction = process.env.REDSYS_ENV === "prod"
    
    const redsysAPI = createRedsysAPI({
      secretKey,
      urls: isProduction ? PRODUCTION_URLS : SANDBOX_URLS,
    })
    
    const orderId = makeOrderId(sessionId)
    
    // ✅ Usa i tipi corretti della libreria
    const merchantParams: RedirectInputParams = {
      DS_MERCHANT_AMOUNT: String(amountCents),
      DS_MERCHANT_ORDER: orderId,
      DS_MERCHANT_MERCHANTCODE: merchantCode,
      DS_MERCHANT_CURRENCY: "978",
      DS_MERCHANT_TRANSACTIONTYPE: "0" as const, // ✅ Type assertion
      DS_MERCHANT_TERMINAL: terminal,
      DS_MERCHANT_MERCHANTURL: "https://checkout-app-redsys-git-main-mario-potabiles-projects.vercel.app/api/redsys/notification",
      DS_MERCHANT_URLOK: "https://checkout-app-redsys-git-main-mario-potabiles-projects.vercel.app/thank-you",
      DS_MERCHANT_URLKO: "https://checkout-app-redsys-git-main-mario-potabiles-projects.vercel.app/checkout?payment=failed",
    }

    const { body: formData } = redsysAPI.createRedirectForm(merchantParams)

    return NextResponse.json({
      ok: true,
      redsys: {
        url: isProduction ? PRODUCTION_URLS.redirect : SANDBOX_URLS.redirect,
        Ds_SignatureVersion: formData.Ds_SignatureVersion,
        Ds_MerchantParameters: formData.Ds_MerchantParameters,
        Ds_Signature: formData.Ds_Signature,
        orderId,
      },
    })
  } catch (e: any) {
    console.error("Error:", e)
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
