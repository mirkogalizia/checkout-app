// src/lib/gateway/types.ts

export type GatewayType = "stripe" | "airwallex"

export interface CreatePaymentIntentParams {
  amountCents: number
  currency: string
  sessionId: string
  customer?: {
    fullName?: string
    email?: string
    phone?: string
    address1?: string
    address2?: string
    city?: string
    postalCode?: string
    province?: string
    countryCode?: string
  }
  metadata?: Record<string, string>
}

export interface PaymentIntentResult {
  gatewayType: GatewayType
  intentId: string
  clientSecret: string
  // Stripe-specific
  publishableKey?: string
  accountLabel?: string
  // Airwallex-specific
  airwallexClientId?: string
  airwallexEnvironment?: string
}

export interface GatewayClientConfig {
  gatewayType: GatewayType
  // Stripe
  publishableKey?: string
  accountLabel?: string
  // Airwallex
  clientId?: string
  environment?: string
}

export interface WebhookVerifyResult {
  valid: boolean
  eventType: string
  paymentIntentId?: string
  sessionId?: string
  amount?: number
  currency?: string
  rawEvent?: any
}
