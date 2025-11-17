// src/app/api/config/route.ts
import { NextRequest, NextResponse } from "next/server"
import { getConfig, setConfig, AppConfig, StripeAccount, ShopifyConfig } from "@/lib/config"

export async function GET() {
  try {
    const cfg = await getConfig()

    // ✅ Normalizza stripeAccounts per garantire tutti i campi
    const normalizedAccounts = (cfg.stripeAccounts || []).map((acc: any, index: number) => ({
      label: acc.label || `Account ${index + 1}`,
      secretKey: "", // Non inviare al client
      publishableKey: acc.publishableKey || "",
      webhookSecret: "", // Non inviare al client
      active: acc.active ?? false,
      order: acc.order ?? index,
      merchantSite: acc.merchantSite || "",
      lastUsedAt: acc.lastUsedAt || 0,
    }))

    const safeCfg = {
      ...cfg,
      stripeAccounts: normalizedAccounts,
    }

    console.log("[config GET] ✓ Config inviata al client (secrets nascosti)")
    return NextResponse.json(safeCfg)
  } catch (err: any) {
    console.error("[config GET] error:", err)
    return NextResponse.json(
      { error: err.message || "Errore nel recupero config" },
      { status: 500 },
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    console.log("[config POST] ✓ Payload ricevuto")

    // ✅ Shopify Config
    const shopify: ShopifyConfig = {
      shopDomain: (body.shopify?.shopDomain || body.shopifyDomain || "").trim(),
      adminToken: (body.shopify?.adminToken || body.shopifyAdminToken || "").trim(),
      apiVersion: (body.shopify?.apiVersion || "2024-10").trim(),
      storefrontToken: (body.shopify?.storefrontToken || body.shopifyStorefrontToken || "").trim(),
    }

    // ✅ Carica config esistente per preservare lastUsedAt
    const existingConfig = await getConfig()
    const existingAccounts = existingConfig.stripeAccounts || []

    // ✅ Stripe Accounts con TUTTI i campi
    const stripeAccounts: StripeAccount[] = (body.stripeAccounts || [])
      .slice(0, 4)
      .map((acc: any, idx: number) => {
        const existingAccount = existingAccounts[idx]

        const normalized = {
          label: (acc.label || `Account ${idx + 1}`).trim(),
          secretKey: (acc.secretKey || "").trim(),
          publishableKey: (acc.publishableKey || "").trim(), // ✅ IMPORTANTE
          webhookSecret: (acc.webhookSecret || "").trim(),
          active: !!acc.active,
          order: typeof acc.order === "number" ? acc.order : idx,
          merchantSite: (acc.merchantSite || "").trim(),
          lastUsedAt: acc.lastUsedAt ?? existingAccount?.lastUsedAt ?? 0, // ✅ PRESERVA O INIZIALIZZA
        }

        console.log(`[config POST] Account ${idx} normalizzato:`, {
          label: normalized.label,
          hasSecretKey: !!normalized.secretKey,
          hasPublishableKey: !!normalized.publishableKey,
          hasWebhook: !!normalized.webhookSecret,
          active: normalized.active,
          lastUsedAt: normalized.lastUsedAt,
        })

        return normalized
      })

    // ✅ Config completa
    const newCfg: Partial<AppConfig> = {
      checkoutDomain: (body.checkoutDomain || "").trim(),
      defaultCurrency: (body.defaultCurrency || "eur").toLowerCase(),
      shopify,
      stripeAccounts,
    }

    // ✅ Salva su Firebase
    await setConfig(newCfg)

    console.log("[config POST] ✓ Configurazione salvata su Firebase")

    // ✅ Verifica salvataggio
    const verifiedConfig = await getConfig()
    console.log("[config POST] ✓ Verifica primo account:", {
      label: verifiedConfig.stripeAccounts?.[0]?.label,
      hasPublishableKey: !!verifiedConfig.stripeAccounts?.[0]?.publishableKey,
      lastUsedAt: verifiedConfig.stripeAccounts?.[0]?.lastUsedAt,
    })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error("[config POST] error:", err)
    return NextResponse.json(
      { error: err.message || "Errore nel salvataggio config" },
      { status: 500 },
    )
  }
}
