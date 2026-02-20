// NFR CHECKOUT — Ultra Premium Redesign
// Luxury Dark Editorial · Alta Social Proof · Urgency Elements
// SOSTITUISCE SOLO LA PARTE VISUAL — logica React/Stripe IDENTICA all'originale

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

// ── COMPONENTI UI PREMIUM ──────────────────────────
function LiveBadge() {
  const [count, setCount] = useState(47)
  useEffect(() => {
    const t = setInterval(() => {
      setCount(c => c + (Math.random() > 0.5 ? 1 : -1) * Math.floor(Math.random() * 2))
    }, 4000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="live-badge">
      <span className="live-dot" />
      <span><strong>{count}</strong> persone stanno guardando ora</span>
    </div>
  )
}

function CountdownTimer() {
  const [seconds, setSeconds] = useState(14 * 60 + 33)
  useEffect(() => {
    const t = setInterval(() => setSeconds(s => s > 0 ? s - 1 : 0), 1000)
    return () => clearInterval(t)
  }, [])
  const m = String(Math.floor(seconds / 60)).padStart(2, '0')
  const s = String(seconds % 60).padStart(2, '0')
  return (
    <div className="countdown-bar">
      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
      </svg>
      <span>Il tuo carrello è riservato per ancora <strong>{m}:{s}</strong></span>
    </div>
  )
}

function RecentPurchase() {
  const purchases = [
    { name: "Giulia R.", city: "Milano", item: "Felpa Premium Drop #04", time: "2 min fa" },
    { name: "Marco T.", city: "Roma", item: "T-Shirt Limited Black", time: "5 min fa" },
    { name: "Sofia M.", city: "Torino", item: "Felpa Premium Drop #04", time: "8 min fa" },
    { name: "Luca B.", city: "Napoli", item: "Pack Esclusivo NFR", time: "11 min fa" },
  ]
  const [idx, setIdx] = useState(0)
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const t = setInterval(() => {
      setVisible(false)
      setTimeout(() => { setIdx(i => (i + 1) % purchases.length); setVisible(true) }, 400)
    }, 5000)
    return () => clearInterval(t)
  }, [])
  const p = purchases[idx]
  return (
    <div className={`recent-purchase ${visible ? 'visible' : ''}`}>
      <div className="rp-avatar">{p.name[0]}</div>
      <div className="rp-text">
        <strong>{p.name}</strong> da {p.city} ha appena acquistato
        <span className="rp-item"> {p.item}</span>
        <span className="rp-time"> · {p.time}</span>
      </div>
    </div>
  )
}

function StockWarning({ count = 3 }: { count?: number }) {
  return (
    <div className="stock-warning">
      <div className="stock-bar">
        <div className="stock-fill" style={{ width: `${(count / 15) * 100}%` }} />
      </div>
      <span>Solo <strong>{count} pezzi</strong> rimasti in questa taglia</span>
    </div>
  )
}

function StarRating({ score = 4.9, count = 2847 }: { score?: number, count?: number }) {
  return (
    <div className="star-rating-block">
      <div className="stars-row">
        {[1,2,3,4,5].map(i => (
          <svg key={i} width="14" height="14" viewBox="0 0 20 20" fill={i <= Math.floor(score) ? "#d4af37" : i - 0.5 <= score ? "url(#half)" : "#2a2a2a"}>
            <defs><linearGradient id="half"><stop offset="50%" stopColor="#d4af37"/><stop offset="50%" stopColor="#2a2a2a"/></linearGradient></defs>
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
          </svg>
        ))}
      </div>
      <span className="rating-score">{score}</span>
      <span className="rating-count">({count.toLocaleString('it-IT')} ordini verificati)</span>
    </div>
  )
}

