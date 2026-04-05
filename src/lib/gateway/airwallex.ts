// src/lib/gateway/airwallex.ts
import { AirwallexConfig } from "../config"
import { CreatePaymentIntentParams, PaymentIntentResult, GatewayClientConfig } from "./types"

const BASE_URLS = {
  demo: "https://api-demo.airwallex.com",
  prod: "https://api.airwallex.com",
}

let cachedToken: { token: string; expiresAt: number } | null = null

/**
 * Ottiene un bearer token da Airwallex.
 * Il token dura 30 minuti — lo cacchiamo in memoria.
 */
async function getAuthToken(config: AirwallexConfig): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token
  }

  const baseUrl = BASE_URLS[config.environment]
  const res = await fetch(`${baseUrl}/api/v1/authentication/login`, {
    method: "POST",
    headers: {
      "x-client-id": config.clientId,
      "x-api-key": config.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error("[airwallex] Auth failed:", err)
    throw new Error(`Airwallex auth failed: ${res.status}`)
  }

  const data = await res.json()
  const token = data.token
  // Cache per 25 minuti (token dura 30)
  cachedToken = { token, expiresAt: Date.now() + 25 * 60 * 1000 }
  return token
}

/**
 * Crea un PaymentIntent su Airwallex.
 */
export async function createAirwallexPaymentIntent(
  config: AirwallexConfig,
  params: CreatePaymentIntentParams,
): Promise<PaymentIntentResult> {
  const token = await getAuthToken(config)
  const baseUrl = BASE_URLS[config.environment]

  const requestId = crypto.randomUUID()
  const amountDecimal = params.amountCents / 100

  // merchant_order_id deve essere univoco per ogni PI — aggiungiamo il requestId
  // Il session_id va in metadata così il webhook lo trova sempre
  const merchantOrderId = `${params.sessionId}-${requestId.slice(0, 8)}`

  const body: Record<string, any> = {
    amount: amountDecimal,
    currency: params.currency.toLowerCase(),
    merchant_order_id: merchantOrderId,
    request_id: requestId,
    metadata: {
      session_id: params.sessionId,
      ...params.metadata,
    },
  }

  // Ordine: se c'è un customer con email, aggiungiamolo
  if (params.customer?.email) {
    body.customer = {
      email: params.customer.email,
      first_name: params.customer.fullName?.split(" ")[0] || "",
      last_name: params.customer.fullName?.split(" ").slice(1).join(" ") || "",
      phone_number: params.customer.phone || undefined,
    }
  }

  const res = await fetch(`${baseUrl}/api/v1/pa/payment_intents/create`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error("[airwallex] Create PI failed:", err)
    throw new Error(`Airwallex create PI failed: ${res.status}`)
  }

  const data = await res.json()

  console.log(`[airwallex] ✅ PI created: ${data.id} | amount: ${amountDecimal} ${params.currency}`)

  return {
    gatewayType: "airwallex",
    intentId: data.id,
    clientSecret: data.client_secret,
    airwallexClientId: config.clientId,
    airwallexEnvironment: config.environment,
  }
}

/**
 * Ritorna la config client-side per inizializzare il Drop-in Airwallex.
 */
export function getAirwallexClientConfig(config: AirwallexConfig): GatewayClientConfig {
  return {
    gatewayType: "airwallex",
    clientId: config.clientId,
    environment: config.environment,
  }
}

/**
 * Verifica la signature di un webhook Airwallex.
 * Prova tutti i formati documentati e ritorna { isValid, format } per debug.
 */
export function verifyAirwallexWebhook(
  body: string,
  signature: string,
  timestamp: string,
  secret: string,
): { isValid: boolean; format: string } {
  const crypto = require("crypto")

  // Timestamp in secondi (nel caso Airwallex mandi ms)
  const timestampSec = timestamp.length > 10
    ? String(Math.floor(Number(timestamp) / 1000))
    : timestamp

  // Prova anche con il secret base64-decodificato
  let secretBuffer: Buffer | null = null
  try {
    secretBuffer = Buffer.from(secret, "base64")
  } catch {}

  const payloads: { label: string; payload: string }[] = [
    { label: "timestamp_ms+body",      payload: `${timestamp}${body}` },
    { label: "timestamp_ms.body",      payload: `${timestamp}.${body}` },
    { label: "timestamp_sec+body",     payload: `${timestampSec}${body}` },
    { label: "timestamp_sec.body",     payload: `${timestampSec}.${body}` },
    { label: "body-only",              payload: body },
  ]

  const encodings: ("hex" | "base64")[] = ["hex", "base64"]
  const secrets: { label: string; key: string | Buffer }[] = [
    { label: "raw",    key: secret },
    ...(secretBuffer ? [{ label: "b64decoded", key: secretBuffer }] : []),
  ]

  for (const { label: enc } of encodings.map(e => ({ label: e }))) {
    for (const { label: secLabel, key } of secrets) {
      for (const { label: payLabel, payload } of payloads) {
        const expected = crypto.createHmac("sha256", key).update(payload).digest(enc as any)
        if (expected === signature) {
          return { isValid: true, format: `${payLabel}|secret:${secLabel}|enc:${enc}` }
        }
      }
    }
  }

  // Log debug
  console.error("[airwallex-verify] signature received (full length):", signature.length, "chars")
  console.error("[airwallex-verify] received:", signature)
  console.error("[airwallex-verify] timestamp:", timestamp, "→ sec:", timestampSec)
  console.error("[airwallex-verify] secret length:", secret.length)
  console.error("[airwallex-verify] expected (timestamp_ms+body, hex):",
    crypto.createHmac("sha256", secret).update(`${timestamp}${body}`).digest("hex")
  )
  console.error("[airwallex-verify] expected (timestamp_ms+body, base64):",
    crypto.createHmac("sha256", secret).update(`${timestamp}${body}`).digest("base64")
  )

  return { isValid: false, format: "none" }
}

/**
 * @deprecated - usa verifyAirwallexWebhook che ritorna { isValid, format }
 */
export function verifyAirwallexWebhookBodyOnly(
  body: string,
  signature: string,
  secret: string,
): boolean {
  const crypto = require("crypto")
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex")
  return expected === signature
}
