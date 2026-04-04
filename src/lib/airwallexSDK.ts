// src/lib/airwallexSDK.ts
// Singleton per inizializzare Airwallex SDK una sola volta per pagina

let initPromise: Promise<any> | null = null

export function getAirwallexSDK(environment: "demo" | "prod"): Promise<any> {
  if (initPromise) return initPromise

  initPromise = import("airwallex-payment-elements").then(async (Airwallex) => {
    await Airwallex.loadAirwallex({
      env: environment,
      origin: typeof window !== "undefined" ? window.location.origin : "",
    })
    return Airwallex
  }).catch((err) => {
    initPromise = null // reset so it can be retried
    throw err
  })

  return initPromise
}
