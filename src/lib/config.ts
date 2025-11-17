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
  publishableKey: string      // ✅ AGGIUNTO
  webhookSecret: string
  active?: boolean
  order?: number
  merchantSite?: string
  lastUsedAt?: number         // ✅ AGGIUNTO per rotazione
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
    { 
      label: "Account 1", 
      secretKey: "", 
      publishableKey: "",     // ✅ AGGIUNTO
      webhookSecret: "", 
      active: true, 
      order: 0,
      merchantSite: "",
      lastUsedAt: 0,          // ✅ AGGIUNTO
    },
    { 
      label: "Account 2", 
      secretKey: "", 
      publishableKey: "",     // ✅ AGGIUNTO
      webhookSecret: "", 
      active: false, 
      order: 1,
      merchantSite: "",
      lastUsedAt: 0,          // ✅ AGGIUNTO
    },
    { 
      label: "Account 3", 
      secretKey: "", 
      publishableKey: "",     // ✅ AGGIUNTO
      webhookSecret: "", 
      active: false, 
      order: 2,
      merchantSite: "",
      lastUsedAt: 0,          // ✅ AGGIUNTO
    },
    { 
      label: "Account 4", 
      secretKey: "", 
      publishableKey: "",     // ✅ AGGIUNTO
      webhookSecret: "", 
      active: false, 
      order: 3,
      merchantSite: "",
      lastUsedAt: 0,          // ✅ AGGIUNTO
    },
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

  // ✅ Normalizza stripeAccounts con TUTTI i campi
  const stripeAccounts: StripeAccount[] = (data.stripeAccounts ||
    defaultConfig.stripeAccounts
  ).map((acc: any, idx: number) => ({
    label: acc?.label || `Account ${idx + 1}`,
    secretKey: acc?.secretKey || "",
    publishableKey: acc?.publishableKey || "",           // ✅ AGGIUNTO
    webhookSecret: acc?.webhookSecret || "",
    active: acc?.active ?? (idx === 0),
    order: typeof acc?.order === "number" ? acc.order : idx,
    merchantSite: acc?.merchantSite || "",
    lastUsedAt: acc?.lastUsedAt || 0,                    // ✅ AGGIUNTO
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
  
  // ✅ Assicura che stripeAccounts abbia tutti i campi prima di salvare
  if (newConfig.stripeAccounts) {
    newConfig.stripeAccounts = newConfig.stripeAccounts.map((acc: any, idx: number) => ({
      label: acc?.label || `Account ${idx + 1}`,
      secretKey: acc?.secretKey || "",
      publishableKey: acc?.publishableKey || "",         // ✅ GARANTITO
      webhookSecret: acc?.webhookSecret || "",
      active: acc?.active ?? false,
      order: typeof acc?.order === "number" ? acc.order : idx,
      merchantSite: acc?.merchantSite || "",
      lastUsedAt: acc?.lastUsedAt ?? 0,                  // ✅ GARANTITO
    }))
  }

  await ref.set(newConfig, { merge: true })
  
  console.log("[setConfig] ✓ Config salvata su Firebase")
}

/**
 * Helper: restituisce il primo account Stripe attivo.
 * Se non ce n'è nessuno, torna il primo con secretKey non vuota,
 * altrimenti il primo a caso.
 */
export async function getActiveStripeAccount(): Promise<StripeAccount | null> {
  const cfg = await getConfig()
  if (!cfg.stripeAccounts?.length) return null

  // Cerca account attivo con secretKey
  const active = cfg.stripeAccounts.find(
    a => a.active && a.secretKey && a.publishableKey  // ✅ Verifica anche publishableKey
  )
  if (active) {
    console.log(`[getActiveStripeAccount] ✓ Account attivo: ${active.label}`)
    return active
  }

  // Fallback: primo con secretKey
  const withKey = cfg.stripeAccounts.find(
    a => a.secretKey && a.publishableKey              // ✅ Verifica anche publishableKey
  )
  if (withKey) {
    console.log(`[getActiveStripeAccount] ⚠ Fallback a primo account con keys: ${withKey.label}`)
    return withKey
  }

  console.log(`[getActiveStripeAccount] ⚠ Nessun account valido, ritorno primo`)
  return cfg.stripeAccounts[0]
}
