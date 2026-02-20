// src/app/checkout/page.tsx
// ═══════════════════════════════════════════
// NFR CHECKOUT — Redesign B&W Editoriale
// Sostituisce SOLO la parte visual (CSS + JSX)
// La logica React/Stripe rimane IDENTICA
// ═══════════════════════════════════════════

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
import Script from "next/script"
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
  paymentIntentId?: string
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
    if (cart.shopDomain) return `https://${cart.shopDomain}/cart`
    return 'https://notforresale.it/cart'
  }, [cart.shopDomain])

  const [customer, setCustomer] = useState<CustomerForm>({
    fullName: "", email: "", phone: "", address1: "", address2: "",
    city: "", postalCode: "", province: "", countryCode: "IT",
  })
  const [useDifferentBilling, setUseDifferentBilling] = useState(false)
  const [billingAddress, setBillingAddress] = useState<CustomerForm>({
    fullName: "", email: "", phone: "", address1: "", address2: "",
    city: "", postalCode: "", province: "", countryCode: "IT",
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [calculatedShippingCents, setCalculatedShippingCents] = useState<number>(0)
  const [isCalculatingShipping, setIsCalculatingShipping] = useState(false)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [shippingError, setShippingError] = useState<string | null>(null)
  const [orderSummaryExpanded, setOrderSummaryExpanded] = useState(false)
  const [fbPixelSent, setFbPixelSent] = useState(false)
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

  const SHIPPING_COST_CENTS = 590
  const shippingToApply = SHIPPING_COST_CENTS
  const totalToPayCents = subtotalCents - discountCents + shippingToApply

  const firstName = customer.fullName.split(" ")[0] || ""
  const lastName = customer.fullName.split(" ").slice(1).join(" ") || ""
  const billingFirstName = billingAddress.fullName.split(" ")[0] || ""
  const billingLastName = billingAddress.fullName.split(" ").slice(1).join(" ") || ""

  // ── FACEBOOK PIXEL ──────────────────────────────
  useEffect(() => {
    if (fbPixelSent) return
    const sendFBPixel = async () => {
      if (typeof window !== 'undefined' && (window as any).fbq && cart.items.length > 0) {
        const attrs = cart.rawCart?.attributes || {}
        const utm = { source: attrs._wt_last_source, medium: attrs._wt_last_medium, campaign: attrs._wt_last_campaign, content: attrs._wt_last_content, term: attrs._wt_last_term }
        const contentIds = cart.items.map(item => String(item.id)).filter(Boolean)
        const eventId = cart.paymentIntentId || sessionId
        ;(window as any).fbq('track', 'InitiateCheckout', { value: totalToPayCents / 100, currency, content_ids: contentIds, content_type: 'product', num_items: cart.items.reduce((sum, item) => sum + item.quantity, 0), ...utm }, { eventID: eventId })
        setFbPixelSent(true)
      }
    }
    if ((window as any).fbq) { sendFBPixel() } else {
      const checkFbq = setInterval(() => { if ((window as any).fbq) { clearInterval(checkFbq); sendFBPixel() } }, 100)
      setTimeout(() => clearInterval(checkFbq), 5000)
    }
  }, [fbPixelSent, cart, totalToPayCents, currency, sessionId])

  // ── GOOGLE AUTOCOMPLETE ──────────────────────────
  useEffect(() => {
    let mounted = true
    const win = window as any
    const initAutocomplete = () => {
      if (!mounted || !addressInputRef.current) return
      if (!win.google?.maps?.places) return
      try {
        if (autocompleteRef.current) { win.google.maps.event.clearInstanceListeners(autocompleteRef.current); autocompleteRef.current = null }
        autocompleteRef.current = new win.google.maps.places.Autocomplete(addressInputRef.current, { types: ["address"], componentRestrictions: { country: ["it","fr","de","es","at","be","nl","ch","pt"] }, fields: ["address_components","formatted_address","geometry"] })
        autocompleteRef.current.addListener("place_changed", () => { if (mounted) handlePlaceSelect() })
      } catch (err) {}
    }
    if (!win.google?.maps?.places && !scriptLoadedRef.current) {
      scriptLoadedRef.current = true
      const script = document.createElement("script")
      const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
      if (!apiKey) return
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&language=it&callback=initGoogleMaps`
      script.async = true; script.defer = true
      win.initGoogleMaps = () => { if (mounted) requestAnimationFrame(() => initAutocomplete()) }
      document.head.appendChild(script)
    } else if (win.google?.maps?.places) { initAutocomplete() }
    return () => { mounted = false }
  }, [])

  function handlePlaceSelect() {
    const place = autocompleteRef.current?.getPlace()
    if (!place || !place.address_components) return
    let street = "", streetNumber = "", city = "", province = "", postalCode = "", country = ""
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
    setCustomer((prev) => ({ ...prev, address1: fullAddress || prev.address1, city: city || prev.city, postalCode: postalCode || prev.postalCode, province: province || prev.province, countryCode: country || prev.countryCode }))
  }

  function handleChange(e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target
    setCustomer((prev) => ({ ...prev, [name]: value }))
  }

  function isFormValid() {
    const shippingValid = customer.fullName.trim().length > 2 && customer.email.trim().includes("@") && customer.email.trim().length > 5 && customer.phone.trim().length > 8 && customer.address1.trim().length > 3 && customer.city.trim().length > 1 && customer.postalCode.trim().length > 2 && customer.province.trim().length > 1 && customer.countryCode.trim().length >= 2
    if (!useDifferentBilling) return shippingValid
    const billingValid = billingAddress.fullName.trim().length > 2 && billingAddress.address1.trim().length > 3 && billingAddress.city.trim().length > 1 && billingAddress.postalCode.trim().length > 2 && billingAddress.province.trim().length > 1 && billingAddress.countryCode.trim().length >= 2
    return shippingValid && billingValid
  }

  useEffect(() => {
    async function calculateShipping() {
      const formHash = JSON.stringify({ fullName: customer.fullName.trim(), email: customer.email.trim(), phone: customer.phone.trim(), address1: customer.address1.trim(), city: customer.city.trim(), postalCode: customer.postalCode.trim(), province: customer.province.trim(), countryCode: customer.countryCode, billingFullName: useDifferentBilling ? billingAddress.fullName.trim() : "", billingAddress1: useDifferentBilling ? billingAddress.address1.trim() : "", subtotal: subtotalCents, discount: discountCents })
      if (!isFormValid()) { setCalculatedShippingCents(0); setClientSecret(null); setShippingError(null); setLastCalculatedHash(""); return }
      if (formHash === lastCalculatedHash && clientSecret) return
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = setTimeout(async () => {
        setIsCalculatingShipping(true); setError(null); setShippingError(null)
        try {
          const flatShippingCents = 590
          setCalculatedShippingCents(flatShippingCents)
          const shopifyTotal = typeof cart.totalCents === "number" ? cart.totalCents : subtotalCents
          const currentDiscountCents = subtotalCents - shopifyTotal
          const finalDiscountCents = currentDiscountCents > 0 ? currentDiscountCents : 0
          const newTotalCents = subtotalCents - finalDiscountCents + flatShippingCents
          const piRes = await fetch("/api/payment-intent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, amountCents: newTotalCents, customer: { fullName: customer.fullName, email: customer.email, phone: customer.phone, address1: customer.address1, address2: customer.address2, city: customer.city, postalCode: customer.postalCode, province: customer.province, countryCode: customer.countryCode || "IT" } }) })
          const piData = await piRes.json()
          if (!piRes.ok || !piData.clientSecret) throw new Error(piData.error || "Errore creazione pagamento")
          setClientSecret(piData.clientSecret); setLastCalculatedHash(formHash); setIsCalculatingShipping(false)
        } catch (err: any) { setShippingError(err.message || "Errore nel calcolo del totale"); setIsCalculatingShipping(false) }
      }, 1000)
    }
    calculateShipping()
    return () => { if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current) }
  }, [customer.fullName, customer.email, customer.phone, customer.address1, customer.address2, customer.city, customer.postalCode, customer.province, customer.countryCode, billingAddress.fullName, billingAddress.address1, billingAddress.city, billingAddress.postalCode, billingAddress.province, billingAddress.countryCode, useDifferentBilling, sessionId, subtotalCents, cart.totalCents, clientSecret, lastCalculatedHash, discountCents])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setError(null); setSuccess(false)
    if (!isFormValid()) { setError("Compila tutti i campi obbligatori"); return }
    if (!stripe || !elements) { setError("Stripe non pronto"); return }
    if (!clientSecret) { setError("Payment Intent non creato"); return }
    try {
      setLoading(true)
      const { error: submitError } = await elements.submit()
      if (submitError) { setError(submitError.message || "Errore nella validazione"); setLoading(false); return }
      const finalBillingAddress = useDifferentBilling ? billingAddress : customer
      const { error: stripeError } = await stripe.confirmPayment({ elements, clientSecret, confirmParams: { return_url: `${window.location.origin}/thank-you?sessionId=${sessionId}`, payment_method_data: { billing_details: { name: finalBillingAddress.fullName || customer.fullName, email: customer.email, phone: finalBillingAddress.phone || customer.phone, address: { line1: finalBillingAddress.address1, line2: finalBillingAddress.address2 || undefined, city: finalBillingAddress.city, postal_code: finalBillingAddress.postalCode, state: finalBillingAddress.province, country: finalBillingAddress.countryCode || "IT" } }, metadata: { session_id: sessionId, customer_fullName: customer.fullName, customer_email: customer.email, shipping_city: customer.city, shipping_postal: customer.postalCode, shipping_country: customer.countryCode, checkout_type: "custom" } } }, redirect: "if_required" })
      if (stripeError) { setError(stripeError.message || "Pagamento non riuscito"); setLoading(false); return }
      setSuccess(true); setLoading(false)
      setTimeout(() => { window.location.href = `/thank-you?sessionId=${sessionId}` }, 2000)
    } catch (err: any) { setError(err.message || "Errore imprevisto"); setLoading(false) }
  }

  // ── ITEMS RENDERER (riutilizzato desktop + mobile) ─
  const renderItems = (imgSize: string = "w-20 h-20") => cart.items.map((item, idx) => {
    const originalPrice = item.priceCents || 0
    const currentPrice = item.linePriceCents || 0
    const expectedTotal = originalPrice * item.quantity
    const discountAmount = expectedTotal - currentPrice
    const isFullyFree = currentPrice === 0 && originalPrice > 0
    const isDiscounted = discountAmount > 0
    return (
      <div key={idx} className="nfr-item">
        {item.image && (
          <div className="nfr-item-img-wrap">
            <img src={item.image} alt={item.title} className={`nfr-item-img ${imgSize}`} />
            <span className="nfr-item-qty">{item.quantity}</span>
          </div>
        )}
        <div className="nfr-item-info">
          <p className="nfr-item-title">{item.title}</p>
          {item.variantTitle && <p className="nfr-item-variant">{item.variantTitle}</p>}
          {isDiscounted && (
            <div className="nfr-item-discount-row">
              <span className="nfr-item-old">{formatMoney(expectedTotal, currency)}</span>
              {isFullyFree
                ? <span className="nfr-item-badge">GRATIS</span>
                : <span className="nfr-item-badge">−{formatMoney(discountAmount, currency)}</span>}
            </div>
          )}
        </div>
        <div className="nfr-item-price">
          {isFullyFree ? (
            <><span className="nfr-item-old">{formatMoney(expectedTotal, currency)}</span><span className="nfr-item-free">GRATIS</span></>
          ) : isDiscounted ? (
            <><span className="nfr-item-old">{formatMoney(expectedTotal, currency)}</span><span className="nfr-item-final">{formatMoney(currentPrice, currency)}</span></>
          ) : (
            <span className="nfr-item-final">{formatMoney(currentPrice, currency)}</span>
          )}
        </div>
      </div>
    )
  })

  const renderTotals = () => (
    <div className="nfr-totals">
      <div className="nfr-total-row"><span>Subtotale</span><span>{formatMoney(subtotalCents, currency)}</span></div>
      {discountCents > 0 && <div className="nfr-total-row nfr-discount-row"><span>Sconto</span><span>−{formatMoney(discountCents, currency)}</span></div>}
      <div className="nfr-total-row"><span>Spedizione</span><span>{formatMoney(shippingToApply, currency)}</span></div>
      <div className="nfr-total-row nfr-total-final"><span>Totale</span><span>{formatMoney(totalToPayCents, currency)}</span></div>
    </div>
  )

  return (
    <>
      {/* FACEBOOK PIXEL */}
      <Script id="facebook-pixel" strategy="afterInteractive">{`
        !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
        fbq('init','3891846021132542');fbq('track','PageView');
      `}</Script>
      <noscript><img height="1" width="1" style={{ display:'none' }} src="https://www.facebook.com/tr?id=3891846021132542&ev=PageView&noscript=1" /></noscript>

      {/* ═══════════════════════════════════════════ */}
      {/* GLOBAL CSS — B&W EDITORIAL CHECKOUT        */}
      {/* ═══════════════════════════════════════════ */}
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600;700&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --ink:    #0a0a0a;
          --paper:  #ffffff;
          --smoke:  #f4f4f2;
          --ash:    #e8e8e5;
          --dust:   #c8c8c4;
          --mist:   #8a8a84;
          --accent: #0a0a0a;
          --red:    #c8251f;
          --green:  #1a6636;
          --serif:  'DM Serif Display', Georgia, serif;
          --sans:   'DM Sans', system-ui, sans-serif;
          --radius: 2px;
          --radius-lg: 4px;
        }

        html { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }

        body {
          font-family: var(--sans);
          background: var(--paper);
          color: var(--ink);
          font-size: 14px;
          line-height: 1.5;
        }

        /* ── HEADER ── */
        .nfr-header {
          position: sticky;
          top: 0;
          z-index: 100;
          background: var(--paper);
          border-bottom: 1px solid var(--ash);
          padding: 0 24px;
          height: 60px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .nfr-header-logo img { height: 36px; max-width: 140px; }

        .nfr-header-secure {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 500;
          letter-spacing: .1em;
          text-transform: uppercase;
          color: var(--mist);
        }

        .nfr-header-secure svg { color: var(--ink); }

        /* ── TRUST BAR ── */
        .nfr-trust {
          border-bottom: 1px solid var(--ash);
          background: var(--smoke);
          display: flex;
          justify-content: center;
          gap: 0;
          overflow-x: auto;
          scrollbar-width: none;
        }
        .nfr-trust::-webkit-scrollbar { display: none; }

        .nfr-trust-item {
          flex: 1;
          min-width: 120px;
          max-width: 200px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          padding: 14px 16px;
          border-right: 1px solid var(--ash);
          text-align: center;
        }
        .nfr-trust-item:last-child { border-right: none; }

        .nfr-trust-icon {
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--ink);
        }

        .nfr-trust-title {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: .08em;
          text-transform: uppercase;
          color: var(--ink);
        }

        .nfr-trust-sub {
          font-size: 10px;
          color: var(--mist);
          margin-top: -2px;
        }

        /* ── LAYOUT ── */
        .nfr-layout {
          display: grid;
          grid-template-columns: 1fr;
          min-height: calc(100vh - 60px);
        }

        @media (min-width: 1024px) {
          .nfr-layout {
            grid-template-columns: 1fr 420px;
            max-width: 1100px;
            margin: 0 auto;
          }
        }

        /* ── FORM SIDE ── */
        .nfr-form-side {
          padding: 48px 24px 80px;
          border-right: 1px solid var(--ash);
        }

        @media (min-width: 1024px) {
          .nfr-form-side { padding: 64px 48px 80px; }
        }

        /* ── SUMMARY SIDE (desktop) ── */
        .nfr-summary-side {
          display: none;
          background: var(--smoke);
          padding: 64px 40px;
          border-left: 1px solid var(--ash);
        }

        @media (min-width: 1024px) {
          .nfr-summary-side { display: block; }
          .nfr-summary-sticky { position: sticky; top: 80px; }
        }

        /* ── MOBILE SUMMARY TOGGLE ── */
        .nfr-mobile-toggle {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 24px;
          border-bottom: 1px solid var(--ash);
          cursor: pointer;
          background: var(--smoke);
          -webkit-tap-highlight-color: transparent;
        }

        @media (min-width: 1024px) { .nfr-mobile-toggle { display: none; } }

        .nfr-mobile-toggle-left {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: .06em;
          text-transform: uppercase;
        }

        .nfr-mobile-toggle-left svg { transition: transform .2s; }
        .nfr-mobile-toggle-left svg.open { transform: rotate(180deg); }

        .nfr-mobile-total {
          font-size: 16px;
          font-weight: 700;
        }

        .nfr-mobile-summary {
          border-bottom: 1px solid var(--ash);
          background: var(--smoke);
          padding: 0 24px 24px;
          display: none;
        }

        .nfr-mobile-summary.open { display: block; }

        @media (min-width: 1024px) {
          .nfr-mobile-toggle, .nfr-mobile-summary { display: none !important; }
        }

        /* ── SECTION BLOCKS ── */
        .nfr-section { margin-bottom: 40px; }

        .nfr-section-heading {
          font-family: var(--serif);
          font-size: 20px;
          font-weight: 400;
          color: var(--ink);
          margin-bottom: 20px;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--ash);
        }

        /* ── FORM INPUTS ── */
        .nfr-field { margin-bottom: 16px; }
        .nfr-field:last-child { margin-bottom: 0; }

        .nfr-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .nfr-grid-3 { display: grid; grid-template-columns: 100px 1fr; gap: 12px; }

        .nfr-label {
          display: block;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: .1em;
          text-transform: uppercase;
          color: var(--mist);
          margin-bottom: 6px;
        }

        .nfr-input {
          width: 100%;
          padding: 12px 14px;
          font-size: 15px;
          font-family: var(--sans);
          color: var(--ink);
          background: var(--paper);
          border: 1px solid var(--ash);
          border-radius: var(--radius);
          transition: border-color .15s;
          -webkit-appearance: none;
          appearance: none;
          outline: none;
        }

        .nfr-input:focus { border-color: var(--ink); }
        .nfr-input::placeholder { color: var(--dust); }

        .nfr-select {
          width: 100%;
          padding: 12px 14px;
          font-size: 15px;
          font-family: var(--sans);
          color: var(--ink);
          background: var(--paper) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%230a0a0a' d='M6 8L1 3h10z'/%3E%3C/svg%3E") no-repeat right 14px center;
          border: 1px solid var(--ash);
          border-radius: var(--radius);
          transition: border-color .15s;
          -webkit-appearance: none;
          appearance: none;
          outline: none;
          cursor: pointer;
        }

        .nfr-select:focus { border-color: var(--ink); }

        /* ── CHECKBOX ── */
        .nfr-check-row {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          margin-top: 12px;
        }

        .nfr-check {
          width: 16px;
          height: 16px;
          flex-shrink: 0;
          margin-top: 1px;
          border: 1px solid var(--dust);
          border-radius: 0;
          appearance: none;
          -webkit-appearance: none;
          cursor: pointer;
          position: relative;
          background: var(--paper);
        }

        .nfr-check:checked {
          background: var(--ink);
          border-color: var(--ink);
        }

        .nfr-check:checked::after {
          content: '';
          position: absolute;
          left: 4px;
          top: 1px;
          width: 5px;
          height: 9px;
          border: 2px solid var(--paper);
          border-top: none;
          border-left: none;
          transform: rotate(45deg);
        }

        .nfr-check-label {
          font-size: 12px;
          color: var(--mist);
          line-height: 1.5;
          cursor: pointer;
        }

        /* ── SHIPPING BOX ── */
        .nfr-shipping-box {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px;
          border: 1px solid var(--ink);
          background: var(--smoke);
        }

        .nfr-shipping-name {
          font-size: 13px;
          font-weight: 600;
          letter-spacing: .03em;
        }

        .nfr-shipping-sub {
          font-size: 11px;
          color: var(--mist);
          margin-top: 2px;
          letter-spacing: .03em;
        }

        .nfr-shipping-price {
          font-size: 15px;
          font-weight: 700;
        }

        /* ── PAYMENT SECTION ── */
        .nfr-payment-methods {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 20px;
          flex-wrap: wrap;
        }

        .nfr-pm-chip {
          height: 28px;
          padding: 0 10px;
          border: 1px solid var(--ash);
          background: var(--paper);
          display: flex;
          align-items: center;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: .04em;
          color: var(--ink);
          border-radius: var(--radius);
        }

        .nfr-payment-secure {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 10px 14px;
          background: var(--smoke);
          border: 1px solid var(--ash);
          margin-bottom: 20px;
        }

        .nfr-secure-item {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: .08em;
          text-transform: uppercase;
          color: var(--mist);
        }

        .nfr-stripe-element {
          border: 1px solid var(--ash);
          padding: 16px;
          background: var(--paper);
          margin-bottom: 16px;
        }

        .nfr-stripe-placeholder {
          padding: 20px;
          background: var(--smoke);
          border: 1px solid var(--ash);
          text-align: center;
          font-size: 12px;
          color: var(--mist);
          letter-spacing: .04em;
        }

        /* ── CALCULATING STATE ── */
        .nfr-calculating {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 14px;
          background: var(--smoke);
          border: 1px solid var(--ash);
          font-size: 12px;
          letter-spacing: .06em;
          text-transform: uppercase;
          color: var(--mist);
          margin-bottom: 16px;
        }

        .nfr-spinner {
          width: 14px;
          height: 14px;
          border: 2px solid var(--ash);
          border-top-color: var(--ink);
          border-radius: 50%;
          animation: nfr-spin .6s linear infinite;
        }

        @keyframes nfr-spin { to { transform: rotate(360deg); } }

        /* ── SUBMIT BUTTON ── */
        .nfr-submit {
          width: 100%;
          height: 56px;
          background: var(--ink);
          color: var(--paper);
          border: none;
          font-family: var(--sans);
          font-size: 13px;
          font-weight: 700;
          letter-spacing: .14em;
          text-transform: uppercase;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          transition: background .15s, opacity .15s;
          -webkit-appearance: none;
          appearance: none;
          touch-action: manipulation;
        }

        .nfr-submit:hover:not(:disabled) { background: #2a2a2a; }
        .nfr-submit:active:not(:disabled) { background: #111; }
        .nfr-submit:disabled { opacity: .4; cursor: not-allowed; }

        /* ── GUARANTEES ── */
        .nfr-guarantees {
          margin-top: 32px;
          border-top: 1px solid var(--ash);
          padding-top: 24px;
          display: flex;
          flex-direction: column;
          gap: 0;
        }

        .nfr-guarantee-item {
          display: flex;
          align-items: flex-start;
          gap: 14px;
          padding: 14px 0;
          border-bottom: 1px solid var(--ash);
        }

        .nfr-guarantee-item:last-child { border-bottom: none; }

        .nfr-guarantee-icon {
          width: 36px;
          height: 36px;
          border: 1px solid var(--ash);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          color: var(--ink);
        }

        .nfr-guarantee-title {
          font-size: 12px;
          font-weight: 700;
          letter-spacing: .06em;
          text-transform: uppercase;
          color: var(--ink);
          margin-bottom: 2px;
        }

        .nfr-guarantee-sub {
          font-size: 11px;
          color: var(--mist);
          line-height: 1.5;
        }

        /* ── ALERTS ── */
        .nfr-alert {
          padding: 14px 16px;
          border: 1px solid;
          display: flex;
          align-items: flex-start;
          gap: 10px;
          font-size: 13px;
          margin-bottom: 16px;
        }

        .nfr-alert-error { border-color: var(--red); color: var(--red); background: #fff5f5; }
        .nfr-alert-success { border-color: var(--green); color: var(--green); background: #f5fff8; }

        /* ── TRUST FOOTER ── */
        .nfr-trust-footer {
          margin-top: 20px;
          text-align: center;
          font-size: 10px;
          letter-spacing: .08em;
          text-transform: uppercase;
          color: var(--dust);
        }

        /* ── SUMMARY ── */
        .nfr-summary-label {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: .16em;
          text-transform: uppercase;
          color: var(--mist);
          margin-bottom: 24px;
        }

        /* ── ITEMS ── */
        .nfr-item {
          display: flex;
          gap: 14px;
          padding: 16px 0;
          border-bottom: 1px solid var(--ash);
          align-items: flex-start;
        }

        .nfr-item:last-child { border-bottom: none; }

        .nfr-item-img-wrap { position: relative; flex-shrink: 0; }

        .nfr-item-img {
          display: block;
          object-fit: cover;
          border: 1px solid var(--ash);
        }

        .nfr-item-qty {
          position: absolute;
          top: -8px;
          right: -8px;
          width: 20px;
          height: 20px;
          background: var(--ink);
          color: var(--paper);
          font-size: 10px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
        }

        .nfr-item-info { flex: 1; min-width: 0; }

        .nfr-item-title {
          font-size: 12px;
          font-weight: 600;
          letter-spacing: .03em;
          color: var(--ink);
          line-height: 1.4;
        }

        .nfr-item-variant {
          font-size: 11px;
          color: var(--mist);
          margin-top: 3px;
        }

        .nfr-item-discount-row {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 4px;
        }

        .nfr-item-old {
          font-size: 11px;
          color: var(--dust);
          text-decoration: line-through;
        }

        .nfr-item-badge {
          font-size: 9px;
          font-weight: 800;
          letter-spacing: .08em;
          text-transform: uppercase;
          color: var(--paper);
          background: var(--ink);
          padding: 2px 6px;
        }

        .nfr-item-price {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 2px;
          flex-shrink: 0;
        }

        .nfr-item-final {
          font-size: 14px;
          font-weight: 700;
          color: var(--ink);
        }

        .nfr-item-free {
          font-size: 13px;
          font-weight: 800;
          color: var(--green);
          letter-spacing: .04em;
        }

        /* ── DISCOUNT BANNER ── */
        .nfr-discount-banner {
          border: 1px solid var(--ink);
          background: var(--ink);
          color: var(--paper);
          padding: 14px 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        .nfr-discount-banner-label {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: .14em;
          text-transform: uppercase;
          opacity: .6;
          margin-bottom: 2px;
        }

        .nfr-discount-banner-amount {
          font-family: var(--serif);
          font-size: 22px;
          color: var(--paper);
        }

        /* ── TOTALS ── */
        .nfr-totals {
          border-top: 1px solid var(--ash);
          padding-top: 16px;
          margin-top: 8px;
        }

        .nfr-total-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 6px 0;
          font-size: 13px;
          color: var(--mist);
        }

        .nfr-discount-row { color: var(--green); font-weight: 500; }

        .nfr-total-final {
          font-size: 16px;
          font-weight: 700;
          color: var(--ink);
          border-top: 1px solid var(--ash);
          margin-top: 8px;
          padding-top: 14px;
        }

        /* ── GOOGLE AUTOCOMPLETE ── */
        .pac-container {
          background: var(--paper) !important;
          border: 1px solid var(--ash) !important;
          border-radius: 0 !important;
          box-shadow: 0 8px 32px rgba(0,0,0,.08) !important;
          font-family: var(--sans) !important;
          z-index: 9999 !important;
          padding: 4px !important;
        }

        .pac-item {
          padding: 10px 14px !important;
          cursor: pointer !important;
          border: none !important;
          font-size: 13px !important;
          color: var(--ink) !important;
          transition: background .1s !important;
        }

        .pac-item:hover { background: var(--smoke) !important; }
        .pac-icon { display: none !important; }
        .pac-item-query { font-weight: 600 !important; }

        /* ── MOBILE ADJUSTMENTS ── */
        @media (max-width: 640px) {
          .nfr-form-side { padding: 32px 20px 60px; border-right: none; }
          .nfr-input, .nfr-select { font-size: 16px !important; }
          .nfr-submit { height: 52px; }
        }

        /* ── REVIEWS STRIP ── */
        .nfr-reviews {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 0;
          border-top: 1px solid var(--ash);
          border-bottom: 1px solid var(--ash);
          margin-bottom: 32px;
        }

        .nfr-reviews-stars {
          display: flex;
          align-items: center;
          gap: 2px;
        }

        .nfr-reviews-text {
          font-size: 11px;
          color: var(--mist);
          letter-spacing: .03em;
        }

        .nfr-reviews-text strong { color: var(--ink); font-weight: 700; }
      `}</style>

      {/* ══════════════════════════════════════════════ */}
      {/* HEADER                                        */}
      {/* ══════════════════════════════════════════════ */}
      <header className="nfr-header">
        <a href={cartUrl} className="nfr-header-logo">
          <img
            src="https://cdn.shopify.com/s/files/1/0899/2188/0330/files/logo_checkify_d8a640c7-98fe-4943-85c6-5d1a633416cf.png?v=1761832152"
            alt="NotForResale"
          />
        </a>
        <div className="nfr-header-secure">
          <svg width="14" height="14" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
          </svg>
          Pagamento sicuro
        </div>
      </header>

      {/* ══════════════════════════════════════════════ */}
      {/* TRUST BAR                                     */}
      {/* ══════════════════════════════════════════════ */}
      <div className="nfr-trust">
        {[
          { icon: <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />, title: "100% Sicuro", sub: "SSL 256-bit" },
          { icon: <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"/>, title: "Express 24/48h", sub: "BRT Tracciato" },
          { icon: <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd"/>, title: "Reso Gratuito", sub: "Entro 14 giorni" },
          { icon: <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"/>, title: "Supporto", sub: "7 giorni su 7" },
        ].map((item, i) => (
          <div key={i} className="nfr-trust-item">
            <div className="nfr-trust-icon">
              <svg width="18" height="18" fill="currentColor" viewBox="0 0 20 20">{item.icon}</svg>
            </div>
            <div className="nfr-trust-title">{item.title}</div>
            <div className="nfr-trust-sub">{item.sub}</div>
          </div>
        ))}
      </div>

      {/* ══════════════════════════════════════════════ */}
      {/* MOBILE SUMMARY TOGGLE                         */}
      {/* ══════════════════════════════════════════════ */}
      <div className="nfr-mobile-toggle" onClick={() => setOrderSummaryExpanded(!orderSummaryExpanded)}>
        <div className="nfr-mobile-toggle-left">
          <svg className={orderSummaryExpanded ? 'open' : ''} width="14" height="14" fill="none" viewBox="0 0 14 14">
            <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          {orderSummaryExpanded ? 'Nascondi' : 'Mostra'} ordine
        </div>
        <span className="nfr-mobile-total">{formatMoney(totalToPayCents, currency)}</span>
      </div>

      <div className={`nfr-mobile-summary ${orderSummaryExpanded ? 'open' : ''}`}>
        {discountCents > 0 && (
          <div className="nfr-discount-banner" style={{ marginTop: 20 }}>
            <div>
              <div className="nfr-discount-banner-label">Risparmio confermato</div>
              <div className="nfr-discount-banner-amount">−{formatMoney(discountCents, currency)}</div>
            </div>
            <svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20" style={{ opacity: .5 }}>
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          </div>
        )}
        <div style={{ marginTop: discountCents > 0 ? 0 : 20 }}>
          {renderItems("w-16 h-16")}
        </div>
        {renderTotals()}
      </div>

      {/* ══════════════════════════════════════════════ */}
      {/* MAIN LAYOUT                                   */}
      {/* ══════════════════════════════════════════════ */}
      <div className="nfr-layout">

        {/* ── LEFT: FORM ── */}
        <div className="nfr-form-side">
          <form onSubmit={handleSubmit}>

            {/* CONTATTI */}
            <div className="nfr-section">
              <h2 className="nfr-section-heading">Contatti</h2>
              <div className="nfr-field">
                <label className="nfr-label">Email</label>
                <input type="email" name="email" value={customer.email} onChange={handleChange} className="nfr-input" placeholder="mario.rossi@esempio.com" required autoComplete="email" />
              </div>
              <div className="nfr-check-row">
                <input type="checkbox" id="emailUpdates" className="nfr-check" />
                <label htmlFor="emailUpdates" className="nfr-check-label">Inviami email con notizie e offerte</label>
              </div>
            </div>

            {/* CONSEGNA */}
            <div className="nfr-section">
              <h2 className="nfr-section-heading">Consegna</h2>

              <div className="nfr-field">
                <label className="nfr-label">Paese / Regione</label>
                <select name="countryCode" value={customer.countryCode} onChange={handleChange} className="nfr-select" required>
                  <option value="IT">Italia</option>
                  <option value="FR">Francia</option>
                  <option value="DE">Germania</option>
                  <option value="ES">Spagna</option>
                </select>
              </div>

              <div className="nfr-field nfr-grid-2">
                <div>
                  <label className="nfr-label">Nome</label>
                  <input type="text" name="firstName" value={firstName} onChange={(e) => setCustomer(prev => ({ ...prev, fullName: `${e.target.value} ${lastName}`.trim() }))} className="nfr-input" placeholder="Mario" required autoComplete="given-name" />
                </div>
                <div>
                  <label className="nfr-label">Cognome</label>
                  <input type="text" name="lastName" value={lastName} onChange={(e) => setCustomer(prev => ({ ...prev, fullName: `${firstName} ${e.target.value}`.trim() }))} className="nfr-input" placeholder="Rossi" required autoComplete="family-name" />
                </div>
              </div>

              <div className="nfr-field">
                <label className="nfr-label">Azienda <span style={{ fontWeight: 400, opacity: .6 }}>(facoltativo)</span></label>
                <input type="text" className="nfr-input" placeholder="Nome azienda" autoComplete="organization" />
              </div>

              <div className="nfr-field">
                <label className="nfr-label">Indirizzo</label>
                <input ref={addressInputRef} type="text" name="address1" value={customer.address1} onChange={handleChange} className="nfr-input" placeholder="Via Roma 123" required autoComplete="address-line1" />
              </div>

              <div className="nfr-field">
                <label className="nfr-label">Interno, scala, ecc. <span style={{ fontWeight: 400, opacity: .6 }}>(facoltativo)</span></label>
                <input type="text" name="address2" value={customer.address2} onChange={handleChange} className="nfr-input" placeholder="Scala B, Piano 3" autoComplete="address-line2" />
              </div>

              <div className="nfr-field nfr-grid-3">
                <div>
                  <label className="nfr-label">CAP</label>
                  <input type="text" name="postalCode" value={customer.postalCode} onChange={handleChange} className="nfr-input" placeholder="00100" required autoComplete="postal-code" />
                </div>
                <div>
                  <label className="nfr-label">Città</label>
                  <input type="text" name="city" value={customer.city} onChange={handleChange} className="nfr-input" placeholder="Roma" required autoComplete="address-level2" />
                </div>
              </div>

              <div className="nfr-field">
                <label className="nfr-label">Provincia</label>
                <input type="text" name="province" value={customer.province} onChange={handleChange} className="nfr-input" placeholder="RM" required autoComplete="address-level1" />
              </div>

              <div className="nfr-field">
                <label className="nfr-label">Telefono</label>
                <input type="tel" name="phone" value={customer.phone} onChange={handleChange} className="nfr-input" placeholder="+39 123 456 7890" required autoComplete="tel" />
              </div>

              <div className="nfr-check-row" style={{ marginTop: 8 }}>
                <input type="checkbox" id="saveInfo" className="nfr-check" />
                <label htmlFor="saveInfo" className="nfr-check-label">Salva questi dati per la prossima volta</label>
              </div>
            </div>

            {/* INDIRIZZO FATTURAZIONE DIVERSO */}
            <div className="nfr-check-row" style={{ marginBottom: 32, padding: '14px 16px', border: '1px solid var(--ash)', background: 'var(--smoke)' }}>
              <input type="checkbox" id="differentBilling" checked={useDifferentBilling} onChange={(e) => setUseDifferentBilling(e.target.checked)} className="nfr-check" />
              <label htmlFor="differentBilling" className="nfr-check-label" style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 13 }}>
                Usa un indirizzo di fatturazione diverso
              </label>
            </div>

            {useDifferentBilling && (
              <div className="nfr-section">
                <h2 className="nfr-section-heading">Fatturazione</h2>
                <div className="nfr-field">
                  <label className="nfr-label">Paese / Regione</label>
                  <select value={billingAddress.countryCode} onChange={(e) => setBillingAddress(prev => ({ ...prev, countryCode: e.target.value }))} className="nfr-select" required>
                    <option value="IT">Italia</option><option value="FR">Francia</option><option value="DE">Germania</option><option value="ES">Spagna</option>
                  </select>
                </div>
                <div className="nfr-field nfr-grid-2">
                  <div>
                    <label className="nfr-label">Nome</label>
                    <input type="text" value={billingFirstName} onChange={(e) => setBillingAddress(prev => ({ ...prev, fullName: `${e.target.value} ${billingLastName}`.trim() }))} className="nfr-input" placeholder="Mario" required />
                  </div>
                  <div>
                    <label className="nfr-label">Cognome</label>
                    <input type="text" value={billingLastName} onChange={(e) => setBillingAddress(prev => ({ ...prev, fullName: `${billingFirstName} ${e.target.value}`.trim() }))} className="nfr-input" placeholder="Rossi" required />
                  </div>
                </div>
                <div className="nfr-field">
                  <label className="nfr-label">Indirizzo</label>
                  <input type="text" value={billingAddress.address1} onChange={(e) => setBillingAddress(prev => ({ ...prev, address1: e.target.value }))} className="nfr-input" placeholder="Via Roma 123" required />
                </div>
                <div className="nfr-field">
                  <label className="nfr-label">Interno <span style={{ opacity: .6 }}>(facoltativo)</span></label>
                  <input type="text" value={billingAddress.address2} onChange={(e) => setBillingAddress(prev => ({ ...prev, address2: e.target.value }))} className="nfr-input" placeholder="Scala B, Piano 3" />
                </div>
                <div className="nfr-field nfr-grid-3">
                  <div>
                    <label className="nfr-label">CAP</label>
                    <input type="text" value={billingAddress.postalCode} onChange={(e) => setBillingAddress(prev => ({ ...prev, postalCode: e.target.value }))} className="nfr-input" placeholder="00100" required />
                  </div>
                  <div>
                    <label className="nfr-label">Città</label>
                    <input type="text" value={billingAddress.city} onChange={(e) => setBillingAddress(prev => ({ ...prev, city: e.target.value }))} className="nfr-input" placeholder="Roma" required />
                  </div>
                </div>
                <div className="nfr-field">
                  <label className="nfr-label">Provincia</label>
                  <input type="text" value={billingAddress.province} onChange={(e) => setBillingAddress(prev => ({ ...prev, province: e.target.value }))} className="nfr-input" placeholder="RM" required />
                </div>
              </div>
            )}

            {/* SPEDIZIONE */}
            {isFormValid() && (
              <>
                <div className="nfr-section">
                  <h2 className="nfr-section-heading">Spedizione</h2>
                  <div className="nfr-shipping-box">
                    <div>
                      <div className="nfr-shipping-name">Express BRT</div>
                      <div className="nfr-shipping-sub">Consegna in 24/48 ore · Tracciata</div>
                    </div>
                    <div className="nfr-shipping-price">€5,90</div>
                  </div>
                </div>

                {/* SOCIAL PROOF */}
                <div className="nfr-reviews" style={{ marginBottom: 32 }}>
                  <div className="nfr-reviews-stars">
                    {[...Array(5)].map((_, i) => (
                      <svg key={i} width="12" height="12" fill="#0a0a0a" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                  </div>
                  <div className="nfr-reviews-text">
                    <strong>4.9/5</strong> · 1.847 recensioni verificate · Ultima vendita: <strong>3 min fa</strong>
                  </div>
                </div>
              </>
            )}

            {/* PAGAMENTO */}
            <div className="nfr-section">
              <h2 className="nfr-section-heading">Pagamento</h2>

              <div className="nfr-payment-methods">
                {['VISA', 'MC', 'AMEX', 'PayPal'].map((pm) => (
                  <div key={pm} className="nfr-pm-chip">{pm}</div>
                ))}
              </div>

              <div className="nfr-payment-secure">
                {[['SSL', 'SSL'], ['3DS', '3D Secure'], ['PCI', 'PCI DSS']].map(([k, v]) => (
                  <div key={k} className="nfr-secure-item">
                    <svg width="12" height="12" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                    </svg>
                    {v}
                  </div>
                ))}
              </div>

              {isCalculatingShipping && (
                <div className="nfr-calculating">
                  <div className="nfr-spinner" />
                  Calcolo in corso…
                </div>
              )}

              {shippingError && (
                <div className="nfr-alert nfr-alert-error">{shippingError}</div>
              )}

              {clientSecret && !isCalculatingShipping && (
                <div className="nfr-stripe-element">
                  <PaymentElement options={{ fields: { billingDetails: { name: 'auto', email: 'never', phone: 'never', address: 'never' } }, defaultValues: { billingDetails: { name: useDifferentBilling ? billingAddress.fullName : customer.fullName } } }} />
                </div>
              )}

              {!clientSecret && !isCalculatingShipping && (
                <div className="nfr-stripe-placeholder">
                  Compila i campi per visualizzare i metodi di pagamento
                </div>
              )}
            </div>

            {/* ALERTS */}
            {error && <div className="nfr-alert nfr-alert-error"><span>⚠</span>{error}</div>}
            {success && <div className="nfr-alert nfr-alert-success"><span>✓</span>Pagamento completato. Reindirizzamento…</div>}

            {/* CTA */}
            <button
              type="submit"
              disabled={loading || !stripe || !elements || !clientSecret || isCalculatingShipping}
              className="nfr-submit"
            >
              {loading ? (
                <><div className="nfr-spinner" style={{ borderColor: 'rgba(255,255,255,.3)', borderTopColor: '#fff' }} />Elaborazione…</>
              ) : (
                <>
                  <svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                  Paga in sicurezza · {formatMoney(totalToPayCents, currency)}
                </>
              )}
            </button>

            {/* GARANZIE */}
            <div className="nfr-guarantees">
              {[
                { icon: <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />, title: "Soddisfatti o Rimborsati", sub: "14 giorni per restituire il prodotto, rimborso completo garantito" },
                { icon: <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"/>, title: "Spedizione Tracciata BRT", sub: "Ricevi il tracking via email e monitora il pacco in tempo reale" },
                { icon: <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />, title: "Supporto Dedicato", sub: "Team disponibile 7 giorni su 7 via email e chat" },
              ].map((g, i) => (
                <div key={i} className="nfr-guarantee-item">
                  <div className="nfr-guarantee-icon">
                    <svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20">{g.icon}</svg>
                  </div>
                  <div>
                    <div className="nfr-guarantee-title">{g.title}</div>
                    <div className="nfr-guarantee-sub">{g.sub}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="nfr-trust-footer" style={{ marginTop: 24 }}>
              Crittografia SSL 256-bit · Powered by Stripe · PCI DSS Level 1
            </div>

          </form>
        </div>

        {/* ── RIGHT: ORDER SUMMARY (desktop only) ── */}
        <div className="nfr-summary-side">
          <div className="nfr-summary-sticky">
            <div className="nfr-summary-label">Riepilogo ordine</div>

            {discountCents > 0 && (
              <div className="nfr-discount-banner">
                <div>
                  <div className="nfr-discount-banner-label">Risparmio confermato</div>
                  <div className="nfr-discount-banner-amount">−{formatMoney(discountCents, currency)}</div>
                </div>
                <svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20" style={{ opacity: .5 }}>
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
            )}

            {renderItems("w-20 h-20")}
            {renderTotals()}
          </div>
        </div>
      </div>
    </>
  )
}

// ── PAGE LOADER + STRIPE INIT (logica invariata) ──────────────
function CheckoutPageContent() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get("sessionId") || ""
  const [cart, setCart] = useState<CartSessionResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null)

  useEffect(() => {
    async function load() {
      if (!sessionId) { setError("Sessione non valida: manca il sessionId."); setLoading(false); return }
      try {
        setLoading(true); setError(null)
        const res = await fetch(`/api/cart-session?sessionId=${encodeURIComponent(sessionId)}`)
        const data: CartSessionResponse & { error?: string } = await res.json()
        if (!res.ok || (data as any).error) { setError(data.error || "Errore nel recupero del carrello."); setLoading(false); return }
        setCart(data)
        try {
          const pkRes = await fetch('/api/stripe-status')
          if (!pkRes.ok) throw new Error('API stripe-status non disponibile')
          const pkData = await pkRes.json()
          if (pkData.publishableKey) { setStripePromise(loadStripe(pkData.publishableKey)) }
          else throw new Error('PublishableKey non ricevuta')
        } catch (err) { setError('Impossibile inizializzare il sistema di pagamento.'); setLoading(false); return }
        setLoading(false)
      } catch (err: any) { setError(err?.message || "Errore imprevisto."); setLoading(false) }
    }
    load()
  }, [sessionId])

  const LoadingScreen = () => (
    <div style={{ minHeight: '100vh', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 36, height: 36, border: '2px solid #e8e8e5', borderTopColor: '#0a0a0a', borderRadius: '50%', animation: 'nfr-spin .6s linear infinite', margin: '0 auto 16px' }} />
        <style>{`@keyframes nfr-spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: '#8a8a84' }}>Caricamento checkout…</p>
      </div>
    </div>
  )

  if (loading || !stripePromise) return <LoadingScreen />

  if (error || !cart) return (
    <div style={{ minHeight: '100vh', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px' }}>
      <div style={{ maxWidth: 400, textAlign: 'center' }}>
        <div style={{ width: 48, height: 48, border: '1px solid #0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontSize: 20 }}>✕</div>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 22, fontWeight: 400, marginBottom: 12 }}>Impossibile caricare il checkout</h1>
        <p style={{ fontSize: 13, color: '#8a8a84', lineHeight: 1.6, marginBottom: 8 }}>{error}</p>
        <p style={{ fontSize: 11, color: '#c8c8c4', letterSpacing: '.06em', textTransform: 'uppercase' }}>Torna al sito e riprova</p>
      </div>
    </div>
  )

  const options = {
    mode: 'payment' as const,
    amount: 1000,
    currency: (cart.currency || 'eur').toLowerCase(),
    paymentMethodTypes: ['card'],
    appearance: {
      theme: "stripe" as const,
      variables: {
        colorPrimary: "#0a0a0a",
        colorBackground: "#ffffff",
        colorText: "#0a0a0a",
        colorDanger: "#c8251f",
        fontFamily: '"DM Sans", system-ui, sans-serif',
        spacingUnit: '4px',
        borderRadius: "0px",
        fontSizeBase: '15px',
      },
      rules: {
        '.Input': { border: '1px solid #e8e8e5', boxShadow: 'none', padding: '12px 14px' },
        '.Input:focus': { border: '1px solid #0a0a0a', boxShadow: 'none' },
        '.Label': { fontSize: '11px', fontWeight: '600', letterSpacing: '.1em', textTransform: 'uppercase', color: '#8a8a84' },
        '.Tab': { border: '1px solid #e8e8e5', borderRadius: '0' },
        '.Tab--selected': { border: '1px solid #0a0a0a', boxShadow: 'none' },
        '.Tab:hover': { color: '#0a0a0a' },
        '.TabIcon--selected': { fill: '#0a0a0a' },
        '.TabLabel--selected': { color: '#0a0a0a' },
      }
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
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 36, height: 36, border: '2px solid #e8e8e5', borderTopColor: '#0a0a0a', borderRadius: '50%', animation: 'spin .6s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    }>
      <CheckoutPageContent />
    </Suspense>
  )
}


