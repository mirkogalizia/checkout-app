// src/app/checkout/airwallex/AirwallexExpressCheckout.tsx
"use client"

import { useEffect, useRef, useState } from "react"
import { getAirwallexSDK } from "@/lib/airwallexSDK"

type AirwallexExpressCheckoutProps = {
  sessionId: string
  subtotalCents: number
  currency: string
  environment: "demo" | "prod"
  onSuccess: () => void
  onError: (msg: string) => void
}

const SHIPPING_CENTS = 590 // €5.90 fisso per tutta Europa

function centsToStr(cents: number): string {
  return (cents / 100).toFixed(2)
}

export default function AirwallexExpressCheckout({
  sessionId,
  subtotalCents,
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
  const [initFailed, setInitFailed] = useState(false)

  const hasAny = hasApple || hasGoogle

  useEffect(() => {
    if (initRef.current) return
    initRef.current = true

    async function init() {
      try {
        const totalCents = subtotalCents + SHIPPING_CENTS

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

        intentIdRef.current = piData.intentId

        const Airwallex = await getAirwallexSDK(environment)
        const { createElement } = Airwallex

        const baseOptions = {
          intent_id: piData.intentId,
          client_secret: piData.clientSecret,
          mode: "payment",
          autoCapture: true,
          amount: { value: totalCents / 100, currency: currency.toUpperCase() },
          countryCode: "IT",
          lineItems: [
            { label: "Subtotale", amount: centsToStr(subtotalCents) },
            { label: "Spedizione BRT", amount: centsToStr(SHIPPING_CENTS) },
          ],
          shippingMethods: [
            {
              label: "Spedizione BRT Tracciata",
              amount: centsToStr(SHIPPING_CENTS),
              identifier: "brt",
              detail: "Consegna in 24/48h",
            },
          ],
        }

        // ── APPLE PAY ──────────────────────────────────────────────────
        let appleEl: any = null
        try {
          appleEl = createElement("applePayButton", {
            ...baseOptions,
            buttonColor: "black",
            buttonType: "pay",
            requiredShippingContactFields: ["name", "email", "phone", "postalAddress"],
          })
          if (appleRef.current && appleEl) {
            appleEl.mount(appleRef.current)
            appleElementRef.current = appleEl

            const ro = new ResizeObserver((entries) => {
              for (const entry of entries) {
                if (entry.contentRect.height > 0) {
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

        // ── GOOGLE PAY ─────────────────────────────────────────────────
        let googleEl: any = null
        try {
          googleEl = createElement("googlePayButton", { ...baseOptions })
          if (googleRef.current && googleEl) {
            googleEl.mount(googleRef.current)
            googleElementRef.current = googleEl

            const ro = new ResizeObserver((entries) => {
              for (const entry of entries) {
                if (entry.contentRect.height > 0) {
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

        // ── EVENTI GLOBALI ─────────────────────────────────────────────
        window.addEventListener("onReady", ((e: CustomEvent) => {
          const detail = e.detail || {}
          const available = detail.availablePaymentMethods || {}
          if (available.applepay === true || available.applePay === true || available.applePayButton === true || detail.type === "applePayButton") {
            setHasApple(true)
          }
          if (available.googlepay === true || available.googlePay === true || available.googlePayButton === true || detail.type === "googlePayButton") {
            setHasGoogle(true)
          }
          setLoading(false)
        }) as EventListener)

        window.addEventListener("onSuccess", (async (e: Event) => {
          const detail = (e as CustomEvent).detail || {}
          if (detail.intent_id && detail.intent_id !== intentIdRef.current) return
          console.log("[airwallex-express] ✅ Pagamento completato:", detail)

          // Salva dati cliente su Firebase (await per arrivare prima del webhook)
          const billing = detail.billing || detail.payerDetail || {}
          const shipping = detail.shipping || detail.shippingAddress || billing
          const customerData = {
            fullName: billing.name || shipping?.name || "",
            email: billing.email || "",
            phone: billing.phone || shipping?.phoneNumber || "",
            address1: shipping?.address?.line1 || shipping?.address?.street || billing?.address?.line1 || "",
            address2: shipping?.address?.line2 || billing?.address?.line2 || "",
            city: shipping?.address?.city || billing?.address?.city || "",
            province: shipping?.address?.state || billing?.address?.state || "",
            postalCode: shipping?.address?.postCode || shipping?.address?.postalCode || billing?.address?.postCode || "",
            countryCode: shipping?.address?.countryCode || billing?.address?.countryCode || "IT",
          }
          console.log("[airwallex-express] 📦 Customer:", customerData)
          try {
            await fetch(`/api/cart-session?sessionId=${sessionId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                customer: customerData,
                shippingCents: SHIPPING_CENTS,
              }),
            })
          } catch {}

          onSuccess()
        }) as EventListener)

        window.addEventListener("onError", ((e: CustomEvent) => {
          const detail = (e as CustomEvent).detail || {}
          if (detail.intent_id && detail.intent_id !== intentIdRef.current) return
          console.error("[airwallex-express] ❌ Errore:", detail)
          onError(detail?.message || "Errore nel pagamento")
        }) as EventListener)

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

  if (initFailed) return null
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

        <div ref={appleRef} id="airwallex-applepay" style={{ marginBottom: hasApple && hasGoogle ? 8 : 0 }} />
        <div ref={googleRef} id="airwallex-googlepay" />
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
