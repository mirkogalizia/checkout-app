// src/lib/config.ts
import { db } from "./firebaseAdmin"

export interface ShopifyConfig {
  shopDomain: string
  adminToken: string
  apiVersion: string
  storefrontToken?: string
}

export interface StripeAccount {
  label: string
  secretKey: string
  webhookSecret: string
  active?: boolean
  order?: number
  merchantSite?: string  // 👈 SITO DEL MERCHANT (es. https://notforresale.it)
}

export interface AppConfig {
  checkoutDomain: string
  shopify: ShopifyConfig
  stripeAccounts: StripeAccount[]
  defaultCurrency?: string
}

const CONFIG_COLLECTION = "config"
const CONFIG_DOC_ID = "global"

const defaultConfig: AppConfig = {
  checkoutDomain: process.env.NEXT_PUBLIC_CHECKOUT_DOMAIN || "",
  defaultCurrency: "eur",

  shopify: {
    shopDomain: process.env.SHOPIFY_SHOP_DOMAIN || "",
    adminToken: process.env.SHOPIFY_ADMIN_TOKEN || "",
    apiVersion: process.env.SHOPIFY_API_VERSION || "2024-10",
    storefrontToken: process.env.SHOPIFY_STOREFRONT_TOKEN || "",
  },

  stripeAccounts: [
    { label: "Account 1", secretKey: "", webhookSecret: "", active: true, order: 0 },
    { label: "Account 2", secretKey: "", webhookSecret: "", active: false, order: 1 },
    { label: "Account 3", secretKey: "", webhookSecret: "", active: false, order: 2 },
    { label: "Account 4", secretKey: "", webhookSecret: "", active: false, order: 3 },
  ],
}

export async function getConfig(): Promise<AppConfig> {
  const ref = db.collection(CONFIG_COLLECTION).doc(CONFIG_DOC_ID)
  const snap = await ref.get()

  if (!snap.exists) {
    return defaultConfig
  }

  const data = snap.data() || {}

  const shopify: ShopifyConfig = {
    shopDomain: data.shopify?.shopDomain || defaultConfig.shopify.shopDomain,
    adminToken: data.shopify?.adminToken || defaultConfig.shopify.adminToken,
    apiVersion: data.shopify?.apiVersion || defaultConfig.shopify.apiVersion,
    storefrontToken:
      data.shopify?.storefrontToken || defaultConfig.shopify.storefrontToken,
  }

  const stripeAccounts: StripeAccount[] = (data.stripeAccounts ||
    defaultConfig.stripeAccounts
  ).map((acc: any, idx: number) => ({
    label: acc?.label || `Account ${idx + 1}`,
    secretKey: acc?.secretKey || "",
    webhookSecret: acc?.webhookSecret || "",
    active: acc?.active ?? (idx === 0), // default: primo attivo
    order: typeof acc?.order === "number" ? acc.order : idx,
    merchantSite: acc?.merchantSite || "", // 👈 letto se presente
  }))

  return {
    checkoutDomain: data.checkoutDomain || defaultConfig.checkoutDomain,
    defaultCurrency: data.defaultCurrency || defaultConfig.defaultCurrency,
    shopify,
    stripeAccounts,
  }
}

export async function setConfig(newConfig: Partial<AppConfig>): Promise<void> {
  const ref = db.collection(CONFIG_COLLECTION).doc(CONFIG_DOC_ID)
  await ref.set(newConfig, { merge: true })
}

/**
 * Helper: restituisce il primo account Stripe attivo.
 * Se non ce n'è nessuno, torna il primo con secretKey non vuota,
 * altrimenti il primo a caso.
 */
export async function getActiveStripeAccount(): Promise<StripeAccount | null> {
  const cfg = await getConfig()
  if (!cfg.stripeAccounts?.length) return null

  const active = cfg.stripeAccounts.find(a => a.active && a.secretKey)
  if (active) return active

  const withKey = cfg.stripeAccounts.find(a => a.secretKey)
  if (withKey) return withKey

  return cfg.stripeAccounts[0]
}