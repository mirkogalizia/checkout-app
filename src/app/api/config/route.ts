// src/app/api/config/route.ts
import { NextRequest } from 'next/server'
import { getConfig, setConfig, AppConfig, StripeAccount } from '@/lib/config'

// GET: restituisce la config senza segreti (sk/whsec/token non esposti)
export async function GET() {
  const cfg = getConfig()

  const safeAccounts = (cfg.stripeAccounts || []).slice(0, 4).map((a) => ({
    label: a.label || '',
    secretKey: '',       // non esponiamo segreti
    webhookSecret: '',   // idem
  }))

  return Response.json({
    shopifyDomain: cfg.shopifyDomain,
    shopifyApiVersion: cfg.shopifyApiVersion,
    checkoutDomain: cfg.checkoutDomain,
    shopifyStorefrontToken: '', // mai esposto
    stripeAccounts: safeAccounts,
  })
}

// POST: salva config (accetta anche parziale; ignora account senza sk_)
export async function POST(req: NextRequest) {
  const body = await req.json()

  const incomingAccounts: StripeAccount[] = Array.isArray(body.stripeAccounts)
    ? body.stripeAccounts
    : []

  const next: Partial<AppConfig> = {
    shopifyDomain: body.shopifyDomain ?? '',
    shopifyToken: body.shopifyToken ?? '',
    shopifyApiVersion: body.shopifyApiVersion ?? '2024-10',
    checkoutDomain: body.checkoutDomain ?? 'http://localhost:3000',
    shopifyStorefrontToken: body.shopifyStorefrontToken ?? '',
    stripeAccounts: incomingAccounts,
  }

  setConfig(next)

  const cfg = getConfig()
  const count = cfg.stripeAccounts.length

  return Response.json({ ok: true, stripeAccountsSaved: count })
}