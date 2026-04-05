// src/app/checkout/airwallex/AirwallexExpressCheckout.tsx
"use client"

import { useEffect, useRef, useState } from "react"
import { getAirwallexSDK } from "@/lib/airwallexSDK"

type AirwallexExpressCheckoutProps = {
  sessionId: string
  subtotalCents: number   // solo prodotti (senza spedizione)
  currency: string
  environment: "demo" | "prod"
  onSuccess: () => void
  onError: (msg: string) => void
}

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
  const intentClientSecretRef = useRef<string>("")
  // shippingCents corrente (aggiornato dopo shippingAddressChange)
  const shippingCentsRef = useRef<number>(0)

  const [loading, setLoading] = useState(true)
  const [hasApple, setHasApple] = useState(false)
  const [hasGoogle, setHasGoogle] = useState(false)
  const [initFailed, setInitFailed] = useState(false)

  const hasAny = hasApple || hasGoogle

  // Aggiorna solo il display del foglio Apple Pay / Google Pay
  // Il PI è già stato creato con subtotale + spedizione default, quindi
  // l'importo addebitato è sempre corretto anche senza aggiornare il server
  async function fetchAndUpdateDisplay(
    address: { city?: string; state?: string; postalCode?: string; countryCode?: string },
    elements: { apple?: any; google?: any },
  ) {
    try {
      const res = await fetch("/api/calculate-shipping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          destination: {
            city: address.city || "",
            province: address.state || "",
            postalCode: address.postalCode || "",
            countryCode: address.countryCode || "IT",
          },
        }),
      })
      const data = await res.json()
      const newShippingCents: number = res.ok && data.shippingCents ? data.shippingCents : 590
      shippingCentsRef.current = newShippingCents

      const displayTotal = subtotalCents + newShippingCents
      const shippingStr = centsToStr(newShippingCents)

      const updateOptions = {
        amount: { value: displayTotal / 100, currency: currency.toUpperCase() },
        lineItems: [
          { label: "Subtotale", amount: centsToStr(subtotalCents) },
          { label: "Spedizione BRT", amount: shippingStr },
        ],
        shippingMethods: [
          {
            label: "Spedizione BRT Tracciata",
            amount: shippingStr,
            identifier: "brt",
            detail: `Consegna in 24/48h — €${shippingStr}`,
          },
        ],
      }

      elements.apple?.update?.(updateOptions)
      elements.google?.update?.(updateOptions)

      console.log(`[airwallex-express] display aggiornato: spedizione €${shippingStr}`)
    } catch (err: any) {
      console.warn("[airwallex-express] Errore calcolo shipping:", err.message)
    }
  }

  useEffect(() => {
    if (initRef.current) return
    initRef.current = true

    async function init() {
      try {
        // Crea PI con subtotale + spedizione default (590 = €5.90 BRT Italia)
        // Non aggiorniamo il PI server-side dopo — l'importo addebitato è questo
        const DEFAULT_SHIPPING = 590
        shippingCentsRef.current = DEFAULT_SHIPPING
        const piRes = await fetch("/api/payment-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, amountCents: subtotalCents + DEFAULT_SHIPPING }),
        })
        const piData = await piRes.json()

        if (!piRes.ok || !piData.clientSecret) {
          console.warn("[airwallex-express] PI non creato:", piData?.error)
          setInitFailed(true)
          setLoading(false)
          return
        }

        intentIdRef.current = piData.intentId
        intentClientSecretRef.current = piData.clientSecret

        const Airwallex = await getAirwallexSDK(environment)
        const { createElement } = Airwallex

        const baseOptions = {
          intent_id: piData.intentId,
          client_secret: piData.clientSecret,
          mode: "payment",
          autoCapture: true,
          amount: { value: (subtotalCents + DEFAULT_SHIPPING) / 100, currency: currency.toUpperCase() },
          countryCode: "IT",
          lineItems: [
            { label: "Subtotale", amount: centsToStr(subtotalCents) },
            { label: "Spedizione BRT", amount: centsToStr(DEFAULT_SHIPPING) },
          ],
          shippingMethods: [
            {
              label: "Spedizione BRT Tracciata",
              amount: centsToStr(DEFAULT_SHIPPING),
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
                  console.log("[airwallex-express] ✅ Apple Pay visibile")
                  setHasApple(true)
                  ro.disconnect()
                }
              }
            })
            ro.observe(appleRef.current)

            // Shipping address change — aggiorna totale
            appleEl.on("shippingAddressChange", async (e: any) => {
              const addr = e.detail?.shippingAddress || {}
              await fetchAndUpdateDisplay(
                {
                  city: addr.locality || addr.city,
                  state: addr.administrativeArea || addr.state,
                  postalCode: addr.postalCode,
                  countryCode: addr.countryCode || "IT",
                },
                { apple: appleEl, google: googleElementRef.current },
              )
            })
          }
        } catch (appleErr: any) {
          console.warn("[airwallex-express] applePayButton non disponibile:", appleErr.message)
        }

        // ── GOOGLE PAY ─────────────────────────────────────────────────
        let googleEl: any = null
        try {
          googleEl = createElement("googlePayButton", {
            ...baseOptions,
          })
          if (googleRef.current && googleEl) {
            googleEl.mount(googleRef.current)
            googleElementRef.current = googleEl

            const ro = new ResizeObserver((entries) => {
              for (const entry of entries) {
                if (entry.contentRect.height > 0) {
                  console.log("[airwallex-express] ✅ Google Pay visibile")
                  setHasGoogle(true)
                  ro.disconnect()
                }
              }
            })
            ro.observe(googleRef.current)

            googleEl.on("shippingAddressChange", async (e: any) => {
              const addr = e.detail?.intermediatePaymentData?.shippingAddress || e.detail?.shippingAddress || {}
              await fetchAndUpdateDisplay(
                {
                  city: addr.locality || addr.city,
                  state: addr.administrativeArea || addr.state,
                  postalCode: addr.postalCode,
                  countryCode: addr.countryCode || "IT",
                },
                { apple: appleElementRef.current, google: googleEl },
              )
            })
          }
        } catch (googleErr: any) {
          console.warn("[airwallex-express] googlePayButton non disponibile:", googleErr.message)
        }

        // ── EVENTI GLOBALI ─────────────────────────────────────────────
        window.addEventListener("onReady", ((e: CustomEvent) => {
          const detail = e.detail || {}
          const available = detail.availablePaymentMethods || {}
          console.log("[airwallex-express] onReady:", JSON.stringify(detail))

          if (available.applepay === true || available.applePay === true || available.applePayButton === true || detail.type === "applePayButton") {
            setHasApple(true)
          }
          if (available.googlepay === true || available.googlePay === true || available.googlePayButton === true || detail.type === "googlePayButton") {
            setHasGoogle(true)
          }

          setLoading(false)
        }) as EventListener)

        // onSuccess — filtra per il nostro intent_id
        window.addEventListener("onSuccess", (async (e: Event) => {
          const detail = (e as CustomEvent).detail || {}
          if (detail.intent_id && detail.intent_id !== intentIdRef.current) return
          console.log("[airwallex-express] ✅ Pagamento express completato:", detail)

          // Salva dati cliente in Firebase — AWAIT per garantire che arrivino
          // prima del webhook Airwallex (che legge Firebase subito dopo il pagamento)
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
          console.log("[airwallex-express] 📦 Customer data estratto:", customerData)
          try {
            await fetch(`/api/cart-session?sessionId=${sessionId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                customer: customerData,
                shippingCents: shippingCentsRef.current,
              }),
            })
            console.log("[airwallex-express] ✅ Customer salvato su Firebase")
          } catch {}

          onSuccess()
        }) as EventListener)

        // onError
        window.addEventListener("onError", ((e: CustomEvent) => {
          const detail = e.detail || {}
          if (detail.intent_id && detail.intent_id !== intentIdRef.current) return
          console.error("[airwallex-express] ❌ Errore:", detail)
          onError(detail?.message || "Errore nel pagamento")
        }) as EventListener)

        // Timeout spinner
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
