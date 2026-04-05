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
  const appleRef = useRef<HTMLDivElement>(null)
  const googleRef = useRef<HTMLDivElement>(null)
  const appleElementRef = useRef<any>(null)
  const googleElementRef = useRef<any>(null)
  const initRef = useRef(false)
  const intentIdRef = useRef<string>("")

  const [loading, setLoading] = useState(true)
  const [hasApple, setHasApple] = useState(false)
  const [hasGoogle, setHasGoogle] = useState(false)
  // initFailed: true se la creazione del PI fallisce — nascondiamo subito
  const [initFailed, setInitFailed] = useState(false)

  const hasAny = hasApple || hasGoogle

  useEffect(() => {
    if (initRef.current) return
    initRef.current = true

    async function init() {
      try {
        // Crea PaymentIntent server-side (condiviso tra Apple Pay e Google Pay)
        const piRes = await fetch("/api/payment-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, amountCents: totalCents }),
        })
        const piData = await piRes.json()

        if (!piRes.ok || !piData.clientSecret) {
          console.warn("[airwallex-express] PI non creato:", piData?.error)
          setInitFailed(true)
          setLoading(false)
          return
        }

        const { intentId, clientSecret } = piData
        intentIdRef.current = intentId
        const amountValue = totalCents / 100

        const Airwallex = await getAirwallexSDK(environment)
        const { createElement } = Airwallex

        const baseOptions = {
          intent_id: intentId,
          client_secret: clientSecret,
          mode: "payment",
          autoCapture: true,
          amount: { value: amountValue, currency: currency.toUpperCase() },
          countryCode: "IT",
        }

        // ── APPLE PAY ────────────────────────────────────────────────────
        try {
          const appleEl = createElement("applePayButton", {
            ...baseOptions,
            buttonColor: "black",
            buttonType: "pay",
            requiredShippingContactFields: ["name", "email", "phone", "postalAddress"],
          })
          if (appleRef.current && appleEl) {
            appleEl.mount(appleRef.current)
            appleElementRef.current = appleEl
            console.log("[airwallex-express] 🍎 applePayButton montato")

            // ResizeObserver: se il container acquisisce altezza, il button è visibile
            const ro = new ResizeObserver((entries) => {
              for (const entry of entries) {
                if (entry.contentRect.height > 0) {
                  console.log("[airwallex-express] ✅ Apple Pay visibile (height:", entry.contentRect.height, ")")
                  setHasApple(true)
                  ro.disconnect()
                }
              }
            })
            ro.observe(appleRef.current)
          }
        } catch (appleErr: any) {
          console.warn("[airwallex-express] applePayButton non disponibile:", appleErr.message)
        }

        // ── GOOGLE PAY ───────────────────────────────────────────────────
        try {
          const googleEl = createElement("googlePayButton", {
            ...baseOptions,
          })
          if (googleRef.current && googleEl) {
            googleEl.mount(googleRef.current)
            googleElementRef.current = googleEl
            console.log("[airwallex-express] 🤖 googlePayButton montato")

            const ro = new ResizeObserver((entries) => {
              for (const entry of entries) {
                if (entry.contentRect.height > 0) {
                  console.log("[airwallex-express] ✅ Google Pay visibile (height:", entry.contentRect.height, ")")
                  setHasGoogle(true)
                  ro.disconnect()
                }
              }
            })
            ro.observe(googleRef.current)
          }
        } catch (googleErr: any) {
          console.warn("[airwallex-express] googlePayButton non disponibile:", googleErr.message)
        }

        // ── EVENTI ───────────────────────────────────────────────────────
        // onReady: ogni elemento express può mandare il proprio stato
        window.addEventListener("onReady", ((e: CustomEvent) => {
          const detail = e.detail || {}
          const available = detail.availablePaymentMethods || {}
          console.log("[airwallex-express] onReady:", JSON.stringify(detail))

          if (
            available.applepay === true ||
            available.applePay === true ||
            available.applePayButton === true ||
            detail.type === "applePayButton"
          ) {
            console.log("[airwallex-express] ✅ Apple Pay disponibile (onReady)")
            setHasApple(true)
          }

          if (
            available.googlepay === true ||
            available.googlePay === true ||
            available.googlePayButton === true ||
            detail.type === "googlePayButton"
          ) {
            console.log("[airwallex-express] ✅ Google Pay disponibile (onReady)")
            setHasGoogle(true)
          }

          setLoading(false)
        }) as EventListener)

        // onSuccess — filtra per il nostro intent_id
        window.addEventListener("onSuccess", ((e: CustomEvent) => {
          const detail = e.detail || {}
          if (detail.intent_id && detail.intent_id !== intentIdRef.current) return
          console.log("[airwallex-express] ✅ Pagamento express completato:", detail)

          // Salva dati cliente da Apple/Google Pay in Firebase
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

        // onError
        window.addEventListener("onError", ((e: CustomEvent) => {
          const detail = e.detail || {}
          if (detail.intent_id && detail.intent_id !== intentIdRef.current) return
          console.error("[airwallex-express] ❌ Errore:", detail)
          onError(detail?.message || "Errore nel pagamento")
        }) as EventListener)

        // Timeout: dopo 10s rimuovi lo spinner
        setTimeout(() => setLoading(false), 10000)

      } catch (err: any) {
        console.error("[airwallex-express] Errore init:", err)
        setInitFailed(true)
        setLoading(false)
      }
    }

    init()

    return () => {
      try { appleElementRef.current?.unmount() } catch {}
      try { googleElementRef.current?.unmount() } catch {}
    }
  }, [])

  // Nascondi tutto se init fallita
  if (initFailed) return null

  // Nascondi se caricamento finito e nessun metodo express disponibile
  if (!loading && !hasAny) return null

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

        {/* Containers sempre nel DOM — lo SDK decide se renderizza il pulsante */}
        <div
          ref={appleRef}
          id="airwallex-applepay"
          style={{ marginBottom: hasApple && hasGoogle ? 8 : 0 }}
        />
        <div
          ref={googleRef}
          id="airwallex-googlepay"
        />
      </div>

      {hasAny && (
        <div className="flex items-center gap-3 px-5 pb-4">
          <div className="flex-1 h-px bg-gray-100" />
          <span className="text-[11px] text-gray-400 font-medium">oppure inserisci i tuoi dati</span>
          <div className="flex-1 h-px bg-gray-100" />
        </div>
      )}
    </div>
  )
}
