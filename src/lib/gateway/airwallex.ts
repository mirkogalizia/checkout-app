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

  const body: Record<string, any> = {
    amount: amountDecimal,
    currency: params.currency.toLowerCase(),
    merchant_order_id: params.sessionId,
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
 */
export function verifyAirwallexWebhook(
  body: string,
  signature: string,
  timestamp: string,
  secret: string,
): boolean {
  try {
    const crypto = require("crypto")
    const payload = `${timestamp}${body}`
    const expected = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex")
    return expected === signature
  } catch {
    return false
  }
}
