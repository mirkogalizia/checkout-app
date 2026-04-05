// src/app/checkout/airwallex/AirwallexPayment.tsx
"use client"

import { useEffect, useRef, useState } from "react"

type AirwallexPaymentProps = {
  sessionId: string
  totalCents: number
  environment: "demo" | "prod"
  clientSecret: string
  intentId: string
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
  onConfirmReady: (confirmFn: () => Promise<void>) => void
}

const fieldStyle = {
  base: {
    color: "#111827",
    fontSize: "16px",
    fontFamily: "inherit",
    "::placeholder": { color: "#9ca3af" },
  },
}

export default function AirwallexPayment({
  environment,
  clientSecret,
  intentId,
  onSuccess,
  onError,
  onConfirmReady,
}: AirwallexPaymentProps) {
  const cardNumberRef = useRef<HTMLDivElement>(null)
  const expiryRef = useRef<HTMLDivElement>(null)
  const cvcRef = useRef<HTMLDivElement>(null)

  const cardNumberElRef = useRef<any>(null)
  const airwallexRef = useRef<any>(null)
  const initRef = useRef(false)
  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (initRef.current) return
    initRef.current = true

    async function init() {
      try {
        setLoading(true)

        const Airwallex = await import("@/lib/airwallexSDK").then(m => m.getAirwallexSDK(environment))
        airwallexRef.current = Airwallex

        const { createElement } = Airwallex

        const cardNumberEl = createElement("cardNumber", { style: fieldStyle, autoCapture: true })
        const expiryEl = createElement("expiry", { style: fieldStyle })
        const cvcEl = createElement("cvc", { style: fieldStyle })

        if (cardNumberRef.current) cardNumberEl.mount(cardNumberRef.current)
        if (expiryRef.current) expiryEl.mount(expiryRef.current)
        if (cvcRef.current) cvcEl.mount(cvcRef.current)

        cardNumberElRef.current = cardNumberEl

        onConfirmReady(async () => {
          if (!cardNumberElRef.current) throw new Error("Elemento carta non pronto")
          await airwallexRef.current.confirmPaymentIntent({
            element: cardNumberElRef.current,
            client_secret: clientSecret,
            intent_id: intentId,
          })
        })

        window.addEventListener("onSuccess", ((e: CustomEvent) => {
          const detail = e.detail || {}
          if (detail.intent_id && detail.intent_id !== intentId) return
          console.log("[airwallex] ✅ Pagamento completato:", detail)
          onSuccess()
        }) as EventListener)

        window.addEventListener("onError", ((e: CustomEvent) => {
          const detail = e.detail || {}
          if (detail.intent_id && detail.intent_id !== intentId) return
          console.error("[airwallex] ❌ Errore pagamento:", detail)
          const msg = detail?.message || detail?.error?.message || detail?.code || "Errore nel pagamento"
          onError(msg)
        }) as EventListener)

        window.addEventListener("onReady", (() => {
          console.log("[airwallex] ✅ Card elements pronti")
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
      try { cardNumberElRef.current?.unmount() } catch {}
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

      <div style={{ opacity: ready ? 1 : 0, transition: "opacity 0.3s" }}>
        <div className="mb-3">
          <label className="block text-xs font-medium text-gray-500 mb-1">Numero carta</label>
          <div
            ref={cardNumberRef}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus-within:border-gray-400 transition-colors"
            style={{ minHeight: 48 }}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Scadenza</label>
            <div
              ref={expiryRef}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus-within:border-gray-400 transition-colors"
              style={{ minHeight: 48 }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">CVC</label>
            <div
              ref={cvcRef}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus-within:border-gray-400 transition-colors"
              style={{ minHeight: 48 }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
