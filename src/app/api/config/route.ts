// src/app/api/config/route.ts
import { NextRequest, NextResponse } from "next/server"
import { getConfig, setConfig, AppConfig, StripeAccount, ShopifyConfig } from "@/lib/config"

export async function GET() {
  try {
    const cfg = await getConfig()

    // non mandiamo i secret in chiaro al client
    const safeCfg: AppConfig = {
      ...cfg,
      stripeAccounts: cfg.stripeAccounts.map((acc: StripeAccount) => ({
        ...acc,
        secretKey: "",
        webhookSecret: "",
      })),
    }

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

    const shopify: ShopifyConfig = {
      shopDomain: (body.shopify?.shopDomain || body.shopifyDomain || "").trim(),
      adminToken:
        (body.shopify?.adminToken || body.shopifyAdminToken || "").trim(),
      apiVersion:
        (body.shopify?.apiVersion || "2024-10").trim(),
      storefrontToken:
        (body.shopify?.storefrontToken || body.shopifyStorefrontToken || "").trim(),
    }

    const stripeAccounts: StripeAccount[] = (body.stripeAccounts || [])
      .slice(0, 4)
      .map((acc: any, idx: number) => ({
        label: (acc.label || `Account ${idx + 1}`).trim(),
        secretKey: (acc.secretKey || "").trim(),
        webhookSecret: (acc.webhookSecret || "").trim(),
        active: !!acc.active,
        order: typeof acc.order === "number" ? acc.order : idx,
        merchantSite: (acc.merchantSite || "").trim(),
      }))

    const newCfg: Partial<AppConfig> = {
      checkoutDomain: (body.checkoutDomain || "").trim(),
      defaultCurrency:
        (body.defaultCurrency || "eur").toLowerCase(),
      shopify,
      stripeAccounts,
    }

    await setConfig(newCfg)

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error("[config POST] error:", err)
    return NextResponse.json(
      { error: err.message || "Errore nel salvataggio config" },
      { status: 500 },
    )
  }
}