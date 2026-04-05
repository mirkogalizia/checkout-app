// src/app/checkout/airwallex/AirwallexPayment.tsx
"use client"

import { useEffect, useRef, useState } from "react"

type AirwallexPaymentProps = {
  sessionId: string
  totalCents: number
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
  // Callback chiamato quando l'elemento card è pronto —
  // passa una funzione che il checkout usa per confermare il pagamento
  onConfirmReady: (confirmFn: () => Promise<void>) => void
}

export default function AirwallexPayment({
  sessionId,
  totalCents,
  environment,
  customer,
  onSuccess,
  onError,
  onConfirmReady,
}: AirwallexPaymentProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const elementRef = useRef<any>(null)
  const airwallexRef = useRef<any>(null)
  const piDataRef = useRef<{ clientSecret: string; intentId: string } | null>(null)
  const initRef = useRef(false)
  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)

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
          body: JSON.stringify({ sessionId, amountCents: totalCents, customer }),
        })
        const piData = await piRes.json()

        if (!piRes.ok || !piData.clientSecret) {
          onError(piData.error || "Errore creazione pagamento")
          return
        }

        piDataRef.current = { clientSecret: piData.clientSecret, intentId: piData.intentId }

        const Airwallex = await import("@/lib/airwallexSDK").then(m => m.getAirwallexSDK(environment))
        airwallexRef.current = Airwallex

        // Usa l'elemento "card" — solo campi carta, senza pulsante incorporato
        const { createElement } = Airwallex
        const element = createElement("card", {
          autoCapture: true,
        })

        if (containerRef.current && element) {
          element.mount(containerRef.current)
          elementRef.current = element
        }

        // Esponi la funzione di conferma al checkout page
        onConfirmReady(async () => {
          if (!piDataRef.current || !elementRef.current) {
            throw new Error("Elemento carta non pronto")
          }
          await airwallexRef.current.confirmPaymentIntent({
            element: elementRef.current,
            client_secret: piDataRef.current.clientSecret,
            intent_id: piDataRef.current.intentId,
          })
        })

        // Events
        window.addEventListener("onSuccess", ((e: CustomEvent) => {
          const detail = e.detail || {}
          // Filtra per il nostro intent_id
          if (detail.intent_id && detail.intent_id !== piDataRef.current?.intentId) return
          console.log("[airwallex] ✅ Pagamento completato:", detail)
          onSuccess()
        }) as EventListener)

        window.addEventListener("onError", ((e: CustomEvent) => {
          const detail = e.detail || {}
          if (detail.intent_id && detail.intent_id !== piDataRef.current?.intentId) return
          console.error("[airwallex] ❌ Errore pagamento:", detail)
          const msg = detail?.message || detail?.error?.message || detail?.code || "Errore nel pagamento"
          onError(msg)
        }) as EventListener)

        window.addEventListener("onReady", (() => {
          console.log("[airwallex] ✅ Card element pronto")
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
      try { elementRef.current?.unmount() } catch {}
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