// ── CHECKOUT INNER (logica identica all'originale) ──
function CheckoutInner({ cart, sessionId }: { cart: CartSessionResponse; sessionId: string }) {
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

  useEffect(() => {
    if (fbPixelSent) return
    const sendFBPixel = async () => {
      if (typeof window !== 'undefined' && (window as any).fbq && cart.items.length > 0) {
        const attrs = cart.rawCart?.attributes || {}
        const utm = { source: attrs._wt_last_source, medium: attrs._wt_last_medium, campaign: attrs._wt_last_campaign }
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
      const { error: stripeError } = await stripe.confirmPayment({ elements, clientSecret, confirmParams: { return_url: `${window.location.origin}/thank-you?sessionId=${sessionId}`, payment_method_data: { billing_details: { name: finalBillingAddress.fullName || customer.fullName, email: customer.email, phone: finalBillingAddress.phone || customer.phone, address: { line1: finalBillingAddress.address1, line2: finalBillingAddress.address2 || undefined, city: finalBillingAddress.city, postal_code: finalBillingAddress.postalCode, state: finalBillingAddress.province, country: finalBillingAddress.countryCode || "IT" } } } }, redirect: "if_required" })
      if (stripeError) { setError(stripeError.message || "Pagamento non riuscito"); setLoading(false); return }
      setSuccess(true); setLoading(false)
      setTimeout(() => { window.location.href = `/thank-you?sessionId=${sessionId}` }, 2000)
    } catch (err: any) { setError(err.message || "Errore imprevisto"); setLoading(false) }
  }

  const renderItems = () => cart.items.map((item, idx) => {
    const originalPrice = item.priceCents || 0
    const currentPrice = item.linePriceCents || 0
    const expectedTotal = originalPrice * item.quantity
    const discountAmount = expectedTotal - currentPrice
    const isFullyFree = currentPrice === 0 && originalPrice > 0
    const isDiscounted = discountAmount > 0
    return (
      <div key={idx} className="cart-item">
        {item.image && (
          <div className="cart-item-img-wrap">
            <img src={item.image} alt={item.title} className="cart-item-img" />
            <span className="cart-item-qty">{item.quantity}</span>
          </div>
        )}
        <div className="cart-item-info">
          <p className="cart-item-title">{item.title}</p>
          {item.variantTitle && <p className="cart-item-variant">{item.variantTitle}</p>}
          {isDiscounted && !isFullyFree && (
            <span className="cart-item-saving">Risparmio: {formatMoney(discountAmount, currency)}</span>
          )}
          {isFullyFree && <span className="cart-item-free-badge">OMAGGIO</span>}
        </div>
        <div className="cart-item-prices">
          {isFullyFree ? (
            <><span className="price-old">{formatMoney(expectedTotal, currency)}</span><span className="price-free">GRATIS</span></>
          ) : isDiscounted ? (
            <><span className="price-old">{formatMoney(expectedTotal, currency)}</span><span className="price-current">{formatMoney(currentPrice, currency)}</span></>
          ) : (
            <span className="price-current">{formatMoney(currentPrice, currency)}</span>
          )}
        </div>
      </div>
    )
  })

  const renderTotals = () => (
    <div className="order-totals">
      <div className="total-row"><span>Subtotale</span><span>{formatMoney(subtotalCents, currency)}</span></div>
      {discountCents > 0 && <div className="total-row total-discount"><span>Sconto applicato</span><span>−{formatMoney(discountCents, currency)}</span></div>}
      <div className="total-row"><span>Spedizione Express</span><span className="shipping-value">{formatMoney(shippingToApply, currency)}</span></div>
      <div className="total-row total-final">
        <span>Totale</span>
        <span>{formatMoney(totalToPayCents, currency)}</span>
      </div>
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

      {/* GOOGLE ADS */}
      <Script src="https://www.googletagmanager.com/gtag/js?id=AW-17960095093" strategy="afterInteractive" />
      <Script id="google-ads-init" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','AW-17960095093');` }} />

      {/* ══════════════════════════════════════════════════════════
          GLOBAL CSS — LUXURY DARK EDITORIAL
      ══════════════════════════════════════════════════════════ */}
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;1,400&family=Outfit:wght@300;400;500;600;700&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --void:    #080808;
          --deep:    #111111;
          --surface: #161616;
          --panel:   #1c1c1c;
          --border:  #2a2a2a;
          --border2: #333333;
          --muted:   #666666;
          --text:    #d8d8d0;
          --bright:  #f0ede6;
          --white:   #faf9f6;
          --gold:    #d4af37;
          --gold2:   #b8942a;
          --red:     #e53e3e;
          --green:   #2ecc71;
          --serif:   'Playfair Display', Georgia, serif;
          --sans:    'Outfit', system-ui, sans-serif;
          --r:       3px;
        }

        html { -webkit-font-smoothing: antialiased; scroll-behavior: smooth; }

        body {
          font-family: var(--sans);
          background: var(--void);
          color: var(--text);
          font-size: 14px;
          line-height: 1.6;
          min-height: 100vh;
        }

        /* ── NOISE TEXTURE OVERLAY ── */
        body::before {
          content: '';
          position: fixed;
          inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");
          pointer-events: none;
          z-index: 0;
          opacity: .6;
        }

        /* ── HEADER ── */
        .nfr-header {
          position: sticky; top: 0; z-index: 200;
          background: rgba(8,8,8,0.92);
          backdrop-filter: blur(20px);
          border-bottom: 1px solid var(--border);
          padding: 0 28px;
          height: 64px;
          display: flex; align-items: center; justify-content: space-between;
        }

        .header-logo img { height: 34px; filter: brightness(0) invert(1); }

        .header-right {
          display: flex; align-items: center; gap: 20px;
        }

        .header-secure {
          display: flex; align-items: center; gap: 6px;
          font-size: 10px; font-weight: 500;
          letter-spacing: .12em; text-transform: uppercase;
          color: var(--muted);
        }

        .header-secure-dot {
          width: 6px; height: 6px;
          background: var(--green);
          border-radius: 50%;
          box-shadow: 0 0 6px var(--green);
          animation: pulse-green 2s ease-in-out infinite;
        }

        @keyframes pulse-green {
          0%, 100% { opacity: 1; box-shadow: 0 0 6px var(--green); }
          50% { opacity: .6; box-shadow: 0 0 12px var(--green); }
        }

        .header-steps {
          display: none;
          align-items: center; gap: 6px;
          font-size: 11px; color: var(--muted);
        }
        @media (min-width: 768px) { .header-steps { display: flex; } }

        .step { display: flex; align-items: center; gap: 6px; }
        .step-num {
          width: 20px; height: 20px;
          border-radius: 50%;
          font-size: 10px; font-weight: 700;
          display: flex; align-items: center; justify-content: center;
          border: 1px solid var(--border2);
          color: var(--muted);
        }
        .step-num.active { background: var(--gold); border-color: var(--gold); color: var(--void); }
        .step-line { width: 24px; height: 1px; background: var(--border); }
        .step-label { font-size: 10px; letter-spacing: .08em; text-transform: uppercase; }
        .step-label.active { color: var(--bright); }

        /* ── LIVE BADGE ── */
        .live-badge {
          display: flex; align-items: center; gap: 8px;
          background: rgba(26,26,26,0.8);
          border: 1px solid var(--border2);
          border-radius: 20px;
          padding: 6px 14px;
          font-size: 11px; color: var(--muted);
          backdrop-filter: blur(8px);
        }

        .live-dot {
          width: 7px; height: 7px;
          background: #ff4444;
          border-radius: 50%;
          flex-shrink: 0;
          animation: pulse-red 1.5s ease-in-out infinite;
        }

        @keyframes pulse-red {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,68,68,.4); }
          50% { box-shadow: 0 0 0 5px rgba(255,68,68,0); }
        }

        /* ── COUNTDOWN ── */
        .countdown-bar {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          background: linear-gradient(135deg, rgba(212,175,55,0.08), rgba(212,175,55,0.04));
          border: 1px solid rgba(212,175,55,0.2);
          border-radius: var(--r);
          padding: 10px 18px;
          font-size: 12px; color: var(--gold);
          letter-spacing: .02em;
          margin-bottom: 20px;
        }

        .countdown-bar strong { font-weight: 700; font-size: 13px; font-variant-numeric: tabular-nums; }

        /* ── RECENT PURCHASE NOTIFICATION ── */
        .recent-purchase {
          display: flex; align-items: center; gap: 10px;
          background: rgba(22,22,22,0.9);
          border: 1px solid var(--border2);
          border-left: 3px solid var(--gold);
          border-radius: var(--r);
          padding: 10px 14px;
          font-size: 11px; color: var(--muted);
          margin-bottom: 16px;
          opacity: 0; transform: translateY(4px);
          transition: opacity .4s ease, transform .4s ease;
        }

        .recent-purchase.visible { opacity: 1; transform: translateY(0); }

        .rp-avatar {
          width: 28px; height: 28px; border-radius: 50%;
          background: linear-gradient(135deg, var(--gold2), var(--gold));
          color: var(--void); font-size: 12px; font-weight: 700;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }

        .rp-text strong { color: var(--bright); }
        .rp-item { color: var(--text); font-weight: 500; }
        .rp-time { color: var(--muted); font-size: 10px; }

        /* ── STOCK WARNING ── */
        .stock-warning {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 14px;
          background: rgba(229,62,62,0.06);
          border: 1px solid rgba(229,62,62,0.2);
          border-radius: var(--r);
          font-size: 11px; color: #ff8080;
          margin-top: 8px;
        }

        .stock-bar {
          width: 60px; height: 4px;
          background: rgba(229,62,62,0.15);
          border-radius: 2px; flex-shrink: 0; overflow: hidden;
        }

        .stock-fill {
          height: 100%;
          background: linear-gradient(90deg, #ff4444, #ff6666);
          border-radius: 2px;
          animation: stock-pulse 2s ease-in-out infinite;
        }

        @keyframes stock-pulse {
          0%, 100% { opacity: 1; } 50% { opacity: .7; }
        }

        .stock-warning strong { color: #ff6666; }

        /* ── STAR RATING ── */
        .star-rating-block {
          display: flex; align-items: center; gap: 6px;
          padding: 10px 0;
          border-bottom: 1px solid var(--border);
          margin-bottom: 16px;
        }

        .stars-row { display: flex; gap: 2px; }
        .rating-score { font-size: 13px; font-weight: 700; color: var(--bright); margin-left: 2px; }
        .rating-count { font-size: 11px; color: var(--muted); }

        /* ── LAYOUT ── */
        .nfr-layout {
          position: relative; z-index: 1;
          display: grid;
          grid-template-columns: 1fr;
          min-height: calc(100vh - 64px);
          max-width: 1140px;
          margin: 0 auto;
        }

        @media (min-width: 1024px) {
          .nfr-layout { grid-template-columns: 1fr 420px; }
        }

        /* ── FORM SIDE ── */
        .form-side {
          padding: 40px 28px 100px;
          border-right: 1px solid var(--border);
        }

        @media (min-width: 1024px) { .form-side { padding: 56px 52px 100px; } }

        /* ── SUMMARY SIDE (desktop) ── */
        .summary-side {
          display: none;
          background: var(--deep);
          border-left: 1px solid var(--border);
          padding: 56px 36px;
        }

        @media (min-width: 1024px) {
          .summary-side { display: block; }
          .summary-sticky { position: sticky; top: 80px; }
        }

        /* ── MOBILE TOGGLE ── */
        .mobile-toggle {
          display: flex; justify-content: space-between; align-items: center;
          padding: 16px 20px;
          background: var(--deep);
          border-bottom: 1px solid var(--border);
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
          position: relative; z-index: 1;
        }

        @media (min-width: 1024px) { .mobile-toggle { display: none; } }

        .mobile-toggle-left {
          display: flex; align-items: center; gap: 8px;
          font-size: 11px; font-weight: 600;
          letter-spacing: .1em; text-transform: uppercase;
          color: var(--muted);
        }

        .toggle-chevron { transition: transform .25s; }
        .toggle-chevron.open { transform: rotate(180deg); }
        .mobile-total { font-size: 17px; font-weight: 700; color: var(--bright); }

        .mobile-summary {
          display: none;
          background: var(--deep);
          border-bottom: 1px solid var(--border);
          padding: 0 20px 24px;
          position: relative; z-index: 1;
        }
        .mobile-summary.open { display: block; }
        @media (min-width: 1024px) { .mobile-toggle, .mobile-summary { display: none !important; } }

        /* ── SECTION BLOCKS ── */
        .form-section { margin-bottom: 40px; }

        .section-heading {
          font-family: var(--serif);
          font-size: 18px; font-weight: 400;
          color: var(--bright);
          margin-bottom: 20px;
          padding-bottom: 14px;
          border-bottom: 1px solid var(--border);
          display: flex; align-items: center; gap: 10px;
        }

        .section-heading-num {
          width: 24px; height: 24px;
          background: var(--gold);
          color: var(--void);
          font-family: var(--sans);
          font-size: 11px; font-weight: 800;
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }

        /* ── INPUTS ── */
        .field { margin-bottom: 14px; }
        .field:last-child { margin-bottom: 0; }
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .grid-cap { display: grid; grid-template-columns: 100px 1fr; gap: 12px; }

        .label {
          display: block;
          font-size: 10px; font-weight: 600;
          letter-spacing: .12em; text-transform: uppercase;
          color: var(--muted);
          margin-bottom: 7px;
        }

        .input, .select {
          width: 100%;
          padding: 13px 16px;
          font-size: 14px; font-family: var(--sans);
          color: var(--bright);
          background: var(--surface);
          border: 1px solid var(--border2);
          border-radius: var(--r);
          transition: border-color .15s, box-shadow .15s;
          outline: none;
          -webkit-appearance: none; appearance: none;
        }

        .input:focus { border-color: var(--gold); box-shadow: 0 0 0 3px rgba(212,175,55,0.08); }
        .input::placeholder { color: var(--border2); }

        .select {
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%23666' d='M6 8L0 0h12z'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 16px center;
          cursor: pointer;
        }
        .select:focus { border-color: var(--gold); box-shadow: 0 0 0 3px rgba(212,175,55,0.08); }

        /* ── CHECKBOX ── */
        .check-row {
          display: flex; align-items: flex-start; gap: 10px;
          margin-top: 10px;
        }

        .check {
          width: 16px; height: 16px; flex-shrink: 0; margin-top: 2px;
          border: 1px solid var(--border2); border-radius: 3px;
          appearance: none; -webkit-appearance: none;
          background: var(--surface); cursor: pointer;
          position: relative; transition: all .15s;
        }

        .check:checked { background: var(--gold); border-color: var(--gold); }
        .check:checked::after {
          content: '';
          position: absolute; left: 4px; top: 1px;
          width: 5px; height: 9px;
          border: 2px solid var(--void);
          border-top: none; border-left: none;
          transform: rotate(45deg);
        }

        .check-label { font-size: 12px; color: var(--muted); line-height: 1.5; cursor: pointer; }

        /* ── SHIPPING BOX ── */
        .shipping-option {
          display: flex; justify-content: space-between; align-items: center;
          padding: 16px 18px;
          background: var(--surface);
          border: 1.5px solid var(--gold);
          border-radius: var(--r);
          position: relative; overflow: hidden;
        }

        .shipping-option::before {
          content: '';
          position: absolute; inset: 0;
          background: linear-gradient(135deg, rgba(212,175,55,0.06), transparent 60%);
          pointer-events: none;
        }

        .shipping-check {
          width: 18px; height: 18px; border-radius: 50%;
          background: var(--gold);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; margin-right: 12px;
        }

        .shipping-info { flex: 1; }
        .shipping-name { font-size: 13px; font-weight: 600; color: var(--bright); letter-spacing: .02em; }
        .shipping-sub {
          font-size: 11px; color: var(--muted); margin-top: 3px;
          display: flex; align-items: center; gap: 8px;
        }
        .shipping-badge {
          background: rgba(46,204,113,0.12);
          border: 1px solid rgba(46,204,113,0.25);
          color: #2ecc71;
          font-size: 9px; font-weight: 700;
          letter-spacing: .1em; text-transform: uppercase;
          padding: 2px 7px; border-radius: 10px;
        }
        .shipping-price { font-size: 16px; font-weight: 700; color: var(--bright); }

        /* ── TRACKING TIMELINE ── */
        .tracking-timeline {
          display: flex; align-items: flex-start;
          gap: 0; margin-top: 16px;
          padding: 16px;
          background: rgba(212,175,55,0.04);
          border: 1px solid rgba(212,175,55,0.1);
          border-radius: var(--r);
        }

        .timeline-step {
          flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px;
          text-align: center; position: relative;
        }

        .timeline-step:not(:last-child)::after {
          content: '';
          position: absolute; top: 10px; left: 50%;
          width: 100%; height: 1px;
          background: linear-gradient(90deg, var(--gold), var(--border));
        }

        .timeline-icon {
          width: 20px; height: 20px; border-radius: 50%;
          background: var(--gold);
          display: flex; align-items: center; justify-content: center;
          z-index: 1; flex-shrink: 0;
        }

        .timeline-icon.pending {
          background: var(--surface);
          border: 1px solid var(--border2);
        }

        .timeline-label { font-size: 9px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
        .timeline-label.active { color: var(--gold); }

        /* ── TRUST BADGES ── */
        .trust-row {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;
          margin-bottom: 28px;
        }

        .trust-chip {
          display: flex; flex-direction: column; align-items: center; gap: 5px;
          padding: 12px 8px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--r);
          text-align: center;
          transition: border-color .2s;
        }

        .trust-chip:hover { border-color: var(--border2); }
        .trust-chip-icon { color: var(--gold); }
        .trust-chip-label { font-size: 9px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--bright); }
        .trust-chip-sub { font-size: 9px; color: var(--muted); }

        /* ── PAYMENT METHODS ── */
        .payment-chips {
          display: flex; flex-wrap: wrap; gap: 8px;
          margin-bottom: 16px;
        }

        .pm-chip {
          height: 32px; padding: 0 12px;
          background: var(--surface);
          border: 1px solid var(--border2);
          border-radius: var(--r);
          font-size: 11px; font-weight: 700;
          letter-spacing: .04em; color: var(--text);
          display: flex; align-items: center; gap: 5px;
        }

        .pm-chip-dot { width: 6px; height: 6px; border-radius: 50%; }

        /* ── STRIPE WRAPPER ── */
        .stripe-wrapper {
          border: 1px solid var(--border2);
          background: var(--surface);
          border-radius: var(--r);
          padding: 20px;
          margin-bottom: 16px;
          transition: border-color .2s;
        }

        .stripe-wrapper:focus-within { border-color: var(--gold); }

        .stripe-placeholder {
          padding: 24px;
          text-align: center;
          font-size: 12px; letter-spacing: .06em; text-transform: uppercase;
          color: var(--muted);
          background: var(--surface);
          border: 1px dashed var(--border2);
          border-radius: var(--r);
        }

        /* ── CALCULATING ── */
        .calculating {
          display: flex; align-items: center; gap: 10px;
          padding: 13px 16px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--r);
          font-size: 11px; letter-spacing: .08em; text-transform: uppercase;
          color: var(--muted); margin-bottom: 16px;
        }

        .spinner {
          width: 14px; height: 14px; flex-shrink: 0;
          border: 2px solid var(--border2);
          border-top-color: var(--gold);
          border-radius: 50%;
          animation: spin .7s linear infinite;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        /* ── SUBMIT BUTTON ── */
        .submit-btn {
          width: 100%; height: 60px;
          background: linear-gradient(135deg, var(--gold2), var(--gold), var(--gold2));
          background-size: 200% 200%;
          color: var(--void);
          border: none; border-radius: var(--r);
          font-family: var(--sans);
          font-size: 12px; font-weight: 800;
          letter-spacing: .18em; text-transform: uppercase;
          cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 10px;
          transition: all .25s;
          position: relative; overflow: hidden;
          -webkit-appearance: none; appearance: none;
          touch-action: manipulation;
        }

        .submit-btn::before {
          content: '';
          position: absolute; inset: 0;
          background: linear-gradient(135deg, transparent 30%, rgba(255,255,255,0.1) 50%, transparent 70%);
          transform: translateX(-100%);
          transition: transform .5s;
        }

        .submit-btn:hover:not(:disabled)::before { transform: translateX(100%); }
        .submit-btn:hover:not(:disabled) { background-position: right center; box-shadow: 0 4px 24px rgba(212,175,55,0.3); transform: translateY(-1px); }
        .submit-btn:active:not(:disabled) { transform: translateY(0); }
        .submit-btn:disabled { opacity: .35; cursor: not-allowed; }

        .submit-lock {
          width: 16px; height: 16px;
          background: rgba(0,0,0,0.15);
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
        }

        /* ── BELOW CTA ── */
        .below-cta {
          display: flex; align-items: center; justify-content: center; gap: 16px;
          margin-top: 14px;
          flex-wrap: wrap;
        }

        .below-cta-item {
          display: flex; align-items: center; gap: 5px;
          font-size: 10px; letter-spacing: .08em; text-transform: uppercase;
          color: var(--muted);
        }

        /* ── ALERTS ── */
        .alert {
          padding: 14px 16px;
          border-radius: var(--r);
          display: flex; align-items: flex-start; gap: 10px;
          font-size: 13px; margin-bottom: 16px;
        }

        .alert-error { background: rgba(229,62,62,0.08); border: 1px solid rgba(229,62,62,0.3); color: #ff8080; }
        .alert-success { background: rgba(46,204,113,0.08); border: 1px solid rgba(46,204,113,0.3); color: #2ecc71; }

        /* ── GUARANTEE CARDS ── */
        .guarantees { margin-top: 36px; }

        .guarantee-grid {
          display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
          margin-top: 16px;
        }

        .guarantee-card {
          display: flex; flex-direction: column; gap: 8px;
          padding: 14px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--r);
          transition: border-color .2s;
        }

        .guarantee-card:hover { border-color: var(--border2); }

        .guarantee-card-icon {
          width: 32px; height: 32px;
          background: rgba(212,175,55,0.08);
          border: 1px solid rgba(212,175,55,0.15);
          border-radius: var(--r);
          display: flex; align-items: center; justify-content: center;
          color: var(--gold);
        }

        .guarantee-card-title {
          font-size: 11px; font-weight: 700;
          letter-spacing: .06em; text-transform: uppercase;
          color: var(--bright);
        }

        .guarantee-card-sub { font-size: 10px; color: var(--muted); line-height: 1.5; }

        /* ── SUMMARY ── */
        .summary-label {
          font-size: 9px; font-weight: 700;
          letter-spacing: .2em; text-transform: uppercase;
          color: var(--muted); margin-bottom: 20px;
        }

        /* ── CART ITEMS ── */
        .cart-item {
          display: flex; gap: 14px;
          padding: 16px 0;
          border-bottom: 1px solid var(--border);
          align-items: flex-start;
        }

        .cart-item:last-of-type { border-bottom: none; }

        .cart-item-img-wrap { position: relative; flex-shrink: 0; }

        .cart-item-img {
          width: 72px; height: 72px;
          object-fit: cover;
          border-radius: var(--r);
          border: 1px solid var(--border);
          display: block;
        }

        .cart-item-qty {
          position: absolute; top: -6px; right: -6px;
          width: 20px; height: 20px;
          background: var(--gold); color: var(--void);
          font-size: 10px; font-weight: 800;
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
        }

        .cart-item-info { flex: 1; min-width: 0; }

        .cart-item-title { font-size: 12px; font-weight: 600; color: var(--bright); line-height: 1.4; }
        .cart-item-variant { font-size: 11px; color: var(--muted); margin-top: 2px; }
        .cart-item-saving { font-size: 10px; color: var(--green); margin-top: 4px; display: block; }

        .cart-item-free-badge {
          display: inline-block; margin-top: 4px;
          font-size: 9px; font-weight: 800;
          letter-spacing: .1em; text-transform: uppercase;
          background: linear-gradient(135deg, var(--gold2), var(--gold));
          color: var(--void); padding: 2px 7px; border-radius: 2px;
        }

        .cart-item-prices {
          display: flex; flex-direction: column; align-items: flex-end; gap: 2px;
          flex-shrink: 0;
        }

        .price-old { font-size: 11px; color: var(--muted); text-decoration: line-through; }
        .price-current { font-size: 14px; font-weight: 700; color: var(--bright); }
        .price-free { font-size: 12px; font-weight: 800; color: var(--gold); letter-spacing: .04em; }

        /* ── DISCOUNT BANNER ── */
        .discount-banner {
          display: flex; justify-content: space-between; align-items: center;
          padding: 14px 16px; margin-bottom: 20px;
          background: linear-gradient(135deg, rgba(212,175,55,0.1), rgba(212,175,55,0.05));
          border: 1px solid rgba(212,175,55,0.25);
          border-radius: var(--r);
        }

        .discount-label { font-size: 9px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--gold); margin-bottom: 3px; opacity: .7; }
        .discount-amount { font-family: var(--serif); font-size: 20px; color: var(--gold); }

        /* ── TOTALS ── */
        .order-totals { border-top: 1px solid var(--border); padding-top: 16px; margin-top: 8px; }

        .total-row {
          display: flex; justify-content: space-between; align-items: center;
          padding: 6px 0; font-size: 13px; color: var(--muted);
        }

        .total-discount { color: var(--green); }
        .shipping-value { color: var(--bright); }

        .total-final {
          font-size: 17px; font-weight: 700; color: var(--bright);
          border-top: 1px solid var(--border);
          margin-top: 10px; padding-top: 14px;
        }

        /* ── PAYMENT SECURITY STRIP ── */
        .security-strip {
          display: flex; align-items: center; justify-content: center; gap: 12px;
          padding: 10px 12px; margin-bottom: 16px;
          background: rgba(22,22,22,0.6);
          border: 1px solid var(--border);
          border-radius: var(--r);
          flex-wrap: wrap;
        }

        .security-item {
          display: flex; align-items: center; gap: 4px;
          font-size: 9px; font-weight: 700;
          letter-spacing: .1em; text-transform: uppercase;
          color: var(--muted);
        }

        /* ── GOOGLE AUTOCOMPLETE ── */
        .pac-container {
          background: var(--panel) !important;
          border: 1px solid var(--border2) !important;
          border-radius: var(--r) !important;
          box-shadow: 0 8px 32px rgba(0,0,0,.5) !important;
          font-family: var(--sans) !important;
          z-index: 9999 !important;
        }
        .pac-item {
          padding: 10px 16px !important; cursor: pointer !important;
          border-top: 1px solid var(--border) !important;
          font-size: 13px !important; color: var(--text) !important;
        }
        .pac-item:hover { background: var(--surface) !important; }
        .pac-icon { display: none !important; }
        .pac-item-query { color: var(--bright) !important; font-weight: 600 !important; }

        /* ── MOBILE ── */
        @media (max-width: 640px) {
          .form-side { padding: 28px 18px 80px; }
          .input, .select { font-size: 16px !important; }
          .submit-btn { height: 56px; }
          .trust-row { grid-template-columns: 1fr 1fr; }
          .guarantee-grid { grid-template-columns: 1fr; }
        }

        /* ── DIFF BILLING ── */
        .billing-toggle {
          display: flex; align-items: center; gap: 12px;
          padding: 14px 16px; margin-bottom: 32px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--r);
          cursor: pointer;
        }

        .billing-toggle-label { font-size: 12px; font-weight: 600; color: var(--text); }
      `}</style>

      {/* ════════════════════════════════════════════ */}
      {/* HEADER                                      */}
      {/* ════════════════════════════════════════════ */}
      <header className="nfr-header">
        <a href={cartUrl} className="header-logo">
          <img src="https://cdn.shopify.com/s/files/1/0899/2188/0330/files/logo_checkify_d8a640c7-98fe-4943-85c6-5d1a633416cf.png?v=1761832152" alt="NotForResale" />
        </a>

        <div className="header-steps">
          <div className="step">
            <div className="step-num active">1</div>
            <span className="step-label active">Checkout</span>
          </div>
          <div className="step-line" />
          <div className="step">
            <div className="step-num">2</div>
            <span className="step-label">Conferma</span>
          </div>
        </div>

        <div className="header-right">
          <div className="header-secure">
            <div className="header-secure-dot" />
            Pagamento sicuro
          </div>
        </div>
      </header>

      {/* ════════════════════════════════════════════ */}
      {/* MOBILE SUMMARY TOGGLE                       */}
      {/* ════════════════════════════════════════════ */}
      <div className="mobile-toggle" onClick={() => setOrderSummaryExpanded(!orderSummaryExpanded)}>
        <div className="mobile-toggle-left">
          <svg className={`toggle-chevron ${orderSummaryExpanded ? 'open' : ''}`} width="14" height="14" fill="none" viewBox="0 0 14 14">
            <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          {orderSummaryExpanded ? 'Nascondi' : 'Riepilogo ordine'}
        </div>
        <span className="mobile-total">{formatMoney(totalToPayCents, currency)}</span>
      </div>

      <div className={`mobile-summary ${orderSummaryExpanded ? 'open' : ''}`}>
        {discountCents > 0 && (
          <div className="discount-banner" style={{ marginTop: 20 }}>
            <div><div className="discount-label">Risparmio</div><div className="discount-amount">−{formatMoney(discountCents, currency)}</div></div>
            <svg width="18" height="18" fill="currentColor" viewBox="0 0 20 20" style={{ color: 'var(--gold)', opacity: .6 }}>
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
            </svg>
          </div>
        )}
        <div style={{ marginTop: 16 }}>{renderItems()}</div>
        {renderTotals()}
      </div>

      {/* ════════════════════════════════════════════ */}
      {/* MAIN LAYOUT                                 */}
      {/* ════════════════════════════════════════════ */}
      <div className="nfr-layout">

        {/* ══ LEFT: FORM ══ */}
        <div className="form-side">

          {/* SOCIAL PROOF TOP */}
          <div style={{ marginBottom: 28 }}>
            <StarRating />
            <LiveBadge />
          </div>

          <form onSubmit={handleSubmit}>

            {/* CONTATTI */}
            <div className="form-section">
              <h2 className="section-heading">
                <span className="section-heading-num">1</span>
                Contatti
              </h2>
              <div className="field">
                <label className="label">Email *</label>
                <input type="email" name="email" value={customer.email} onChange={handleChange} className="input" placeholder="mario.rossi@esempio.com" required autoComplete="email" />
              </div>
              <div className="check-row">
                <input type="checkbox" id="emailUpdates" className="check" />
                <label htmlFor="emailUpdates" className="check-label">Iscriviti per offerte esclusive e nuovi drop</label>
              </div>
            </div>

            {/* SPEDIZIONE */}
            <div className="form-section">
              <h2 className="section-heading">
                <span className="section-heading-num">2</span>
                Indirizzo di consegna
              </h2>

              <div className="field">
                <label className="label">Paese</label>
                <select name="countryCode" value={customer.countryCode} onChange={handleChange} className="select" required>
                  <option value="IT">🇮🇹 Italia</option>
                  <option value="FR">🇫🇷 Francia</option>
                  <option value="DE">🇩🇪 Germania</option>
                  <option value="ES">🇪🇸 Spagna</option>
                </select>
              </div>

              <div className="field grid-2">
                <div>
                  <label className="label">Nome *</label>
                  <input type="text" value={firstName} onChange={(e) => setCustomer(prev => ({ ...prev, fullName: `${e.target.value} ${lastName}`.trim() }))} className="input" placeholder="Mario" required autoComplete="given-name" />
                </div>
                <div>
                  <label className="label">Cognome *</label>
                  <input type="text" value={lastName} onChange={(e) => setCustomer(prev => ({ ...prev, fullName: `${firstName} ${e.target.value}`.trim() }))} className="input" placeholder="Rossi" required autoComplete="family-name" />
                </div>
              </div>

              <div className="field">
                <label className="label">Azienda <span style={{ opacity: .5, fontWeight: 300 }}>(facoltativo)</span></label>
                <input type="text" className="input" placeholder="Nome azienda" autoComplete="organization" />
              </div>

              <div className="field">
                <label className="label">Indirizzo *</label>
                <input ref={addressInputRef} type="text" name="address1" value={customer.address1} onChange={handleChange} className="input" placeholder="Via Roma 123" required autoComplete="address-line1" />
              </div>

              <div className="field">
                <label className="label">Scala/Interno <span style={{ opacity: .5, fontWeight: 300 }}>(facoltativo)</span></label>
                <input type="text" name="address2" value={customer.address2} onChange={handleChange} className="input" placeholder="Scala B, Piano 3" autoComplete="address-line2" />
              </div>

              <div className="field grid-cap">
                <div>
                  <label className="label">CAP *</label>
                  <input type="text" name="postalCode" value={customer.postalCode} onChange={handleChange} className="input" placeholder="00100" required autoComplete="postal-code" />
                </div>
                <div>
                  <label className="label">Città *</label>
                  <input type="text" name="city" value={customer.city} onChange={handleChange} className="input" placeholder="Roma" required autoComplete="address-level2" />
                </div>
              </div>

              <div className="field">
                <label className="label">Provincia *</label>
                <input type="text" name="province" value={customer.province} onChange={handleChange} className="input" placeholder="RM" required autoComplete="address-level1" />
              </div>

              <div className="field">
                <label className="label">Telefono *</label>
                <input type="tel" name="phone" value={customer.phone} onChange={handleChange} className="input" placeholder="+39 123 456 7890" required autoComplete="tel" />
              </div>
            </div>

            {/* FATTURAZIONE DIVERSA */}
            <label className="billing-toggle" style={{ marginBottom: 32 }}>
              <input type="checkbox" checked={useDifferentBilling} onChange={(e) => setUseDifferentBilling(e.target.checked)} className="check" />
              <span className="billing-toggle-label">Usa un indirizzo di fatturazione diverso</span>
            </label>

            {useDifferentBilling && (
              <div className="form-section">
                <h2 className="section-heading">
                  <span className="section-heading-num">↳</span>
                  Indirizzo di fatturazione
                </h2>
                <div className="field">
                  <label className="label">Paese</label>
                  <select value={billingAddress.countryCode} onChange={(e) => setBillingAddress(prev => ({ ...prev, countryCode: e.target.value }))} className="select">
                    <option value="IT">🇮🇹 Italia</option><option value="FR">🇫🇷 Francia</option><option value="DE">🇩🇪 Germania</option><option value="ES">🇪🇸 Spagna</option>
                  </select>
                </div>
                <div className="field grid-2">
                  <div>
                    <label className="label">Nome</label>
                    <input type="text" value={billingFirstName} onChange={(e) => setBillingAddress(prev => ({ ...prev, fullName: `${e.target.value} ${billingLastName}`.trim() }))} className="input" placeholder="Mario" />
                  </div>
                  <div>
                    <label className="label">Cognome</label>
                    <input type="text" value={billingLastName} onChange={(e) => setBillingAddress(prev => ({ ...prev, fullName: `${billingFirstName} ${e.target.value}`.trim() }))} className="input" placeholder="Rossi" />
                  </div>
                </div>
                <div className="field">
                  <label className="label">Indirizzo</label>
                  <input type="text" value={billingAddress.address1} onChange={(e) => setBillingAddress(prev => ({ ...prev, address1: e.target.value }))} className="input" placeholder="Via Roma 123" />
                </div>
                <div className="field grid-cap">
                  <div>
                    <label className="label">CAP</label>
                    <input type="text" value={billingAddress.postalCode} onChange={(e) => setBillingAddress(prev => ({ ...prev, postalCode: e.target.value }))} className="input" placeholder="00100" />
                  </div>
                  <div>
                    <label className="label">Città</label>
                    <input type="text" value={billingAddress.city} onChange={(e) => setBillingAddress(prev => ({ ...prev, city: e.target.value }))} className="input" placeholder="Roma" />
                  </div>
                </div>
                <div className="field">
                  <label className="label">Provincia</label>
                  <input type="text" value={billingAddress.province} onChange={(e) => setBillingAddress(prev => ({ ...prev, province: e.target.value }))} className="input" placeholder="RM" />
                </div>
              </div>
            )}

            {/* SPEDIZIONE */}
            {isFormValid() && (
              <div className="form-section">
                <h2 className="section-heading">
                  <span className="section-heading-num">3</span>
                  Spedizione
                </h2>

                <div className="shipping-option">
                  <div className="shipping-check">
                    <svg width="10" height="10" fill="none" viewBox="0 0 12 12">
                      <path d="M2 6l3 3 5-5" stroke={`var(--void)`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div className="shipping-info">
                    <div className="shipping-name">Express BRT — Tracciata</div>
                    <div className="shipping-sub">
                      Consegna in 24/48 ore lavorative
                      <span className="shipping-badge">INCLUSA</span>
                    </div>
                  </div>
                  <div className="shipping-price">€5,90</div>
                </div>

                {/* TRACKING TIMELINE */}
                <div className="tracking-timeline">
                  {[
                    { icon: '✓', label: 'Ordine', active: true },
                    { icon: '📦', label: 'Preparazione', active: true },
                    { icon: '🚚', label: 'In viaggio', active: false },
                    { icon: '🏠', label: 'Consegna', active: false },
                  ].map((step, i) => (
                    <div key={i} className="timeline-step">
                      <div className={`timeline-icon ${!step.active ? 'pending' : ''}`}>
                        {step.active
                          ? <svg width="10" height="10" fill="none" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="var(--void)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          : <span style={{ fontSize: 9, color: 'var(--muted)' }}>{i + 1}</span>
                        }
                      </div>
                      <span className={`timeline-label ${step.active ? 'active' : ''}`}>{step.label}</span>
                    </div>
                  ))}
                </div>

                <StockWarning count={3} />

                {/* SOCIAL PROOF RECENTE */}
                <div style={{ marginTop: 16 }}>
                  <RecentPurchase />
                </div>
              </div>
            )}

            {/* PAGAMENTO */}
            <div className="form-section">
              <h2 className="section-heading">
                <span className="section-heading-num">4</span>
                Pagamento
              </h2>

              <div className="payment-chips">
                {[
                  { label: 'VISA', color: '#1a1f71' },
                  { label: 'Mastercard', color: '#eb001b' },
                  { label: 'AMEX', color: '#007bc1' },
                  { label: 'PayPal', color: '#003087' },
                  { label: 'Apple Pay', color: '#555' },
                ].map((pm) => (
                  <div key={pm.label} className="pm-chip">
                    <span className="pm-chip-dot" style={{ background: pm.color }} />
                    {pm.label}
                  </div>
                ))}
              </div>

              <div className="security-strip">
                {[
                  ['🔐', 'SSL 256-bit'],
                  ['🛡', '3D Secure'],
                  ['✓', 'PCI DSS'],
                  ['⚡', 'Stripe'],
                ].map(([icon, label]) => (
                  <div key={label} className="security-item">
                    <span>{icon}</span>
                    {label}
                  </div>
                ))}
              </div>

              {isCalculatingShipping && (
                <div className="calculating">
                  <div className="spinner" />
                  Aggiornamento totale in corso…
                </div>
              )}

              {shippingError && (
                <div className="alert alert-error">
                  <span>⚠</span> {shippingError}
                </div>
              )}

              {clientSecret && !isCalculatingShipping && (
                <div className="stripe-wrapper">
                  <PaymentElement options={{ fields: { billingDetails: { name: 'auto', email: 'never', phone: 'never', address: 'never' } }, defaultValues: { billingDetails: { name: useDifferentBilling ? billingAddress.fullName : customer.fullName } } }} />
                </div>
              )}

              {!clientSecret && !isCalculatingShipping && (
                <div className="stripe-placeholder">Compila i campi per attivare il pagamento</div>
              )}
            </div>

            {/* ALERTS */}
            {error && <div className="alert alert-error"><span>⚠</span> {error}</div>}
            {success && <div className="alert alert-success"><span>✓</span> Pagamento completato. Reindirizzamento…</div>}

            {/* COUNTDOWN + CTA */}
            <CountdownTimer />

            <button
              type="submit"
              disabled={loading || !stripe || !elements || !clientSecret || isCalculatingShipping}
              className="submit-btn"
            >
              {loading ? (
                <><div className="spinner" style={{ borderTopColor: 'var(--void)', borderColor: 'rgba(0,0,0,0.2)' }} />Elaborazione pagamento…</>
              ) : (
                <>
                  <div className="submit-lock">
                    <svg width="9" height="11" fill="var(--void)" viewBox="0 0 9 11">
                      <path d="M7.5 4.5H7V3a2.5 2.5 0 00-5 0v1.5H1.5A1.5 1.5 0 000 6v3.5A1.5 1.5 0 001.5 11h6A1.5 1.5 0 009 9.5V6A1.5 1.5 0 007.5 4.5zM4.5 8a1 1 0 110-2 1 1 0 010 2zM6 4.5H3V3a1.5 1.5 0 013 0v1.5z"/>
                    </svg>
                  </div>
                  Paga ora · {formatMoney(totalToPayCents, currency)}
                </>
              )}
            </button>

            <div className="below-cta">
              {['Pagamento sicuro', 'Reso gratuito 14gg', 'BRT tracciato'].map(t => (
                <div key={t} className="below-cta-item">
                  <svg width="10" height="10" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                  </svg>
                  {t}
                </div>
              ))}
            </div>

            {/* GARANZIE */}
            <div className="guarantees">
              <div className="trust-row" style={{ marginBottom: 0 }}>
                {[
                  { icon: '↩', title: 'Reso Gratuito', sub: '14 giorni, nessuna domanda' },
                  { icon: '🚀', title: '24/48h BRT', sub: 'Tracciato in tempo reale' },
                  { icon: '🔒', title: 'Acquisto Sicuro', sub: 'Crittografia SSL avanzata' },
                  { icon: '💬', title: 'Supporto 7/7', sub: 'Team dedicato sempre attivo' },
                  { icon: '✦', title: 'Made in Italy', sub: 'Design e produzione IT' },
                  { icon: '★', title: '4.9/5 Rating', sub: '2.847 ordini verificati' },
                ].map((g) => (
                  <div key={g.title} className="trust-chip">
                    <div className="trust-chip-icon" style={{ fontSize: 18 }}>{g.icon}</div>
                    <div className="trust-chip-label">{g.title}</div>
                    <div className="trust-chip-sub">{g.sub}</div>
                  </div>
                ))}
              </div>
            </div>

            <p style={{ textAlign: 'center', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)', marginTop: 24 }}>
              © NotForResale · SSL 256-bit · Powered by Stripe
            </p>
          </form>
        </div>

        {/* ══ RIGHT: SUMMARY (desktop) ══ */}
        <div className="summary-side">
          <div className="summary-sticky">
            <div className="summary-label">Il tuo ordine</div>

            {discountCents > 0 && (
              <div className="discount-banner">
                <div>
                  <div className="discount-label">Risparmio applicato</div>
                  <div className="discount-amount">−{formatMoney(discountCents, currency)}</div>
                </div>
                <svg width="20" height="20" fill="var(--gold)" viewBox="0 0 20 20" style={{ opacity: .6 }}>
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                </svg>
              </div>
            )}

            {renderItems()}
            {renderTotals()}

            {/* SOCIAL PROOF LATO DESTRA */}
            <div style={{ marginTop: 28 }}>
              <LiveBadge />
              <div style={{ marginTop: 10 }}>
                <RecentPurchase />
              </div>
              <CountdownTimer />
            </div>

            {/* GARANZIE COMPATTE */}
            <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { icon: '↩', text: 'Reso gratuito entro 14 giorni' },
                { icon: '🚀', text: 'Spedizione BRT tracciata 24/48h' },
                { icon: '🔒', text: 'Pagamento cifrato SSL 256-bit' },
              ].map((g) => (
                <div key={g.text} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: 'var(--muted)' }}>
                  <span style={{ fontSize: 14 }}>{g.icon}</span>
                  {g.text}
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </>
  )
}

// ── PAGE LOADER (identico all'originale) ──────────────────────
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

  if (loading || !stripePromise) return (
    <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 36, height: 36, border: '2px solid #2a2a2a', borderTopColor: '#d4af37', borderRadius: '50%', animation: 'spin .7s linear infinite', margin: '0 auto 16px' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: '#444' }}>Caricamento…</p>
      </div>
    </div>
  )

  if (error || !cart) return (
    <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px' }}>
      <div style={{ maxWidth: 400, textAlign: 'center' }}>
        <div style={{ width: 52, height: 52, border: '1px solid #d4af37', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontSize: 22, color: '#d4af37' }}>✕</div>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 22, fontWeight: 400, color: '#f0ede6', marginBottom: 12 }}>Impossibile caricare il checkout</h1>
        <p style={{ fontSize: 13, color: '#666', lineHeight: 1.6 }}>{error}</p>
      </div>
    </div>
  )

  const options = {
    mode: 'payment' as const,
    amount: 1000,
    currency: (cart.currency || 'eur').toLowerCase(),
    paymentMethodTypes: ['card'],
    appearance: {
      theme: "night" as const,
      variables: {
        colorPrimary: "#d4af37",
        colorBackground: "#161616",
        colorText: "#d8d8d0",
        colorDanger: "#e53e3e",
        fontFamily: '"Outfit", system-ui, sans-serif',
        spacingUnit: '4px',
        borderRadius: "3px",
        fontSizeBase: '14px',
        colorIcon: '#d4af37',
      },
      rules: {
        '.Input': { border: '1px solid #2a2a2a', boxShadow: 'none', padding: '13px 16px', backgroundColor: '#161616', color: '#d8d8d0' },
        '.Input:focus': { border: '1px solid #d4af37', boxShadow: '0 0 0 3px rgba(212,175,55,0.08)' },
        '.Label': { fontSize: '10px', fontWeight: '600', letterSpacing: '.12em', textTransform: 'uppercase', color: '#666' },
        '.Tab': { border: '1px solid #2a2a2a', backgroundColor: '#161616', borderRadius: '3px' },
        '.Tab--selected': { border: '1px solid #d4af37', boxShadow: '0 0 0 3px rgba(212,175,55,0.08)' },
        '.TabIcon--selected': { fill: '#d4af37' },
        '.TabLabel--selected': { color: '#d4af37' },
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
      <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 36, height: 36, border: '2px solid #2a2a2a', borderTopColor: '#d4af37', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    }>
      <CheckoutPageContent />
    </Suspense>
  )
}

