// src/app/api/stripe-status/route.ts
import { NextResponse } from 'next/server'
import { getCurrentAccountInfo } from '@/lib/stripeRotation'
import { getConfig } from '@/lib/config'

export async function GET() {
  try {
    const cfg = await getConfig()
    const activeGateway = cfg.activeGateway || "stripe"

    // ─── AIRWALLEX ────────────────────────────────────────────────────────────
    if (activeGateway === "airwallex" && cfg.airwallex?.clientId) {
      console.log('[gateway-status] ✅ Gateway attivo: Airwallex')
      return NextResponse.json({
        gatewayType: "airwallex",
        clientId: cfg.airwallex.clientId,
        environment: cfg.airwallex.environment,
        // Retrocompatibilità: publishableKey vuoto per non rompere il frontend
        publishableKey: null,
        accountLabel: "Airwallex",
      })
    }

    // ─── STRIPE (comportamento originale) ─────────────────────────────────────
    const info = await getCurrentAccountInfo()

    console.log('[gateway-status] ✅ Gateway attivo: Stripe -', info.account.label)

    return NextResponse.json({
      gatewayType: "stripe",
      publishableKey: info.account.publishableKey,
      accountLabel: info.account.label,
      currentAccount: info.account.label,
      slotNumber: info.slotNumber,
      totalSlots: info.totalSlots,
      nextRotation: info.nextRotation.toISOString(),
      nextRotationLocal: info.nextRotation.toLocaleString('it-IT'),
    })
  } catch (error: any) {
    console.error('[gateway-status] ❌ Errore:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
