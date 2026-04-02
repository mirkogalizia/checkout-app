// src/lib/gateway/index.ts
import { getConfig } from "../config"
import { GatewayClientConfig, GatewayType } from "./types"

/**
 * Ritorna il tipo di gateway attivo dalla config.
 */
export async function getActiveGatewayType(): Promise<GatewayType> {
  const config = await getConfig()
  return config.activeGateway || "stripe"
}

/**
 * Ritorna la config client-side per il gateway attivo.
 * Usato dall'endpoint /api/gateway-status (e /api/stripe-status per retrocompat).
 */
export async function getActiveGatewayClientConfig(): Promise<GatewayClientConfig> {
  const config = await getConfig()
  const gatewayType = config.activeGateway || "stripe"

  if (gatewayType === "airwallex") {
    const { getAirwallexClientConfig } = await import("./airwallex")
    if (!config.airwallex?.clientId) {
      throw new Error("Airwallex non configurato: clientId mancante")
    }
    return getAirwallexClientConfig(config.airwallex)
  }

  // Stripe: usa la rotazione esistente
  const { getCurrentAccountInfo } = await import("../stripeRotation")
  const accountInfo = await getCurrentAccountInfo()

  return {
    gatewayType: "stripe",
    publishableKey: accountInfo.account.publishableKey,
    accountLabel: accountInfo.account.label,
  }
}
