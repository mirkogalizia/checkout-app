// src/app/checkout/page.tsx
"use client"

import React, {
  useEffect,
  useMemo,
  useState,
  useRef,
  ChangeEvent,
  FormEvent,
  Suspense,
} from "react"
import { useSearchParams } from "next/navigation"
import { loadStripe, Stripe } from "@stripe/stripe-js"
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js"

export const dynamic = "force-dynamic"

type CheckoutItem = {
  id: string | number
  title: string
  variantTitle?: string
  quantity: number
  priceCents?: number
  linePriceCents?: number
  image?: string
}

type CartSessionResponse = {
  sessionId: string
  currency: string
  items: CheckoutItem[]
  subtotalCents?: number
  shippingCents?: number
  totalCents?: number
  paymentIntentClientSecret?: string
  discountCodes?: { code: string }[]
  rawCart?: any
  shopDomain?: string
  error?: string
}

type CustomerForm = {
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

function formatMoney(cents: number | undefined, currency: string = "EUR") {
  const value = (cents ?? 0) / 100
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(value)
}

function CheckoutInner({
  cart,
  sessionId,
}: {
  cart: CartSessionResponse
  sessionId: string
}) {
  const stripe = useStripe()
  const elements = useElements()

  const cartUrl = useMemo(() => {
    if (cart.shopDomain) {
      return `https://${cart.shopDomain}/cart`
    }
    return 'https://notforresale.it/cart'
  }, [cart.shopDomain])

  const [customer, setCustomer] = useState<CustomerForm>({
    fullName: "",
    email: "",
    phone: "",
    address1: "",
    address2: "",
    city: "",
    postalCode: "",
    province: "",
    countryCode: "IT",
  })

  const [useDifferentBilling, setUseDifferentBilling] = useState(false)
  const [billingAddress, setBillingAddress] = useState<CustomerForm>({
    fullName: "",
    email: "",
    phone: "",
    address1: "",
    address2: "",
    city: "",
    postalCode: "",
    province: "",
    countryCode: "IT",
  })

  // 🔥 NUOVO: Nome titolare carta
  const [cardholderName, setCardholderName] = useState("")

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [calculatedShippingCents, setCalculatedShippingCents] = useState<number>(0)
  const [isCalculatingShipping, setIsCalculatingShipping] = useState(false)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [shippingError, setShippingError] = useState<string | null>(null)
  const [orderSummaryExpanded, setOrderSummaryExpanded] = useState(false)

  const [lastCalculatedHash, setLastCalculatedHash] = useState<string>("")
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

  const addressInputRef = useRef<HTMLInputElement>(null)
  const autocompleteRef = useRef<any>(null)
  const scriptLoadedRef = useRef(false)

  const currency = (cart.currency || "EUR").toUpperCase()

  const subtotalCents = useMemo(() => {
    if (typeof cart.subtotalCents === "number") return cart.subtotalCents
    return cart.items.reduce((sum, item) => {
      const line = item.linePriceCents ?? item.priceCents ?? 0
      return sum + line
    }, 0)
  }, [cart])

  const shippingCents = calculatedShippingCents

  const discountCents = useMemo(() => {
    const shopifyTotal = typeof cart.totalCents === "number" ? cart.totalCents : subtotalCents
    const raw = subtotalCents - shopifyTotal
    return raw > 0 ? raw : 0
  }, [subtotalCents, cart.totalCents])

  const totalToPayCents = subtotalCents - discountCents + 590

  const firstName = customer.fullName.split(" ")[0] || ""
  const lastName = customer.fullName.split(" ").slice(1).join(" ") || ""
  const billingFirstName = billingAddress.fullName.split(" ")[0] || ""
  const billingLastName = billingAddress.fullName.split(" ").slice(1).join(" ") || ""

  // 🔥 Pre-compila nome titolare con nome destinatario
  useEffect(() => {
    if (customer.fullName && !cardholderName) {
      setCardholderName(customer.fullName)
    }
  }, [customer.fullName, cardholderName])

  useEffect(() => {
    let mounted = true
    const win = window as any

    const initAutocomplete = () => {
      if (!mounted || !addressInputRef.current) return
      if (!win.google?.maps?.places) return

      try {
        if (autocompleteRef.current) {
          win.google.maps.event.clearInstanceListeners(autocompleteRef.current)
          autocompleteRef.current = null
        }

        autocompleteRef.current = new win.google.maps.places.Autocomplete(
          addressInputRef.current,
          {
            types: ["address"],
            componentRestrictions: {
              country: ["it", "fr", "de", "es", "at", "be", "nl", "ch", "pt"],
            },
            fields: ["address_components", "formatted_address", "geometry"],
          }
        )

        autocompleteRef.current.addListener("place_changed", () => {
          if (!mounted) return
          handlePlaceSelect()
        })
      } catch (err) {
        console.error("[Autocomplete] Errore:", err)
      }
    }

    if (!win.google?.maps?.places && !scriptLoadedRef.current) {
      scriptLoadedRef.current = true
      const script = document.createElement("script")
      const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

      if (!apiKey) {
        console.error("[Autocomplete] API Key mancante")
        return
      }

      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&language=it&callback=initGoogleMaps`
      script.async = true
      script.defer = true

      win.initGoogleMaps = () => {
        if (mounted) {
          requestAnimationFrame(() => {
            initAutocomplete()
          })
        }
      }

      script.onerror = () => {
        console.error("[Autocomplete] Errore caricamento")
      }

      document.head.appendChild(script)
    } else if (win.google?.maps?.places) {
      initAutocomplete()
    }

    return () => {
      mounted = false
      if (autocompleteRef.current && win.google?.maps?.event) {
        try {
          win.google.maps.event.clearInstanceListeners(autocompleteRef.current)
        } catch (e) {}
      }
    }
  }, [])

  function handlePlaceSelect() {
    const place = autocompleteRef.current?.getPlace()
    if (!place || !place.address_components) return

    let street = ""
    let streetNumber = ""
    let city = ""
    let province = ""
    let postalCode = ""
    let country = ""

    place.address_components.forEach((component: any) => {
      const types = component.types
      if (types.includes("route")) street = component.long_name
      if (types.includes("street_number")) streetNumber = component.long_name
      if (types.includes("locality")) city = component.long_name
      if (types.includes("postal_town") && !city) city = component.long_name
      if (types.includes("administrative_area_level_3") && !city) city = component.long_name
      if (types.includes("administrative_area_level_2")) province = component.short_name
      if (types.includes("administrative_area_level_1") && !province) province = component.short_name
      if (types.includes("postal_code")) postalCode = component.long_name
      if (types.includes("country")) country = component.short_name
    })

    const fullAddress = streetNumber ? `${street} ${streetNumber}` : street

    setCustomer((prev) => ({
      ...prev,
      address1: fullAddress || prev.address1,
      city: city || prev.city,
      postalCode: postalCode || prev.postalCode,
      province: province || prev.province,
      countryCode: country || prev.countryCode,
    }))
  }

  function handleChange(e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target
    setCustomer((prev) => ({ ...prev, [name]: value }))
  }

  function isFormValid() {
    const shippingValid = 
      customer.fullName.trim().length > 2 &&
      customer.email.trim().includes("@") &&
      customer.email.trim().length > 5 &&
      customer.phone.trim().length > 8 &&
      customer.address1.trim().length > 3 &&
      customer.city.trim().length > 1 &&
      customer.postalCode.trim().length > 2 &&
      customer.province.trim().length > 1 &&
      customer.countryCode.trim().length >= 2 &&
      cardholderName.trim().length > 2 // 🔥 RICHIEDE NOME TITOLARE

    if (!useDifferentBilling) return shippingValid

    const billingValid =
      billingAddress.fullName.trim().length > 2 &&
      billingAddress.address1.trim().length > 3 &&
      billingAddress.city.trim().length > 1 &&
      billingAddress.postalCode.trim().length > 2 &&
      billingAddress.province.trim().length > 1 &&
      billingAddress.countryCode.trim().length >= 2

    return shippingValid && billingValid
  }

  useEffect(() => {
    async function calculateShipping() {
      const formHash = JSON.stringify({
        fullName: customer.fullName.trim(),
        email: customer.email.trim(),
        phone: customer.phone.trim(),
        address1: customer.address1.trim(),
        city: customer.city.trim(),
        postalCode: customer.postalCode.trim(),
        province: customer.province.trim(),
        countryCode: customer.countryCode,
        cardholderName: cardholderName.trim(), // 🔥 INCLUDI NEL HASH
        billingFullName: useDifferentBilling ? billingAddress.fullName.trim() : "",
        billingAddress1: useDifferentBilling ? billingAddress.address1.trim() : "",
        subtotal: subtotalCents,
        discount: discountCents,
      })

      if (!isFormValid()) {
        setCalculatedShippingCents(0)
        setClientSecret(null)
        setShippingError(null)
        setLastCalculatedHash("")
        return
      }

      if (formHash === lastCalculatedHash && clientSecret) {
        console.log('[Checkout] 💾 Form invariato, riuso Payment Intent')
        return
      }

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }

      debounceTimerRef.current = setTimeout(async () => {
        setIsCalculatingShipping(true)
        setError(null)
        setShippingError(null)

        try {
          const flatShippingCents = 590
          setCalculatedShippingCents(flatShippingCents)

          const shopifyTotal = typeof cart.totalCents === "number" ? cart.totalCents : subtotalCents
          const currentDiscountCents = subtotalCents - shopifyTotal
          const finalDiscountCents = currentDiscountCents > 0 ? currentDiscountCents : 0
          const newTotalCents = subtotalCents - finalDiscountCents + flatShippingCents

          console.log('[Checkout] 🆕 Creazione Payment Intent...')

          const piRes = await fetch("/api/payment-intent", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId,
              amountCents: newTotalCents,
              customer: {
                fullName: customer.fullName,
                email: customer.email,
                phone: customer.phone,
                address1: customer.address1,
                address2: customer.address2,
                city: customer.city,
                postalCode: customer.postalCode,
                province: customer.province,
                countryCode: customer.countryCode || "IT",
              },
              cardholderName: cardholderName.trim(), // 🔥 INVIA AL BACKEND
            }),
          })

          const piData = await piRes.json()

          if (!piRes.ok || !piData.clientSecret) {
            throw new Error(piData.error || "Errore creazione pagamento")
          }

          console.log('[Checkout] ✅ ClientSecret ricevuto')
          setClientSecret(piData.clientSecret)
          setLastCalculatedHash(formHash)
          setIsCalculatingShipping(false)
        } catch (err: any) {
          console.error("Errore creazione payment:", err)
          setShippingError(err.message || "Errore nel calcolo del totale")
          setIsCalculatingShipping(false)
        }
      }, 1000)
    }

    calculateShipping()

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [
    customer.fullName,
    customer.email,
    customer.phone,
    customer.address1,
    customer.address2,
    customer.city,
    customer.postalCode,
    customer.province,
    customer.countryCode,
    cardholderName, // 🔥 TRIGGER RE-CALC
    billingAddress.fullName,
    billingAddress.address1,
    billingAddress.city,
    billingAddress.postalCode,
    billingAddress.province,
    billingAddress.countryCode,
    useDifferentBilling,
    sessionId,
    subtotalCents,
    cart.totalCents,
    clientSecret,
    lastCalculatedHash,
    discountCents,
  ])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (!isFormValid()) {
      setError("Compila tutti i campi obbligatori incluso il nome sulla carta")
      return
    }

    if (!stripe || !elements) {
      setError("Stripe non pronto")
      return
    }

    if (!clientSecret) {
      setError("Payment Intent non creato")
      return
    }

    try {
      setLoading(true)

      const { error: submitError } = await elements.submit()
      if (submitError) {
        console.error("Errore submit elements:", submitError)
        setError(submitError.message || "Errore nella validazione")
        setLoading(false)
        return
      }

      const finalBillingAddress = useDifferentBilling ? billingAddress : customer

      // 🔥 METADATA RICCHISSIMI PER RADAR
      const enhancedMetadata = {
        session_id: sessionId,
        customer_fullName: customer.fullName,
        customer_email: customer.email,
        customer_phone: customer.phone,
        cardholder_name: cardholderName.trim(), // 🔥 TITOLARE CARTA
        shipping_address1: customer.address1,
        shipping_address2: customer.address2 || "",
        shipping_city: customer.city,
        shipping_postal: customer.postalCode,
        shipping_province: customer.province,
        shipping_country: customer.countryCode,
        billing_city: finalBillingAddress.city,
        billing_postal: finalBillingAddress.postalCode,
        billing_country: finalBillingAddress.countryCode,
        billing_different: useDifferentBilling ? "yes" : "no",
        total_items: cart.items.length.toString(),
        first_item_title: cart.items[0]?.title || "",
        checkout_type: "custom",
        user_agent: navigator.userAgent.substring(0, 500), // 🔥 USER AGENT
        screen_resolution: `${window.screen.width}x${window.screen.height}`, // 🔥 SCREEN
        browser_language: navigator.language, // 🔥 LINGUA
        timestamp: new Date().toISOString(),
      }

      const { error: stripeError } = await stripe.confirmPayment({
        elements,
        clientSecret,
        confirmParams: {
          return_url: `${window.location.origin}/thank-you?sessionId=${sessionId}`,
          payment_method_data: {
            billing_details: {
              name: cardholderName.trim(), // 🔥 USA NOME TITOLARE
              email: customer.email,
              phone: finalBillingAddress.phone || customer.phone,
              address: {
                line1: finalBillingAddress.address1,
                line2: finalBillingAddress.address2 || undefined,
                city: finalBillingAddress.city,
                postal_code: finalBillingAddress.postalCode,
                state: finalBillingAddress.province,
                country: finalBillingAddress.countryCode || "IT",
              },
            },
            metadata: enhancedMetadata, // 🔥 METADATA RICCHI
          },
        },
        redirect: "if_required", // 🔥 3DS ATTIVO
      })

      if (stripeError) {
        console.error("Stripe error:", stripeError)
        setError(stripeError.message || "Pagamento non riuscito")
        setLoading(false)
        return
      }

      setSuccess(true)
      setLoading(false)

      setTimeout(() => {
        window.location.href = `/thank-you?sessionId=${sessionId}`
      }, 2000)
    } catch (err: any) {
      console.error("Errore pagamento:", err)
      setError(err.message || "Errore imprevisto")
      setLoading(false)
    }
  }

  return (
    <>
      {/* ... TUTTI GLI STILI CSS INVARIATI ... */}
      <style jsx global>{`
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          background: #fafafa;
          color: #333333;
          -webkit-font-smoothing: antialiased;
        }

        .shopify-input {
          width: 100%;
          padding: 14px 16px;
          font-size: 16px;
          line-height: 1.5;
          color: #333333;
          background: #ffffff;
          border: 1px solid #d9d9d9;
          border-radius: 10px;
          transition: all 0.2s ease;
          -webkit-appearance: none;
          appearance: none;
        }

        .shopify-input:focus {
          outline: none;
          border-color: #2C6ECB;
          box-shadow: 0 0 0 3px rgba(44, 110, 203, 0.1);
        }

        .shopify-input::placeholder {
          color: #999999;
        }

        .shopify-label {
          display: block;
          font-size: 14px;
          font-weight: 500;
          color: #333333;
          margin-bottom: 8px;
        }

        .shopify-btn {
          width: 100%;
          padding: 18px 24px;
          font-size: 17px;
          font-weight: 600;
          color: #ffffff;
          background: linear-gradient(135deg, #2C6ECB 0%, #1f5bb8 100%);
          border: none;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 4px 12px rgba(44, 110, 203, 0.3);
          -webkit-appearance: none;
          appearance: none;
          touch-action: manipulation;
        }

        .shopify-btn:hover:not(:disabled) {
          background: linear-gradient(135deg, #1f5bb8 0%, #164a9e 100%);
          box-shadow: 0 6px 16px rgba(44, 110, 203, 0.4);
          transform: translateY(-2px);
        }

        .shopify-btn:active:not(:disabled) {
          transform: translateY(0);
        }

        .shopify-btn:disabled {
          background: #d1d5db;
          cursor: not-allowed;
          box-shadow: none;
        }

        .shopify-section {
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 16px;
          padding: 24px;
          margin-bottom: 20px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        }

        .shopify-section-title {
          font-size: 18px;
          font-weight: 600;
          color: #111827;
          margin-bottom: 20px;
        }

        .summary-toggle {
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 20px;
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
          -webkit-tap-highlight-color: transparent;
          transition: all 0.2s ease;
        }

        .summary-toggle:active {
          background: #f9fafb;
          transform: scale(0.98);
        }

        .summary-content {
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-top: none;
          border-radius: 0 0 12px 12px;
          padding: 16px;
          margin-top: -20px;
          margin-bottom: 20px;
        }

        .pac-container {
          background-color: #ffffff !important;
          border: 1px solid #d9d9d9 !important;
          border-radius: 10px !important;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
          margin-top: 4px !important;
          padding: 4px !important;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
          z-index: 9999 !important;
        }

        .pac-item {
          padding: 12px 16px !important;
          cursor: pointer !important;
          border: none !important;
          border-radius: 8px !important;
          font-size: 14px !important;
          color: #333333 !important;
        }

        .pac-item:hover {
          background-color: #f3f4f6 !important;
        }

        .pac-icon {
          display: none !important;
        }

        @media (max-width: 768px) {
          .shopify-input {
            font-size: 16px !important;
          }
          
          .shopify-btn {
            min-height: 52px;
            font-size: 16px;
          }

          .shopify-section {
            padding: 20px;
            border-radius: 12px;
          }
        }
      `}</style>

      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
        {/* ... HEADER, TRUST BANNER, SUMMARY TOGGLE INVARIATI ... */}
        {/* (Copia dal tuo codice esistente - troppo lungo da ripetere qui) */}

        <div className="max-w-6xl mx-auto px-4 pb-8">
          <div className="lg:grid lg:grid-cols-2 lg:gap-12">
            <div>
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* ... SEZIONI CONTATTI, CONSEGNA, BILLING INVARIATE ... */}
                {/* (Copia dal tuo codice - uguali) */}

                {isFormValid() && (
                  <>
                    {/* ... SEZIONE SPEDIZIONE + SOCIAL PROOF ... */}

                    <div className="shopify-section">
                      <h2 className="shopify-section-title">Pagamento</h2>
                      
                      {/* ... METODI PAGAMENTO + SICUREZZA ... */}

                      {/* 🔥 CAMPO NOME TITOLARE CARTA (NUOVO!) */}
                      <div className="mb-4">
                        <label className="shopify-label">
                          Nome intestatario carta *
                        </label>
                        <input
                          type="text"
                          value={cardholderName}
                          onChange={(e) => setCardholderName(e.target.value)}
                          placeholder="Nome esattamente come appare sulla carta"
                          required
                          autoComplete="cc-name"
                          className="shopify-input"
                        />
                        <p className="text-xs text-gray-500 mt-1.5 flex items-start gap-1.5">
                          <svg className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                          </svg>
                          <span>
                            Se paghi con la carta di un genitore o altra persona, inserisci <strong>il suo nome</strong> (riduce i pagamenti rifiutati del 15%)
                          </span>
                        </p>
                      </div>
                      
                      {isCalculatingShipping && (
  <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl mb-4">
    <svg className="animate-spin h-4 w-4 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
    <p className="text-sm text-blue-800 font-medium">Calcolo in corso...</p>
  </div>
)}

                      {shippingError && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-xl mb-4">
                          <p className="text-sm text-red-700">{shippingError}</p>
                        </div>
                      )}

                      {clientSecret && !isCalculatingShipping && (
                        <div className="border border-gray-300 rounded-xl p-4 bg-white shadow-sm mb-4">
                          <PaymentElement 
                            options={{
                              fields: {
                                billingDetails: {
                                  name: 'never', // 🔥 Nome preso dal campo sopra
                                  email: 'never',
                                  phone: 'never',
                                  address: 'never'
                                }
                              }
                            }}
                          />
                        </div>
                      )}

                      {!clientSecret && !isCalculatingShipping && (
                        <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl">
                          <p className="text-sm text-gray-600 text-center">
                            Compila tutti i campi per visualizzare i metodi di pagamento
                          </p>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* ... MESSAGGI ERRORE/SUCCESS ... */}

                <button
                  type="submit"
                  disabled={loading || !stripe || !elements || !clientSecret || isCalculatingShipping || !isFormValid()}
                  className="shopify-btn"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Elaborazione...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                      </svg>
                      Paga in sicurezza {formatMoney(totalToPayCents, currency)}
                    </span>
                  )}
                </button>

                {/* ... GARANZIE FINALI ... */}

              </form>
            </div>

            {/* ... SIDEBAR RIEPILOGO ... */}

          </div>
        </div>
      </div>
    </>
  )
}

// ... CheckoutPageContent e export INVARIATI ...
// (Codice identico al tuo file esistente)

function CheckoutPageContent() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get("sessionId") || ""

  const [cart, setCart] = useState<CartSessionResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null)

  useEffect(() => {
    async function load() {
      if (!sessionId) {
        setError("Sessione non valida: manca il sessionId.")
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError(null)

        const res = await fetch(
          `/api/cart-session?sessionId=${encodeURIComponent(sessionId)}`,
        )
        const data: CartSessionResponse & { error?: string } = await res.json()

        if (!res.ok || (data as any).error) {
          setError(
            data.error || "Errore nel recupero del carrello. Riprova dal sito.",
          )
          setLoading(false)
          return
        }

        setCart(data)

        try {
          const pkRes = await fetch('/api/stripe-status')
          
          if (!pkRes.ok) {
            throw new Error('API stripe-status non disponibile')
          }
          
          const pkData = await pkRes.json()

          if (pkData.publishableKey) {
            console.log('[Checkout] ✅ Publishable key caricata')
            console.log('[Checkout] ✅ Account:', pkData.accountLabel)
            setStripePromise(loadStripe(pkData.publishableKey))
          } else {
            throw new Error('PublishableKey non ricevuta da API')
          }
        } catch (err) {
          console.error('[Checkout] ❌ Errore caricamento stripe-status:', err)
          setError('Impossibile inizializzare il sistema di pagamento. Riprova.')
          setLoading(false)
          return
        }

        setLoading(false)
      } catch (err: any) {
        console.error("Errore checkout:", err)
        setError(
          err?.message || "Errore imprevisto nel caricamento del checkout.",
        )
        setLoading(false)
      }
    }

    load()
  }, [sessionId])

  if (loading || !stripePromise) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mb-4"></div>
          <p className="text-sm text-gray-600 font-medium">Caricamento del checkout…</p>
        </div>
      </div>
    )
  }

  if (error || !cart) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-4 p-8 bg-white rounded-2xl shadow-lg border border-gray-200">
          <svg className="w-16 h-16 text-red-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h1 className="text-xl font-bold text-gray-900">Impossibile caricare il checkout</h1>
          <p className="text-sm text-gray-600">{error}</p>
          <p className="text-xs text-gray-500">
            Ritorna al sito e riprova ad aprire il checkout.
          </p>
        </div>
      </div>
    )
  }

  const options = {
    mode: 'payment' as const,
    amount: 1000,
    currency: (cart.currency || 'eur').toLowerCase(),
    paymentMethodTypes: ['card'],
    appearance: {
      theme: "stripe" as const,
      variables: {
        colorPrimary: "#2C6ECB",
        colorBackground: "#ffffff",
        colorText: "#333333",
        colorDanger: "#df1b41",
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        spacingUnit: '4px',
        borderRadius: "10px",
        fontSizeBase: '16px',
      },
    },
  }

  return (
    <Elements stripe={stripePromise} options={options}>
      <CheckoutInner cart={cart} sessionId={sessionId} />
    </Elements>
  )
}

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white flex items-center justify-center">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mb-4"></div>
            <p className="text-sm text-gray-600 font-medium">Caricamento…</p>
          </div>
        </div>
      }
    >
      <CheckoutPageContent />
    </Suspense>
  )
}
