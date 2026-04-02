// src/app/checkout/airwallex/AirwallexPayment.tsx
"use client"

import { useEffect, useRef, useState } from "react"

type AirwallexPaymentProps = {
  sessionId: string
  totalCents: number
  currency: string
  clientId: string
  environment: "demo" | "prod"
  customer: {
    fullName: string
    email: string
    phone: string
    address1: string
    address2: string
    city: string
    postalCode: string
    province: string
    countryCode: string
  }
  onSuccess: () => void
  onError: (msg: string) => void
}

export default function AirwallexPayment({
  sessionId,
  totalCents,
  currency,
  clientId,
  environment,
  customer,
  onSuccess,
  onError,
}: AirwallexPaymentProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const elementRef = useRef<any>(null)
  const initRef = useRef(false)

  useEffect(() => {
    if (initRef.current) return
    initRef.current = true

    async function init() {
      try {
        setLoading(true)

        // Crea PaymentIntent server-side
        const piRes = await fetch("/api/payment-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            amountCents: totalCents,
            customer,
          }),
        })
        const piData = await piRes.json()

        if (!piRes.ok || !piData.clientSecret) {
          onError(piData.error || "Errore creazione pagamento")
          return
        }

        // Carica Airwallex SDK
        const Airwallex = await import("airwallex-payment-elements")
        const { loadAirwallex } = Airwallex

        await loadAirwallex({
          env: environment,
          origin: window.location.origin,
        })

        // Crea Drop-in element
        const { createElement } = Airwallex
        const element = createElement("dropIn", {
          intent_id: piData.intentId,
          client_secret: piData.clientSecret,
          currency: currency.toLowerCase(),
          mode: "payment",
          autoCapture: true,
          style: {
            popupWidth: 400,
          },
          methods: ["card", "applepay", "googlepay"],
        })

        if (containerRef.current && element) {
          element.mount(containerRef.current)
          elementRef.current = element
        }

        // Event listeners
        window.addEventListener("onSuccess", ((e: CustomEvent) => {
          console.log("[airwallex] ✅ Pagamento completato:", e.detail)
          onSuccess()
        }) as EventListener)

        window.addEventListener("onError", ((e: CustomEvent) => {
          console.error("[airwallex] ❌ Errore pagamento:", e.detail)
          onError(e.detail?.message || "Errore nel pagamento")
        }) as EventListener)

        window.addEventListener("onReady", (() => {
          console.log("[airwallex] ✅ Drop-in pronto")
          setReady(true)
          setLoading(false)
        }) as EventListener)

      } catch (err: any) {
        console.error("[airwallex] Errore init:", err)
        onError(err.message || "Errore inizializzazione pagamento")
        setLoading(false)
      }
    }

    init()

    return () => {
      if (elementRef.current) {
        try {
          elementRef.current?.unmount()
        } catch {}
      }
    }
  }, [])

  return (
    <div>
      {loading && !ready && (
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
          <span className="ml-3 text-sm text-gray-500">Caricamento metodi di pagamento...</span>
        </div>
      )}
      <div
        ref={containerRef}
        id="airwallex-dropin"
        style={{ minHeight: ready ? "auto" : 0, opacity: ready ? 1 : 0, transition: "opacity 0.3s" }}
      />
    </div>
  )
}
