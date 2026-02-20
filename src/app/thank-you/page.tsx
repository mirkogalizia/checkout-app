"use client"

import { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Script from "next/script"

type OrderData = {
  shopifyOrderNumber?: string
  shopifyOrderId?: string
  email?: string
  subtotalCents?: number
  shippingCents?: number
  discountCents?: number
  totalCents?: number
  currency?: string
  shopDomain?: string
  paymentIntentId?: string
  rawCart?: {
    id?: string
    token?: string
    attributes?: Record<string, any>
  }
  items?: Array<{
    id?: string
    variant_id?: string
    title: string
    quantity: number
    image?: string
    variantTitle?: string
    priceCents?: number
    linePriceCents?: number
  }>
  customer?: {
    email?: string
    phone?: string
    fullName?: string
    city?: string
    postalCode?: string
    countryCode?: string
  }
}

type UpsellVariant = {
  id: string
  title: string
  availableForSale: boolean
  priceCents: number
  selectedOptions: { name: string; value: string }[]
  image: string | null
}

type UpsellProduct = {
  handle: string
  title: string
  image: string | null
  options: { name: string; values: string[] }[]
  variants: UpsellVariant[]
}

const COLOR_MAP: Record<string, string> = {
  nero: "#111", black: "#111",
  bianco: "#fafafa", white: "#fafafa",
  panna: "#f0ebe0", cream: "#f0ebe0",
  navy: "#1a2340", army: "#4a5240",
  bordeaux: "#6b1a1a",
  grigio: "#888", grey: "#888", gray: "#888",
  "dark grey": "#555", "dark gray": "#555",
  beige: "#d4c5a9", brown: "#8b5e3c",
  sand: "#c4b49a", verde: "#3a6b35",
  rosso: "#c8251f", red: "#c8251f",
  blu: "#1a3a7a", blue: "#1a3a7a",
}

function UpsellBlock({ sessionId }: { sessionId: string }) {
  const [products, setProducts] = useState<UpsellProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({})
  const [adding, setAdding] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/upsell-products")
      .then((r) => r.json())
      .then((data) => {
        if (data.products?.length) {
          setProducts(data.products)
          const defaults: Record<string, string> = {}
          data.products[0].options?.forEach((opt: any) => {
            if (opt.values?.length) defaults[opt.name] = opt.values[0]
          })
          setSelectedOptions(defaults)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const product = products[selectedIdx]
    if (!product) return
    const defaults: Record<string, string> = {}
    product.options?.forEach((opt) => {
      if (opt.values?.length) defaults[opt.name] = opt.values[0]
    })
    setSelectedOptions(defaults)
    setError(null)
  }, [selectedIdx, products])

  const currentProduct = products[selectedIdx]

  const matchedVariant = currentProduct?.variants.find((v) =>
    v.selectedOptions.every((o) => selectedOptions[o.name] === o.value)
  )
  const activeVariant = matchedVariant || currentProduct?.variants.find((v) => v.availableForSale)
  const fullPriceCents = activeVariant?.priceCents || 0
  const discountedCents = Math.round(fullPriceCents / 2)
  const savedCents = fullPriceCents - discountedCents

  const fmt = (cents: number) =>
    "€" + (cents / 100).toFixed(2).replace(".", ",")

  const handleAdd = async () => {
    if (!currentProduct || !activeVariant) return
    if (!activeVariant.availableForSale) {
      setError("Questa variante non è disponibile")
      return
    }
    setAdding(true)
    setError(null)

    try {
      const res = await fetch("/api/upsell-charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          variantId: activeVariant.id,
          variantTitle: activeVariant.title,
          productTitle: currentProduct.title,
          priceCents: discountedCents,
          image: currentProduct.image,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Errore durante l'aggiunta")
        return
      }
      setDone(true)
    } catch {
      setError("Errore di connessione. Riprova.")
    } finally {
      setAdding(false)
    }
  }

  if (loading) return null

  if (done) {
    return (
      <div style={{
        marginTop: 24,
        background: "linear-gradient(135deg, #0d3320 0%, #0a2018 100%)",
        border: "1px solid #1a7a40",
        borderRadius: 16,
        padding: 28,
        textAlign: "center",
      }}>
        <div style={{
          width: 56, height: 56,
          background: "#1a7a40", borderRadius: "50%",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 14px",
          fontSize: 24, color: "#fff",
        }}>✓</div>
        <p style={{ color: "#fff", fontWeight: 900, fontSize: 20, marginBottom: 6 }}>
          Aggiunto al tuo ordine!
        </p>
        <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>
          Riceverai conferma via email. Il prodotto verrà spedito con il tuo ordine.
        </p>
      </div>
    )
  }

  if (!currentProduct) return null

  return (
    <div style={{
      marginTop: 24,
      background: "linear-gradient(160deg, #0a0a0a 0%, #141414 100%)",
      borderRadius: 16,
      overflow: "hidden",
      border: "1px solid #222",
      boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
    }}>

      {/* Header */}
      <div style={{
        background: "#c8251f",
        padding: "11px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>⚡</span>
          <span style={{ color: "#fff", fontWeight: 900, fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase" }}>
            Offerta esclusiva — Solo per te
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 11 }}>Sconto</span>
          <span style={{
            background: "#fff", color: "#c8251f",
            fontWeight: 900, fontSize: 14,
            padding: "2px 10px", borderRadius: 4,
          }}>−50%</span>
        </div>
      </div>

      <div style={{ padding: 20 }}>
        <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, letterSpacing: ".18em", textTransform: "uppercase", marginBottom: 16 }}>
          Aggiunto con un click · Nessun reindirizzamento
        </p>

        {/* Tabs prodotti */}
        {products.length > 1 && (
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            {products.map((p, i) => (
              <button
                key={p.handle}
                onClick={() => setSelectedIdx(i)}
                style={{
                  flex: 1,
                  padding: "9px 8px",
                  background: selectedIdx === i ? "#fff" : "rgba(255,255,255,0.07)",
                  color: selectedIdx === i ? "#0a0a0a" : "rgba(255,255,255,0.5)",
                  border: selectedIdx === i ? "none" : "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8,
                  fontSize: 10,
                  fontWeight: 800,
                  cursor: "pointer",
                  textTransform: "uppercase",
                  letterSpacing: ".06em",
                  transition: "all .15s",
                  lineHeight: 1.3,
                }}
              >
                {i === 0 ? "🧥 Felpa" : "👕 T-Shirt"}
              </button>
            ))}
          </div>
        )}

        {/* Prodotto */}
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>

          {/* Immagine */}
          {currentProduct.image && (
            <div style={{
              width: 120, flexShrink: 0,
              aspectRatio: "1/1",
              background: "#f2f2f0",
              borderRadius: 10,
              overflow: "hidden",
              position: "relative",
            }}>
              <img
                src={currentProduct.image}
                alt={currentProduct.title}
                style={{ width: "100%", height: "100%", objectFit: "contain", padding: 8, display: "block" }}
              />
              <div style={{
                position: "absolute", top: 0, left: 0, right: 0,
                background: "#c8251f", color: "#fff",
                fontSize: 9, fontWeight: 900,
                textAlign: "center", padding: "4px 0",
                letterSpacing: ".06em",
              }}>−50%</div>
            </div>
          )}

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              color: "#fff", fontWeight: 800, fontSize: 13,
              textTransform: "uppercase", lineHeight: 1.25, marginBottom: 10,
            }}>
              {currentProduct.title}
            </p>

            {/* Prezzo */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 30, fontWeight: 900, color: "#fff", lineHeight: 1 }}>
                  {fmt(discountedCents)}
                </span>
                <span style={{ fontSize: 14, color: "rgba(255,255,255,0.3)", textDecoration: "line-through" }}>
                  {fmt(fullPriceCents)}
                </span>
              </div>
              <div style={{ marginTop: 6 }}>
                <span style={{
                  display: "inline-block",
                  background: "rgba(200,37,31,0.2)",
                  border: "1px solid rgba(200,37,31,0.5)",
                  color: "#ff6b6b",
                  fontSize: 11, fontWeight: 800,
                  padding: "3px 10px", borderRadius: 4,
                }}>
                  🔥 Risparmi {fmt(savedCents)}
                </span>
              </div>
            </div>

            {/* Selettori opzioni */}
            {currentProduct.options.map((opt) => {
              const isColor = opt.name.toLowerCase().includes("col") || opt.name.toLowerCase() === "color"
              return (
                <div key={opt.name} style={{ marginBottom: 12 }}>
                  <p style={{
                    color: "rgba(255,255,255,0.4)", fontSize: 9,
                    fontWeight: 700, letterSpacing: ".18em",
                    textTransform: "uppercase", marginBottom: 7,
                  }}>
                    {opt.name}:{" "}
                    <span style={{ color: "#fff" }}>{selectedOptions[opt.name] || "—"}</span>
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {opt.values.map((val) => {
                      const available = currentProduct.variants.some(
                        (v) => v.availableForSale &&
                          v.selectedOptions.some((o) => o.name === opt.name && o.value === val)
                      )
                      const selected = selectedOptions[opt.name] === val
                      const colorBg = COLOR_MAP[val.toLowerCase()]

                      if (isColor && colorBg) {
                        const isLight = ["#fafafa", "#f0ebe0", "#d4c5a9", "#c4b49a"].includes(colorBg)
                        return (
                          <button
                            key={val}
                            title={val}
                            onClick={() => available && setSelectedOptions((p) => ({ ...p, [opt.name]: val }))}
                            style={{
                              width: 30, height: 30,
                              borderRadius: "50%",
                              background: colorBg,
                              border: selected
                                ? "3px solid #fff"
                                : isLight ? "2px solid rgba(255,255,255,0.3)" : "2px solid rgba(255,255,255,0.15)",
                              cursor: available ? "pointer" : "not-allowed",
                              opacity: available ? 1 : 0.25,
                              transform: selected ? "scale(1.18)" : "scale(1)",
                              boxShadow: selected ? "0 0 0 3px rgba(255,255,255,0.4)" : "none",
                              transition: "all .12s",
                              flexShrink: 0,
                            }}
                          />
                        )
                      }

                      return (
                        <button
                          key={val}
                          onClick={() => available && setSelectedOptions((p) => ({ ...p, [opt.name]: val }))}
                          style={{
                            height: 30, minWidth: 38, padding: "0 10px",
                            background: selected ? "#fff" : "rgba(255,255,255,0.07)",
                            color: selected ? "#0a0a0a" : available ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.2)",
                            border: selected ? "2px solid #fff" : "1.5px solid rgba(255,255,255,0.12)",
                            borderRadius: 4,
                            fontSize: 11, fontWeight: 700,
                            textTransform: "uppercase", letterSpacing: ".04em",
                            cursor: available ? "pointer" : "not-allowed",
                            textDecoration: available ? "none" : "line-through",
                            transition: "all .12s",
                          }}
                        >
                          {val}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Errore */}
        {error && (
          <div style={{
            marginTop: 12,
            padding: "10px 14px",
            background: "rgba(200,37,31,0.12)",
            border: "1px solid rgba(200,37,31,0.35)",
            borderRadius: 8,
            color: "#ff8080",
            fontSize: 12,
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* CTA */}
        <button
          onClick={handleAdd}
          disabled={adding}
          style={{
            marginTop: 18,
            width: "100%",
            height: 54,
            background: adding ? "#333" : "linear-gradient(135deg, #fff 0%, #f0f0f0 100%)",
            color: adding ? "rgba(255,255,255,0.5)" : "#0a0a0a",
            border: "none",
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 900,
            letterSpacing: ".07em",
            textTransform: "uppercase",
            cursor: adding ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            transition: "all .15s",
            boxShadow: adding ? "none" : "0 4px 16px rgba(255,255,255,0.15)",
          }}
        >
          {adding ? (
            <>
              <svg
                style={{ width: 18, height: 18, animation: "upsell-spin 1s linear infinite" }}
                fill="none" viewBox="0 0 24 24"
              >
                <circle style={{ opacity: .25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path style={{ opacity: .75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Addebito in corso...
            </>
          ) : (
            <>
              ⚡ Aggiungi ora · paga solo {fmt(discountedCents)}
            </>
          )}
        </button>

        <p style={{
          textAlign: "center",
          color: "rgba(255,255,255,0.25)",
          fontSize: 10,
          marginTop: 8,
          letterSpacing: ".04em",
        }}>
          🔒 Addebito sicuro sulla carta già usata · Spedizione inclusa
        </p>
      </div>

      <style>{`
        @keyframes upsell-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════

function ThankYouContent() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get("sessionId")

  const [orderData, setOrderData] = useState<OrderData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cartCleared, setCartCleared] = useState(false)

  useEffect(() => {
    async function loadOrderDataAndClearCart() {
      if (!sessionId) {
        setError("Sessione non valida")
        setLoading(false)
        return
      }

      try {
        const res = await fetch(`/api/cart-session?sessionId=${sessionId}`)
        const data = await res.json()

        if (!res.ok) throw new Error(data.error || "Errore caricamento ordine")

        console.log("[ThankYou] 📦 Dati carrello ricevuti:", data)

        const subtotal = data.subtotalCents || 0
        const shipping = 590
        let discount = 0
        if (data.totalCents && data.totalCents < subtotal) discount = subtotal - data.totalCents
        const finalTotal = subtotal - discount + shipping

        const processedOrderData = {
          shopifyOrderNumber: data.shopifyOrderNumber,
          shopifyOrderId: data.shopifyOrderId,
          email: data.customer?.email,
          subtotalCents: subtotal,
          shippingCents: shipping,
          discountCents: discount,
          totalCents: finalTotal,
          currency: data.currency || "EUR",
          shopDomain: data.shopDomain,
          paymentIntentId: data.paymentIntentId,
          rawCart: data.rawCart,
          items: data.items || [],
          customer: data.customer,
        }

        setOrderData(processedOrderData)

        // Facebook PageView
        if (typeof window !== "undefined" && (window as any).fbq) {
          try { (window as any).fbq("track", "PageView") } catch {}
        }

        // Google Ads
        const sendGoogleConversion = () => {
          if ((window as any).gtag) {
            const cartAttrs = data.rawCart?.attributes || {}
            ;(window as any).gtag("event", "conversion", {
              send_to: "AW-17960095093/dvWzCKSd8fsbEPWahfRC",
              value: finalTotal / 100,
              currency: data.currency || "EUR",
              transaction_id: data.shopifyOrderNumber || data.shopifyOrderId || sessionId,
              utm_source: cartAttrs._wt_last_source || "",
              utm_medium: cartAttrs._wt_last_medium || "",
              utm_campaign: cartAttrs._wt_last_campaign || "",
            })
          }
        }
        if ((window as any).gtag) sendGoogleConversion()
        else {
          const t = setInterval(() => { if ((window as any).gtag) { clearInterval(t); sendGoogleConversion() } }, 100)
          setTimeout(() => clearInterval(t), 5000)
        }

        // Analytics
        const cartAttrs = data.rawCart?.attributes || {}
        fetch("/api/analytics/purchase", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: data.shopifyOrderId || sessionId,
            orderNumber: data.shopifyOrderNumber || null,
            sessionId,
            timestamp: new Date().toISOString(),
            value: finalTotal / 100,
            valueCents: finalTotal,
            subtotalCents: subtotal,
            shippingCents: shipping,
            discountCents: discount,
            currency: data.currency || "EUR",
            itemCount: (data.items || []).length,
            utm: {
              source: cartAttrs._wt_last_source || null,
              medium: cartAttrs._wt_last_medium || null,
              campaign: cartAttrs._wt_last_campaign || null,
              content: cartAttrs._wt_last_content || null,
              term: cartAttrs._wt_last_term || null,
              fbclid: cartAttrs._wt_last_fbclid || null,
              gclid: cartAttrs._wt_last_gclid || null,
              campaign_id: cartAttrs._wt_last_campaign_id || null,
              adset_id: cartAttrs._wt_last_adset_id || null,
              adset_name: cartAttrs._wt_last_adset_name || null,
              ad_id: cartAttrs._wt_last_ad_id || null,
              ad_name: cartAttrs._wt_last_ad_name || null,
            },
            utm_first: {
              source: cartAttrs._wt_first_source || null,
              medium: cartAttrs._wt_first_medium || null,
              campaign: cartAttrs._wt_first_campaign || null,
              content: cartAttrs._wt_first_content || null,
              referrer: cartAttrs._wt_first_referrer || null,
              landing: cartAttrs._wt_first_landing || null,
              fbclid: cartAttrs._wt_first_fbclid || null,
              gclid: cartAttrs._wt_first_gclid || null,
              campaign_id: cartAttrs._wt_first_campaign_id || null,
              adset_id: cartAttrs._wt_first_adset_id || null,
              ad_name: cartAttrs._wt_first_ad_name || null,
            },
            customer: {
              email: data.customer?.email || null,
              fullName: data.customer?.fullName || null,
              city: data.customer?.city || null,
              postalCode: data.customer?.postalCode || null,
              countryCode: data.customer?.countryCode || null,
            },
            items: (data.items || []).map((item: any) => ({
              id: item.id || item.variant_id,
              title: item.title,
              quantity: item.quantity,
              priceCents: item.priceCents || 0,
              linePriceCents: item.linePriceCents || 0,
            })),
            shopDomain: data.shopDomain || "notforresale.it",
          }),
        }).catch(() => {})

        // Clear cart
        if (data.rawCart?.id || data.rawCart?.token) {
          const cartId = data.rawCart.id || `gid://shopify/Cart/${data.rawCart.token}`
          fetch("/api/clear-cart", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cartId, sessionId }),
          })
            .then((r) => r.ok && setCartCleared(true))
            .catch(() => {})
        }

        setLoading(false)
      } catch (err: any) {
        setError(err.message)
        setLoading(false)
      }
    }

    loadOrderDataAndClearCart()
  }, [sessionId])

  const formatMoney = (cents: number | undefined) =>
    new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: orderData?.currency || "EUR",
      minimumFractionDigits: 2,
    }).format((cents ?? 0) / 100)

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-gray-900 mb-4" />
          <p className="text-sm text-gray-600">Caricamento ordine...</p>
        </div>
      </div>
    )
  }

  if (error || !orderData) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-6 p-8 bg-white rounded-lg shadow-sm border border-gray-200">
          <svg className="w-16 h-16 text-red-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h1 className="text-2xl font-bold text-gray-900">Ordine non trovato</h1>
          <p className="text-gray-600">{error}</p>
          <a href={`https://${orderData?.shopDomain || "nfrcheckout.com"}`} className="inline-block mt-4 px-6 py-3 bg-gray-900 text-white font-medium rounded-md hover:bg-gray-800 transition">
            Torna al negozio
          </a>
        </div>
      </div>
    )
  }

  return (
    <>
      <Script id="facebook-pixel" strategy="afterInteractive">{`
        !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
        fbq('init','${process.env.NEXT_PUBLIC_FB_PIXEL_ID}');
      `}</Script>
      <Script src="https://www.googletagmanager.com/gtag/js?id=AW-17925038279" strategy="afterInteractive" />
      <Script id="google-ads-init" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','AW-17925038279');` }} />

      <div className="min-h-screen bg-[#fafafa] py-12">
        <div className="max-w-3xl mx-auto px-4">

          {/* ── Ordine confermato ── */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">

            <div className="flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mx-auto mb-6">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <h1 className="text-3xl font-bold text-gray-900 text-center mb-2">Ordine Confermato!</h1>
            <p className="text-center text-gray-600 mb-6">Grazie per il tuo acquisto</p>

            {orderData.shopifyOrderNumber && (
              <div className="bg-gray-50 rounded-lg p-4 mb-6 text-center">
                <p className="text-sm text-gray-600 mb-1">Numero ordine</p>
                <p className="text-2xl font-bold text-gray-900">#{orderData.shopifyOrderNumber}</p>
              </div>
            )}

            {orderData.email && (
              <div className="border-t border-gray-200 pt-6 mb-6">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-gray-900 mb-1">Conferma inviata a</p>
                    <p className="text-sm text-gray-600">{orderData.email}</p>
                  </div>
                </div>
              </div>
            )}

            {orderData.items && orderData.items.length > 0 && (
              <div className="border-t border-gray-200 pt-6 mb-6">
                <h2 className="text-base font-semibold text-gray-900 mb-4">Prodotti ordinati</h2>
                <div className="space-y-4">
                  {orderData.items.map((item, idx) => (
                    <div key={idx} className="flex gap-4">
                      {item.image && (
                        <div className="w-16 h-16 flex-shrink-0 bg-gray-100 rounded border border-gray-200">
                          <img src={item.image} alt={item.title} className="w-full h-full object-cover rounded" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{item.title}</p>
                        {item.variantTitle && <p className="text-xs text-gray-500 mt-1">{item.variantTitle}</p>}
                        <p className="text-xs text-gray-500 mt-1">Quantità: {item.quantity}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-medium text-gray-900">{formatMoney(item.linePriceCents || item.priceCents || 0)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t border-gray-200 pt-6">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Subtotale</span>
                  <span className="text-gray-900">{formatMoney(orderData.subtotalCents)}</span>
                </div>
                {orderData.discountCents && orderData.discountCents > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Sconto</span>
                    <span>-{formatMoney(orderData.discountCents)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-600">Spedizione</span>
                  <span className="text-gray-900">{formatMoney(orderData.shippingCents)}</span>
                </div>
                <div className="flex justify-between text-lg font-semibold pt-3 border-t border-gray-200">
                  <span>Totale</span>
                  <span className="text-xl">{formatMoney(orderData.totalCents)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── UPSELL ONE-CLICK ── */}
          {sessionId && <UpsellBlock sessionId={sessionId} />}

          {/* ── Prossimi passi ── */}
          <div className="bg-blue-50 rounded-lg border border-blue-200 p-6 mt-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Prossimi passi
            </h2>
            <ul className="space-y-3 text-sm text-gray-700">
              <li className="flex items-start gap-2">
                <span className="text-blue-600 font-semibold">1.</span>
                <span>Riceverai un&apos;email di conferma con tutti i dettagli</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 font-semibold">2.</span>
                <span>Il tuo ordine verrà elaborato entro 1-2 giorni lavorativi</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 font-semibold">3.</span>
                <span>Riceverai il tracking della spedizione via email</span>
              </li>
            </ul>
          </div>

          {/* ── Action Buttons ── */}
          <div className="space-y-3 mt-6">
            <a
              href={`https://${orderData.shopDomain || "nfrcheckout.com"}`}
              className="block w-full py-3 px-4 bg-gray-900 text-white text-center font-medium rounded-md hover:bg-gray-800 transition"
            >
              Torna al negozio
            </a>
          </div>

          {cartCleared && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
              <p className="text-xs text-green-800 text-center">✓ Carrello svuotato con successo</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export default function ThankYouPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center">
        <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-gray-900" />
      </div>
    }>
      <ThankYouContent />
    </Suspense>
  )
}
