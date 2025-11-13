// src/lib/config.ts

export type StripeAccount = {
  label?: string
  secretKey: string        // sk_...
  webhookSecret?: string   // whsec_...
}

export type AppConfig = {
  shopifyDomain: string
  shopifyToken: string
  shopifyApiVersion: string
  shopifyStorefrontToken?: string
  checkoutDomain: string
  stripeAccounts: StripeAccount[]
}

// Stato in-memory (MVP). In futuro si può sostituire con DB/file.
let current: AppConfig = {
  shopifyDomain: process.env.SHOPIFY_STORE_DOMAIN || '',
  shopifyToken: process.env.SHOPIFY_ADMIN_TOKEN || '',
  shopifyApiVersion: process.env.SHOPIFY_API_VERSION || '2024-10',
  shopifyStorefrontToken: process.env.SHOPIFY_STOREFRONT_TOKEN || '',
  checkoutDomain: process.env.NEXT_PUBLIC_CHECKOUT_DOMAIN || 'http://localhost:3000',
  stripeAccounts: [],
}

// helper per pulire stringhe (niente spazi/accapo strani)
const squeeze = (s?: string) => (s ?? '').trim().replace(/\s+/g, '')

export function getConfig(): AppConfig {
  return current
}

export function setConfig(next: Partial<AppConfig>) {
  const incomingAccounts = (next.stripeAccounts ?? current.stripeAccounts ?? [])

  const normalizedAccounts: StripeAccount[] = incomingAccounts
    .filter(Boolean)
    .map((a) => ({
      label: a.label?.trim() || undefined,
      secretKey: squeeze(a.secretKey),
      webhookSecret: squeeze(a.webhookSecret),
    }))
    .filter((a) => a.secretKey)               // tieni solo se ha una sk_
    .slice(0, 4)                              // max 4 account

  current = {
    ...current,
    shopifyDomain: next.shopifyDomain ?? current.shopifyDomain,
    shopifyToken: squeeze(next.shopifyToken ?? current.shopifyToken),
    shopifyApiVersion: next.shopifyApiVersion ?? current.shopifyApiVersion,
    shopifyStorefrontToken: squeeze(next.shopifyStorefrontToken ?? current.shopifyStorefrontToken),
    checkoutDomain: next.checkoutDomain ?? current.checkoutDomain,
    stripeAccounts: normalizedAccounts,
  }

  console.log('[config] updated. Stripe accounts:', current.stripeAccounts.length)
}