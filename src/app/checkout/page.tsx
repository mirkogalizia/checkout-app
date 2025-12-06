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

// Types (unchanged)...
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

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [orderSummaryExpanded, setOrderSummaryExpanded] = useState(false)
  
  // 🔥 NUOVO: Stato per controllare quando mostrare PaymentElement
  const [showPaymentElement, setShowPaymentElement] = useState(false)
  const [paymentElementReady, setPaymentElementReady] = useState(false)

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

  // Validazione form spedizione
  function isShippingValid() {
    return (
      customer.fullName.trim().length > 2 &&
      customer.email.trim().includes("@") &&
      customer.email.trim().length > 5 &&
      customer.phone.trim().length > 8 &&
      customer.address1.trim().length > 3 &&
      customer.city.trim().length > 1 &&
      customer.postalCode.trim().length > 2 &&
      customer.province.trim().length > 1 &&
      customer.countryCode.trim().length >= 2
    )
  }

  function isBillingValid() {
    if (!useDifferentBilling) return true
    
    return (
      billingAddress.fullName.trim().length > 2 &&
      billingAddress.address1.trim().length > 3 &&
      billingAddress.city.trim().length > 1 &&
      billingAddress.postalCode.trim().length > 2 &&
      billingAddress.province.trim().length > 1 &&
      billingAddress.countryCode.trim().length >= 2
    )
  }

  function isFormValid() {
    return isShippingValid() && isBillingValid()
  }

  // 🔥 Mostra PaymentElement SOLO quando i dati di spedizione sono completi
  useEffect(() => {
    if (isFormValid() && !showPaymentElement) {
      console.log('✅ Dati spedizione completi, mostro form carta')
      setShowPaymentElement(true)
    } else if (!isFormValid() && showPaymentElement) {
      console.log('⚠️ Dati spedizione incompleti, nascondo form carta')
      setShowPaymentElement(false)
      setPaymentElementReady(false)
    }
  }, [
    customer.fullName,
    customer.email,
    customer.phone,
    customer.address1,
    customer.city,
    customer.postalCode,
    customer.province,
    customer.countryCode,
    billingAddress.fullName,
    billingAddress.address1,
    billingAddress.city,
    billingAddress.postalCode,
    billingAddress.province,
    billingAddress.countryCode,
    useDifferentBilling,
  ])

  // Google Places Autocomplete
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

  // 🔥 FLUSSO PAGAMENTO: Click "Paga" → Crea PI → Conferma Pagamento
  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (!isFormValid()) {
      setError("Compila tutti i campi di spedizione")
      return
    }

    if (!stripe || !elements) {
      setError("Sistema di pagamento non pronto")
      return
    }

    if (!paymentElementReady) {
      setError("Inserisci i dati della carta di credito")
      return
    }

    // Previeni doppio click
    if (loading) {
      return
    }

    try {
      setLoading(true)
      console.log('🚀 Inizio processo di pagamento')

      // STEP 1: Valida i dati della carta
      const { error: submitError } = await elements.submit()
      if (submitError) {
        console.error("❌ Errore validazione carta:", submitError)
        setError(submitError.message || "Dati carta non validi")
        setLoading(false)
        return
      }

      console.log('✅ Dati carta validati')

      // STEP 2: Crea Draft Order in Shopify
      console.log('📦 Creazione ordine Shopify...')
      
      const draftOrderRes = await fetch("/api/create-draft-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          customer: {
            fullName: customer.fullName,
            email: customer.email,
            phone: customer.phone,
            address1: customer.address1,
            address2: customer.address2,
            city: customer.city,
            postalCode: customer.postalCode,
            province: customer.province,
            countryCode: customer.countryCode,
          },
          billing: useDifferentBilling ? billingAddress : customer,
        }),
      })

      const draftOrderData = await draftOrderRes.json()
      
      if (!draftOrderRes.ok) {
        throw new Error(draftOrderData.error || "Errore creazione ordine")
      }

      const shopifyOrderId = draftOrderData.orderId
      console.log('✅ Ordine Shopify creato:', shopifyOrderId)

      // STEP 3: Crea Payment Intent (UNA SOLA VOLTA)
      console.log('💳 Creazione Payment Intent...')
      
      const piRes = await fetch("/api/payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          shopifyOrderId,
          amountCents: totalToPayCents,
          customer: {
            fullName: customer.fullName,
            email: customer.email,
            phone: customer.phone,
            address1: customer.address1,
            address2: customer.address2,
            city: customer.city,
            postalCode: customer.postalCode,
            province: customer.province,
            countryCode: customer.countryCode,
          },
        }),
      })

      const piData = await piRes.json()

      if (!piRes.ok || !piData.clientSecret) {
        throw new Error(piData.error || "Errore inizializzazione pagamento")
      }

      const clientSecret = piData.clientSecret
      console.log('✅ Payment Intent creato:', piData.id)

      // STEP 4: Conferma il pagamento con 3DS
      const finalBillingAddress = useDifferentBilling ? billingAddress : customer

      console.log('🔐 Conferma pagamento + 3DS...')
      
      const { error: stripeError } = await stripe.confirmPayment({
        elements,
        clientSecret,
        confirmParams: {
          return_url: `${window.location.origin}/thank-you?sessionId=${sessionId}&orderId=${shopifyOrderId}`,
          payment_method_data: {
            billing_details: {
              name: finalBillingAddress.fullName || customer.fullName,
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
            metadata: {
              session_id: sessionId,
              shopify_order_id: shopifyOrderId,
              customer_fullName: customer.fullName,
              customer_email: customer.email,
              shipping_city: customer.city,
              shipping_postal: customer.postalCode,
              shipping_country: customer.countryCode,
              checkout_type: "custom",
            },
          },
        },
        redirect: "if_required",
      })

      if (stripeError) {
        console.error("❌ Errore Stripe:", stripeError)
        setError(stripeError.message || "Pagamento rifiutato. Riprova con un'altra carta.")
        setLoading(false)
        return
      }

      console.log('✅ Pagamento completato con successo!')
      setSuccess(true)
      setLoading(false)

      setTimeout(() => {
        window.location.href = `/thank-you?sessionId=${sessionId}&orderId=${shopifyOrderId}`
      }, 1500)

    } catch (err: any) {
      console.error("❌ Errore generale:", err)
      setError(err.message || "Errore durante il pagamento. Riprova.")
      setLoading(false)
    }
  }

  return (
    <>
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

        /* Payment Element Loading Animation */
        .payment-loading {
          padding: 40px;
          text-align: center;
          background: #f9fafb;
          border-radius: 12px;
          border: 2px dashed #e5e7eb;
        }

        .payment-locked {
          padding: 40px;
          text-align: center;
          background: #fef3c7;
          border-radius: 12px;
          border: 2px solid #fbbf24;
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
        {/* Header */}
        <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-200 shadow-sm">
          <div className="max-w-6xl mx-auto px-4 py-4">
            <div className="flex justify-between items-center">
              <a href={cartUrl} className="flex items-center gap-2">
                <img
                  src="https://cdn.shopify.com/s/files/1/0899/2188/0330/files/logo_checkify_d8a640c7-98fe-4943-85c6-5d1a633416cf.png?v=1761832152"
                  alt="Logo"
                  className="h-10"
                  style={{ maxWidth: '160px' }}
                />
              </a>

              <div className="hidden md:flex items-center gap-6">
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                  <span className="font-medium">SSL Sicuro</span>
                </div>

                <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 rounded-full border border-emerald-200">
                  <svg className="w-4 h-4 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-xs font-semibold text-emerald-700">Pagamento Protetto</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Trust Banner */}
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 rounded-2xl p-4 md:p-5 border border-blue-100 shadow-sm">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
              <div className="flex items-center gap-3 bg-white/80 backdrop-blur-sm rounded-xl px-3 py-3 shadow-sm">
                <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center shadow-md">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-gray-900 leading-tight">Pagamenti</p>
                  <p className="text-xs text-gray-600 leading-tight">100% Sicuri</p>
                </div>
              </div>

              <div className="flex items-center gap-3 bg-white/80 backdrop-blur-sm rounded-xl px-3 py-3 shadow-sm">
                <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center shadow-md">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                    <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-1 1v6.05A2.5 2.5 0 0115.95 16H17a1 1 0 001-1v-5a1 1 0 00-.293-.707l-2-2A1 1 0 0015 7h-1z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-gray-900 leading-tight">Spedizione</p>
                  <p className="text-xs text-gray-600 leading-tight">24/48 ore</p>
                </div>
              </div>

              <div className="flex items-center gap-3 bg-white/80 backdrop-blur-sm rounded-xl px-3 py-3 shadow-sm">
                <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-orange-400 to-orange-600 rounded-full flex items-center justify-center shadow-md">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-gray-900 leading-tight">Reso Facile</p>
                  <p className="text-xs text-gray-600 leading-tight">Entro 14 gg</p>
                </div>
              </div>

              <div className="flex items-center gap-3 bg-white/80 backdrop-blur-sm rounded-xl px-3 py-3 shadow-sm">
                <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-purple-400 to-purple-600 rounded-full flex items-center justify-center shadow-md">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-gray-900 leading-tight">Supporto</p>
                  <p className="text-xs text-gray-600 leading-tight">7 giorni/7</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-6xl mx-auto px-4 pb-8">
          <div className="lg:grid lg:grid-cols-2 lg:gap-12">
            
            {/* Left Column - Form */}
            <div>
              <form onSubmit={handleSubmit} className="space-y-5">
                
                {/* Step 1: Contact */}
                <div className="shopify-section">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                      1
                    </div>
                    <h2 className="shopify-section-title mb-0">Contatti</h2>
                  </div>
                  
                  <div>
                    <label className="shopify-label">Email *</label>
                    <input
                      type="email"
                      name="email"
                      value={customer.email}
                      onChange={handleChange}
                      className="shopify-input"
                      placeholder="mario.rossi@esempio.com"
                      required
                      autoComplete="email"
                    />
                  </div>
                </div>

                {/* Step 2: Delivery */}
                <div className="shopify-section">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                      2
                    </div>
                    <h2 className="shopify-section-title mb-0">Consegna</h2>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="shopify-label">Paese / Regione *</label>
                      <select
                        name="countryCode"
                        value={customer.countryCode}
                        onChange={handleChange}
                        className="shopify-input"
                        required
                      >
                        <option value="IT">Italia</option>
                        <option value="FR">Francia</option>
                        <option value="DE">Germania</option>
                        <option value="ES">Spagna</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="shopify-label">Nome *</label>
                        <input
                          type="text"
                          value={firstName}
                          onChange={(e) => {
                            setCustomer(prev => ({
                              ...prev,
                              fullName: `${e.target.value} ${lastName}`.trim()
                            }))
                          }}
                          className="shopify-input"
                          placeholder="Mario"
                          required
                          autoComplete="given-name"
                        />
                      </div>

                      <div>
                        <label className="shopify-label">Cognome *</label>
                        <input
                          type="text"
                          value={lastName}
                          onChange={(e) => {
                            setCustomer(prev => ({
                              ...prev,
                              fullName: `${firstName} ${e.target.value}`.trim()
                            }))
                          }}
                          className="shopify-input"
                          placeholder="Rossi"
                          required
                          autoComplete="family-name"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="shopify-label">Indirizzo *</label>
                      <input
                        ref={addressInputRef}
                        type="text"
                        name="address1"
                        value={customer.address1}
                        onChange={handleChange}
                        className="shopify-input"
                        placeholder="Via Roma 123"
                        required
                        autoComplete="address-line1"
                      />
                    </div>

                    <div>
                      <label className="shopify-label">Interno, scala, ecc. (facoltativo)</label>
                      <input
                        type="text"
                        name="address2"
                        value={customer.address2}
                        onChange={handleChange}
                        className="shopify-input"
                        placeholder="Scala B, Piano 3"
                        autoComplete="address-line2"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="shopify-label">CAP *</label>
                        <input
                          type="text"
                          name="postalCode"
                          value={customer.postalCode}
                          onChange={handleChange}
                          className="shopify-input"
                          placeholder="00100"
                          required
                          autoComplete="postal-code"
                        />
                      </div>

                      <div className="col-span-2">
                        <label className="shopify-label">Città *</label>
                        <input
                          type="text"
                          name="city"
                          value={customer.city}
                          onChange={handleChange}
                          className="shopify-input"
                          placeholder="Roma"
                          required
                          autoComplete="address-level2"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="shopify-label">Provincia *</label>
                      <input
                        type="text"
                        name="province"
                        value={customer.province}
                        onChange={handleChange}
                        className="shopify-input"
                        placeholder="RM"
                        required
                        autoComplete="address-level1"
                      />
                    </div>

                    <div>
                      <label className="shopify-label">Telefono *</label>
                      <input
                        type="tel"
                        name="phone"
                        value={customer.phone}
                        onChange={handleChange}
                        className="shopify-input"
                        placeholder="+39 123 456 7890"
                        required
                        autoComplete="tel"
                      />
                    </div>
                  </div>
                </div>

                {/* Billing Address Checkbox */}
                <div className="flex items-start gap-2 p-4 bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl border border-gray-200">
                  <input 
                    type="checkbox" 
                    id="differentBilling" 
                    checked={useDifferentBilling}
                    onChange={(e) => setUseDifferentBilling(e.target.checked)}
                    className="w-4 h-4 mt-0.5 flex-shrink-0 rounded" 
                  />
                  <label htmlFor="differentBilling" className="text-sm text-gray-700 leading-relaxed cursor-pointer font-medium">
                    Usa un indirizzo di fatturazione diverso
                  </label>
                </div>

                {/* Billing Address Section (if different) */}
                {useDifferentBilling && (
                  <div className="shopify-section">
                    <h2 className="shopify-section-title">Fatturazione</h2>
                    {/* Add billing fields similar to shipping */}
                  </div>
                )}

                {/* Step 3: Payment */}
                <div className="shopify-section">
                  <div className="flex items-center gap-2 mb-4">
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                      showPaymentElement ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'
                    }`}>
                      3
                    </div>
                    <h2 className="shopify-section-title mb-0">Pagamento</h2>
                  </div>
                  
                  {!showPaymentElement ? (
                    <div className="payment-locked">
                      <svg className="w-12 h-12 text-yellow-600 mx-auto mb-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                      </svg>
                      <p className="text-sm font-medium text-yellow-900 mb-1">
                        Completa i dati di consegna
                      </p>
                      <p className="text-xs text-yellow-700">
                        Inserisci tutti i campi obbligatori per procedere al pagamento
                      </p>
                    </div>
                  ) : (
                    <div className="mt-4">
                      <PaymentElement 
                        onReady={() => {
                          console.log('✅ PaymentElement pronto')
                          setPaymentElementReady(true)
                        }}
                        options={{
                          layout: {
                            type: 'tabs',
                            defaultCollapsed: false,
                          }
                        }}
                      />
                    </div>
                  )}
                </div>

                {/* Error Message */}
                {error && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      <p className="text-sm text-red-700 font-medium">{error}</p>
                    </div>
                  </div>
                )}

                {/* Success Message */}
                {success && (
                  <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <div>
                        <p className="text-sm text-green-700 font-semibold">Pagamento completato!</p>
                        <p className="text-xs text-green-600 mt-1">Reindirizzamento alla pagina di ringraziamento...</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={loading || !stripe || !elements || !isFormValid() || !paymentElementReady}
                  className="shopify-btn"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-3">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>Elaborazione pagamento sicuro...</span>
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                      </svg>
                      <span>Paga in Sicurezza {formatMoney(totalToPayCents, currency)}</span>
                    </span>
                  )}
                </button>

                {/* Trust Footer */}
                <div className="text-center space-y-2">
                  <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
                    <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                    </svg>
                    <span>Pagamento protetto con crittografia SSL 256-bit</span>
                  </div>
                  <p className="text-xs text-gray-400">
                    I tuoi dati sono al sicuro. Non memorizziamo le informazioni della carta.
                  </p>
                </div>
              </form>
            </div>

            {/* Right Column - Order Summary (Desktop) */}
            <div className="hidden lg:block">
              <div className="sticky top-24">
                <div className="bg-white rounded-xl shadow-sm border p-6">
                  <h2 className="text-lg font-semibold mb-4">Riepilogo ordine</h2>

                  <div className="space-y-4 mb-6">
                    {cart.items.map((item, index) => (
                      <div key={index} className="flex items-center justify-between pb-4 border-b">
                        <div className="flex items-center space-x-3">
                          <div className="relative h-16 w-16 rounded-lg overflow-hidden border">
                            <img
                              src={item.image || "/placeholder-product.png"}
                              alt={item.title}
                              className="h-full w-full object-cover"
                            />
                            <div className="absolute -top-2 -right-2 bg-gray-800 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center font-medium">
                              {item.quantity}
                            </div>
                          </div>

                          <div className="text-sm">
                            <p className="font-medium text-gray-900">{item.title}</p>
                            {item.variantTitle && (
                              <p className="text-gray-500 text-xs mt-1">{item.variantTitle}</p>
                            )}
                          </div>
                        </div>

                        <div className="text-sm font-semibold text-gray-900">
                          {formatMoney(item.linePriceCents ?? item.priceCents ?? 0, currency)}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Totals */}
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between text-gray-700">
                      <span>Subtotale</span>
                      <span className="font-medium">{formatMoney(subtotalCents, currency)}</span>
                    </div>

                    {discountCents > 0 && (
                      <div className="flex justify-between text-green-600">
                        <span className="flex items-center gap-1">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                          </svg>
                          Sconto applicato
                        </span>
                        <span className="font-medium">-{formatMoney(discountCents, currency)}</span>
                      </div>
                    )}

                    <div className="flex justify-between text-gray-700">
                      <span>Spedizione</span>
                      <span className="font-medium">€5,90</span>
                    </div>

                    <div className="flex justify-between text-lg font-bold border-t pt-4 mt-4">
                      <span>Totale</span>
                      <span>{formatMoney(totalToPayCents, currency)}</span>
                    </div>
                  </div>

                  {/* Trust Badges */}
                  <div className="mt-6 pt-6 border-t">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="text-xs">
                        <svg className="w-6 h-6 text-green-600 mx-auto mb-1" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                        </svg>
                        <p className="text-gray-600 font-medium">Sicuro</p>
                      </div>
                      <div className="text-xs">
                        <svg className="w-6 h-6 text-blue-600 mx-auto mb-1" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                          <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-1 1v6.05A2.5 2.5 0 0115.95 16H17a1 1 0 001-1v-5a1 1 0 00-.293-.707l-2-2A1 1 0 0015 7h-1z" />
                        </svg>
                        <p className="text-gray-600 font-medium">Veloce</p>
                      </div>
                      <div className="text-xs">
                        <svg className="w-6 h-6 text-orange-600 mx-auto mb-1" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                        </svg>
                        <p className="text-gray-600 font-medium">Reso 14gg</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </>
  )
}

// ========== WRAPPER COMPONENT CORRETTO ==========
function CheckoutPageContent() {
  const searchParams = useSearchParams()
  const sessionId = searchParams?.get("sessionId") || "" // 🔥 FIX: Optional chaining

  const [cart, setCart] = useState<CartSessionResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  
  const stripePromise = useMemo(() => 
    loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!),
    []
  )

  useEffect(() => {
    async function load() {
      if (!sessionId) {
        setError("Sessione non valida: manca il sessionId.")
        setLoading(false)
        return
      }

      try {
        const res = await fetch(
          `/api/cart-session?sessionId=${encodeURIComponent(sessionId)}`
        )
        const data: CartSessionResponse = await res.json()

        if (!res.ok || data.error) {
          setError(data.error || "Errore nel recupero del carrello.")
          setLoading(false)
          return
        }

        setCart(data)
        setLoading(false)
      } catch (err: any) {
        console.error("Errore checkout:", err)
        setError(err.message || "Errore imprevisto.")
        setLoading(false)
      }
    }

    load()
  }, [sessionId])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600">Caricamento checkout…</p>
        </div>
      </div>
    )
  }

  if (error || !cart) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md p-8 bg-white shadow rounded-xl border text-center">
          <h1 className="text-xl font-bold">Impossibile caricare il checkout</h1>
          <p className="text-sm text-gray-600 mt-2">{error}</p>
        </div>
      </div>
    )
  }

  const options = useMemo(() => {
    const subtotalCents = cart.subtotalCents || 0
    const discountCents = cart.totalCents ? subtotalCents - cart.totalCents : 0
    const totalToPayCents = subtotalCents - discountCents + 590

    return {
      mode: 'payment' as const,
      amount: totalToPayCents,
      currency: (cart.currency || 'eur').toLowerCase(),
      appearance: {
        theme: "stripe" as const,
        variables: {
          colorPrimary: "#2C6ECB",
          colorBackground: "#ffffff",
          colorText: "#333333",
          borderRadius: "10px",
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        },
      },
    }
  }, [cart])

  return (
    <Elements stripe={stripePromise} options={options}>
      <CheckoutInner cart={cart} sessionId={sessionId} />
    </Elements>
  )
}

// ========== EXPORT COMPONENT (CORRETTO) ==========
export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="animate-spin h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-gray-600">Caricamento…</p>
          </div>
        </div>
      }
    >
      <CheckoutPageContent />
    </Suspense>
  )
}