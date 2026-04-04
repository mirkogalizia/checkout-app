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
  const appleContainerRef = useRef<HTMLDivElement>(null)
  const googleContainerRef = useRef<HTMLDivElement>(null)
  const [appleReady, setAppleReady] = useState(false)
  const [googleReady, setGoogleReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const initRef = useRef(false)
  const appleElRef = useRef<any>(null)
  const googleElRef = useRef<any>(null)

  useEffect(() => {
    if (initRef.current) return
    initRef.current = true

    async function init() {
      try {
        // Crea PI server-side
        const piRes = await fetch("/api/payment-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            amountCents: totalCents,
          }),
        })
        const piData = await piRes.json()

        if (!piRes.ok || !piData.clientSecret) {
          console.warn("[airwallex-express] PI non creato:", piData.error)
          setLoading(false)
          return
        }

        const Airwallex = await getAirwallexSDK(environment)
        const { createElement } = Airwallex

        const commonConfig = {
          intent_id: piData.intentId,
          client_secret: piData.clientSecret,
          currency: currency.toLowerCase(),
          amount: {
            value: totalCents / 100,
            currency: currency.toUpperCase(),
          },
          countryCode: "IT",
          requiredBillingContactFields: ["postalAddress", "name", "email", "phone"],
          requiredShippingContactFields: ["postalAddress", "name", "email", "phone"],
        }

        // ── APPLE PAY ────────────────────────────────────────────────────
        try {
          const appleEl = createElement("applepay", commonConfig)
          if (appleEl && appleContainerRef.current) {
            appleEl.mount(appleContainerRef.current)
            appleElRef.current = appleEl
          }
        } catch (e: any) {
          console.log("[airwallex-express] Apple Pay non disponibile:", e?.message)
        }

        // ── GOOGLE PAY ───────────────────────────────────────────────────
        try {
          const googleEl = createElement("googlepay", commonConfig)
          if (googleEl && googleContainerRef.current) {
            googleEl.mount(googleContainerRef.current)
            googleElRef.current = googleEl
          }
        } catch (e: any) {
          console.log("[airwallex-express] Google Pay non disponibile:", e?.message)
        }

        // ── EVENTS ──────────────────────────────────────────────────────
        const handleSuccess = async (e: Event) => {
          const detail = (e as CustomEvent).detail
          console.log("[airwallex-express] ✅ Pagamento completato:", detail)

          // Salva dati cliente dal payment sheet in Firebase
          try {
            const billing = detail?.billing || detail?.payerDetail || {}
            const shipping = detail?.shipping || billing

            if (billing.name || billing.email || shipping?.address) {
              const nameParts = (billing.name || "").trim().split(/\s+/)
              const customerData = {
                fullName: billing.name || "",
                email: billing.email || "",
                phone: billing.phone || billing.phoneNumber || "",
                address1: shipping?.address?.line1 || shipping?.address?.street || "",
                address2: shipping?.address?.line2 || "",
                city: shipping?.address?.city || "",
                province: shipping?.address?.state || shipping?.address?.province || "",
                postalCode: shipping?.address?.postCode || shipping?.address?.postalCode || "",
                countryCode: shipping?.address?.countryCode || "IT",
              }

              await fetch(`/api/cart-session?sessionId=${sessionId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ customer: customerData }),
              })
              console.log("[airwallex-express] 👤 Dati cliente salvati nella sessione")
            }
          } catch (saveErr) {
            console.warn("[airwallex-express] ⚠ Impossibile salvare dati cliente:", saveErr)
          }

          onSuccess()
        }

        const handleError = (e: Event) => {
          const detail = (e as CustomEvent).detail
          console.error("[airwallex-express] ❌ Errore:", detail)
          onError(detail?.message || "Errore nel pagamento")
        }

        const handleAppleReady = () => {
          console.log("[airwallex-express] ✅ Apple Pay pronto")
          setAppleReady(true)
        }

        const handleGoogleReady = () => {
          console.log("[airwallex-express] ✅ Google Pay pronto")
          setGoogleReady(true)
        }

        window.addEventListener("onSuccess", handleSuccess)
        window.addEventListener("onError", handleError)
        window.addEventListener("onReady", handleAppleReady)
        window.addEventListener("onGooglePayReady", handleGoogleReady)

        // Fallback: se dopo 3s nessun ready → nascondi loading
        setTimeout(() => setLoading(false), 3000)
      } catch (err: any) {
        console.error("[airwallex-express] Errore init:", err)
        setLoading(false)
      }
    }

    init()

    return () => {
      try { appleElRef.current?.unmount() } catch {}
      try { googleElRef.current?.unmount() } catch {}
    }
  }, [])

  // Quando un elemento diventa ready, togli il loading
  useEffect(() => {
    if (appleReady || googleReady) setLoading(false)
  }, [appleReady, googleReady])

  // Se nessun metodo express disponibile dopo il caricamento, nascondi tutto
  if (!loading && !appleReady && !googleReady) return null

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
          ref={appleContainerRef}
          id="airwallex-applepay"
          style={{ display: appleReady ? "block" : "none", marginBottom: appleReady ? "8px" : 0 }}
        />
        <div
          ref={googleContainerRef}
          id="airwallex-googlepay"
          style={{ display: googleReady ? "block" : "none" }}
        />
      </div>

      {(appleReady || googleReady) && (
        <div className="flex items-center gap-3 px-5 pb-4 mt-1">
          <div className="flex-1 h-px bg-gray-100" />
          <span className="text-[11px] text-gray-400 font-medium">oppure continua sotto</span>
          <div className="flex-1 h-px bg-gray-100" />
        </div>
      )}
    </div>
  )
}
