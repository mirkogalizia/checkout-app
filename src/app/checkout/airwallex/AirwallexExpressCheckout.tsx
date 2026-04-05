// src/app/checkout/airwallex/AirwallexExpressCheckout.tsx
"use client"

import { useEffect, useRef, useState } from "react"
import { getAirwallexSDK } from "@/lib/airwallexSDK"

type AirwallexExpressCheckoutProps = {
  sessionId: string
  totalCents: number
  currency: string
  environment: "demo" | "prod"
  onSuccess: () => void
  onError: (msg: string) => void
}

export default function AirwallexExpressCheckout({
  sessionId,
  totalCents,
  currency,
  environment,
  onSuccess,
  onError,
}: AirwallexExpressCheckoutProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const elementRef = useRef<any>(null)
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [hidden, setHidden] = useState(false)
  const initRef = useRef(false)

  useEffect(() => {
    if (initRef.current) return
    initRef.current = true

    async function init() {
      try {
        // Crea PI server-side
        const piRes = await fetch("/api/payment-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, amountCents: totalCents }),
        })
        const piData = await piRes.json()

        if (!piRes.ok || !piData.clientSecret) {
          console.warn("[airwallex-express] PI non creato:", piData.error)
          setHidden(true)
          setLoading(false)
          return
        }

        const Airwallex = await getAirwallexSDK(environment)
        const { createElement } = Airwallex

        // Usa dropIn con solo metodi express (applepay + googlepay)
        const element = createElement("dropIn", {
          intent_id: piData.intentId,
          client_secret: piData.clientSecret,
          currency: currency.toLowerCase(),
          mode: "payment",
          autoCapture: true,
          methods: ["applepay", "googlepay"],
        })

        if (containerRef.current && element) {
          element.mount(containerRef.current)
          elementRef.current = element
        }

        // Success
        window.addEventListener("onSuccess", ((e: CustomEvent) => {
          console.log("[airwallex-express] ✅ Pagamento express completato:", e.detail)
          const detail = e.detail || {}
          const billing = detail.billing || detail.payerDetail || {}
          const shipping = detail.shipping || billing
          if (billing.email || billing.name) {
            const customerData = {
              fullName: billing.name || "",
              email: billing.email || "",
              phone: billing.phone || "",
              address1: shipping?.address?.line1 || shipping?.address?.street || "",
              address2: shipping?.address?.line2 || "",
              city: shipping?.address?.city || "",
              province: shipping?.address?.state || "",
              postalCode: shipping?.address?.postCode || shipping?.address?.postalCode || "",
              countryCode: shipping?.address?.countryCode || "IT",
            }
            fetch(`/api/cart-session?sessionId=${sessionId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ customer: customerData }),
            }).catch(() => {})
          }
          onSuccess()
        }) as EventListener)

        // Error
        window.addEventListener("onError", ((e: CustomEvent) => {
          console.error("[airwallex-express] ❌ Errore:", e.detail)
          onError(e.detail?.message || "Errore nel pagamento")
        }) as EventListener)

        // Ready — controlla se Apple Pay / Google Pay sono disponibili
        window.addEventListener("onReady", ((e: CustomEvent) => {
          console.log("[airwallex-express] onReady detail:", JSON.stringify(e.detail))
          const available = e.detail?.availablePaymentMethods || {}
          const hasExpress =
            available.applepay || available.googlepay ||
            available.applePay || available.googlePay
          if (hasExpress) {
            setReady(true)
          } else {
            console.log("[airwallex-express] Nessun metodo express disponibile, nascondo")
            setHidden(true)
          }
          setLoading(false)
        }) as EventListener)

        // Timeout fallback: dopo 5s nascondi il loading comunque
        setTimeout(() => setLoading(false), 5000)

      } catch (err: any) {
        console.error("[airwallex-express] Errore init:", err)
        setHidden(true)
        setLoading(false)
      }
    }

    init()

    return () => {
      try { elementRef.current?.unmount() } catch {}
    }
  }, [])

  if (hidden) return null

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-4 animate-fade-in-up">
      <div className="px-5 pt-5 pb-3">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest text-center mb-3">
          Pagamento rapido
        </p>

        {loading && (
          <div className="flex items-center justify-center py-3">
            <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin" />
          </div>
        )}

        <div
          ref={containerRef}
          id="airwallex-express-dropin"
          style={{
            minHeight: ready ? "auto" : 0,
            opacity: ready ? 1 : 0,
            transition: "opacity 0.3s",
          }}
        />
      </div>

      {ready && (
        <div className="flex items-center gap-3 px-5 pb-4">
          <div className="flex-1 h-px bg-gray-100" />
          <span className="text-[11px] text-gray-400 font-medium">oppure inserisci i tuoi dati</span>
          <div className="flex-1 h-px bg-gray-100" />
        </div>
      )}
    </div>
  )
}
