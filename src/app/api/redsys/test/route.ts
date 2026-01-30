export const runtime = "nodejs"
import { NextResponse } from "next/server"
import crypto from "crypto"

function base64UrlEncode(buf: Buffer) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}
function base64UrlEncodeFromString(s: string) {
  return base64UrlEncode(Buffer.from(s, "utf8"))
}
function base64UrlDecodeToBuffer(b64url: string) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4)
  return Buffer.from(b64, "base64")
}

/**
 * Firma Redsys (HMAC-SHA256):
 * - Deriva una key con 3DES usando la secret (base64) e DS_MERCHANT_ORDER
 * - HMAC-SHA256 su MerchantParameters (base64url)
 * - output base64url
 */
function redsysSignature(merchantParamsB64Url: string, order: string, secretKeyB64: string) {
  const secretKey = Buffer.from(secretKeyB64, "base64")
  const iv = Buffer.alloc(8, 0)

  const orderBuf = Buffer.from(order, "utf8")
  const padLen = (8 - (orderBuf.length % 8)) % 8
  const orderPadded = padLen ? Buffer.concat([orderBuf, Buffer.alloc(padLen, 0)]) : orderBuf

  const cipher = crypto.createCipheriv("des-ede3-cbc", secretKey, iv)
  cipher.setAutoPadding(false)
  const key3DES = Buffer.concat([cipher.update(orderPadded), cipher.final()])

  const hmac = crypto.createHmac("sha256", key3DES)
  // HMAC sull’array bytes del base64url-decoded
  hmac.update(base64UrlDecodeToBuffer(merchantParamsB64Url))
  return base64UrlEncode(hmac.digest())
}

export async function POST(req: Request) {
  try {
    const { amountCents = 100, orderId = `TEST${Date.now()}` } = await req.json()

    const merchantCode = process.env.REDSYS_MERCHANT_CODE
    const terminal = process.env.REDSYS_TERMINAL
    const currency = process.env.REDSYS_CURRENCY || "978"
    const secretKey = process.env.REDSYS_SECRET_KEY

    if (!merchantCode || !terminal || !secretKey) {
      return NextResponse.json({ ok: false, error: "Missing env" }, { status: 400 })
    }

    const params = {
      DS_MERCHANT_AMOUNT: String(amountCents),
      DS_MERCHANT_ORDER: String(orderId), // attenzione: Redsys ha vincoli sul formato
      DS_MERCHANT_MERCHANTCODE: merchantCode,
      DS_MERCHANT_CURRENCY: currency,
      DS_MERCHANT_TRANSACTIONTYPE: "0",
      DS_MERCHANT_TERMINAL: String(terminal),
    }

    const merchantParamsB64Url = base64UrlEncodeFromString(JSON.stringify(params))
    const signature = redsysSignature(merchantParamsB64Url, String(orderId), secretKey)

    return NextResponse.json({
      ok: true,
      DS_SIGNATUREVERSION: "HMAC_SHA256_V1",
      DS_MERCHANTPARAMETERS: merchantParamsB64Url,
      DS_SIGNATURE: signature,
      params,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 500 })
  }
}