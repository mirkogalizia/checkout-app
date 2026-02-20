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
    address1?: string
    address2?: string
    province?: string
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
  "sport grey": "#9ea5a8",
  "sport gray": "#9ea5a8",
  "dark chocolate": "#3d1f10",
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
  const fmt = (cents: number) => "€" + (cents / 100).toFixed(2).replace(".", ",")

  const handleAdd = async () => {
    if (!currentProduct || !activeVariant?.availableForSale) { setError("Variante non disponibile"); return }
    setAdding(true); setError(null)
    try {
      const res = await fetch("/api/upsell-charge", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, variantId: activeVariant.id, variantTitle: activeVariant.title, productTitle: currentProduct.title, priceCents: discountedCents, image: currentProduct.image }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || "Errore"); return }
      setDone(true)
    } catch { setError("Errore di connessione. Riprova.") }
    finally { setAdding(false) }
  }

  if (loading || !currentProduct) return null

  if (done) return (
    <div style={{ background: "linear-gradient(135deg,#0d2e1a,#0a1f12)", border: "1px solid #1d5c30", borderRadius: 20, padding: "28px 24px", textAlign: "center" }}>
      <div style={{ fontSize: 44, marginBottom: 12 }}>✅</div>
      <p style={{ color: "#fff", fontWeight: 800, fontSize: 20, marginBottom: 6, fontFamily: "Georgia,serif" }}>Aggiunto al tuo ordine!</p>
      <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 14, margin: 0 }}>Conferma via email. Spedito insieme al tuo ordine.</p>
    </div>
  )

  return (
    <div style={{ background: "#0a0a0a", borderRadius: 20, overflow: "hidden", border: "1px solid #1e1e1e" }}>
      <div style={{ background: "linear-gradient(90deg,#c8251f,#a01c18)", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ color: "#fff", fontWeight: 800, fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase" }}>⚡ Offerta esclusiva post-acquisto</span>
        <span style={{ background: "#fff", color: "#c8251f", fontWeight: 900, fontSize: 13, padding: "2px 12px", borderRadius: 20 }}>−50%</span>
      </div>
      <div style={{ padding: 20 }}>
        {products.length > 1 && (
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            {products.map((p, i) => (
              <button key={p.handle} onClick={() => setSelectedIdx(i)} style={{ flex: 1, padding: "10px 8px", background: selectedIdx === i ? "#fff" : "rgba(255,255,255,0.06)", color: selectedIdx === i ? "#000" : "rgba(255,255,255,0.45)", border: "none", borderRadius: 10, fontSize: 11, fontWeight: 800, cursor: "pointer", textTransform: "uppercase", letterSpacing: ".06em", transition: "all .15s" }}>
                {i === 0 ? "🧥 Hoodie" : "👕 T-Shirt"}
              </button>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          {currentProduct.image && (
            <div style={{ width: 116, flexShrink: 0, aspectRatio: "1/1", background: "#f2f2f0", borderRadius: 12, overflow: "hidden", position: "relative" }}>
              <img src={currentProduct.image} alt={currentProduct.title} style={{ width: "100%", height: "100%", objectFit: "contain", padding: 8, display: "block" }} />
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, background: "#c8251f", color: "#fff", fontSize: 9, fontWeight: 900, textAlign: "center", padding: "4px 0", letterSpacing: ".08em" }}>−50%</div>
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ color: "#fff", fontWeight: 700, fontSize: 13, textTransform: "uppercase", lineHeight: 1.3, marginBottom: 10 }}>{currentProduct.title}</p>
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 28, fontWeight: 900, color: "#fff", lineHeight: 1 }}>{fmt(discountedCents)}</span>
                <span style={{ fontSize: 14, color: "rgba(255,255,255,0.28)", textDecoration: "line-through" }}>{fmt(fullPriceCents)}</span>
              </div>
              <span style={{ display: "inline-block", marginTop: 6, background: "rgba(200,37,31,0.18)", border: "1px solid rgba(200,37,31,0.4)", color: "#ff7070", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20 }}>
                🔥 Risparmi {fmt(savedCents)}
              </span>
            </div>
            {currentProduct.options.map((opt) => {
              const isColor = opt.name.toLowerCase().includes("col") || opt.name.toLowerCase() === "color"
              return (
                <div key={opt.name} style={{ marginBottom: 10 }}>
                  <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 9, fontWeight: 700, letterSpacing: ".18em", textTransform: "uppercase", marginBottom: 6 }}>
                    {opt.name}: <span style={{ color: "#fff" }}>{selectedOptions[opt.name] || "—"}</span>
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {opt.values.map((val) => {
                      const available = currentProduct.variants.some((v) => v.availableForSale && v.selectedOptions.some((o) => o.name === opt.name && o.value === val))
                      const selected = selectedOptions[opt.name] === val
                      const colorBg = COLOR_MAP[val.toLowerCase()]
                      if (isColor && colorBg) {
                        const isLight = ["#fafafa","#f0ebe0","#d4c5a9","#c4b49a","#9ea5a8"].includes(colorBg)
                        return (
                          <button key={val} title={val} onClick={() => available && setSelectedOptions((p) => ({ ...p, [opt.name]: val }))} style={{ width: 28, height: 28, borderRadius: "50%", background: colorBg, border: selected ? "2.5px solid #fff" : isLight ? "1.5px solid rgba(255,255,255,0.3)" : "1.5px solid rgba(255,255,255,0.1)", cursor: available ? "pointer" : "not-allowed", opacity: available ? 1 : 0.2, transform: selected ? "scale(1.2)" : "scale(1)", boxShadow: selected ? "0 0 0 3px rgba(255,255,255,0.35)" : "none", transition: "all .12s", flexShrink: 0 }} />
                        )
                      }
                      return (
                        <button key={val} onClick={() => available && setSelectedOptions((p) => ({ ...p, [opt.name]: val }))} style={{ height: 28, minWidth: 36, padding: "0 9px", background: selected ? "#fff" : "rgba(255,255,255,0.07)", color: selected ? "#000" : available ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.18)", border: selected ? "2px solid #fff" : "1px solid rgba(255,255,255,0.1)", borderRadius: 4, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", cursor: available ? "pointer" : "not-allowed", textDecoration: available ? "none" : "line-through", transition: "all .12s" }}>
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
        {error && <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(200,37,31,0.12)", border: "1px solid rgba(200,37,31,0.3)", borderRadius: 8, color: "#ff8080", fontSize: 12 }}>⚠️ {error}</div>}
        <button onClick={handleAdd} disabled={adding} style={{ marginTop: 16, width: "100%", height: 52, background: adding ? "#222" : "#fff", color: adding ? "rgba(255,255,255,0.4)" : "#000", border: "none", borderRadius: 12, fontSize: 13, fontWeight: 900, letterSpacing: ".07em", textTransform: "uppercase", cursor: adding ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all .15s", boxShadow: adding ? "none" : "0 4px 20px rgba(255,255,255,0.12)" }}>
          {adding ? (<><svg style={{ width: 16, height: 16, animation: "ty-spin 1s linear infinite" }} fill="none" viewBox="0 0 24 24"><circle style={{ opacity: .2 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path style={{ opacity: .7 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Addebito...</>) : <>⚡ Aggiungi ora · solo {fmt(discountedCents)}</>}
        </button>
        <p style={{ textAlign: "center", color: "rgba(255,255,255,0.2)", fontSize: 10, marginTop: 8, letterSpacing: ".04em" }}>🔒 Carta già usata · Nessun reindirizzamento · Spedizione inclusa</p>
      </div>
    </div>
  )
}

function ThankYouContent() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get("sessionId")
  const [orderData, setOrderData] = useState<OrderData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    async function load() {
      if (!sessionId) { setError("Sessione non valida"); setLoading(false); return }
      try {
        const res = await fetch(`/api/cart-session?sessionId=${sessionId}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || "Errore caricamento ordine")
        const subtotal = data.subtotalCents || 0
        const shipping = 590
        let discount = 0
        if (data.totalCents && data.totalCents < subtotal) discount = subtotal - data.totalCents
        const finalTotal = subtotal - discount + shipping
        setOrderData({ shopifyOrderNumber: data.shopifyOrderNumber, shopifyOrderId: data.shopifyOrderId, email: data.customer?.email, subtotalCents: subtotal, shippingCents: shipping, discountCents: discount, totalCents: finalTotal, currency: data.currency || "EUR", shopDomain: data.shopDomain, paymentIntentId: data.paymentIntentId, rawCart: data.rawCart, items: data.items || [], customer: data.customer })
        setTimeout(() => setVisible(true), 50)
        if (typeof window !== "undefined" && (window as any).fbq) { try { (window as any).fbq("track", "PageView") } catch {} }
        const sendGA = () => { if (!(window as any).gtag) return; const a = data.rawCart?.attributes || {}; ;(window as any).gtag("event","conversion",{ send_to:"AW-17960095093/dvWzCKSd8fsbEPWahfRC", value: finalTotal/100, currency: data.currency||"EUR", transaction_id: data.shopifyOrderNumber||data.shopifyOrderId||sessionId, utm_source: a._wt_last_source||"", utm_medium: a._wt_last_medium||"", utm_campaign: a._wt_last_campaign||"" }) }
        if ((window as any).gtag) sendGA(); else { const t = setInterval(()=>{ if ((window as any).gtag){clearInterval(t);sendGA()} },100); setTimeout(()=>clearInterval(t),5000) }
        const a = data.rawCart?.attributes||{}
        fetch("/api/analytics/purchase",{ method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ orderId:data.shopifyOrderId||sessionId, orderNumber:data.shopifyOrderNumber||null, sessionId, timestamp:new Date().toISOString(), value:finalTotal/100, valueCents:finalTotal, subtotalCents:subtotal, shippingCents:shipping, discountCents:discount, currency:data.currency||"EUR", itemCount:(data.items||[]).length, utm:{ source:a._wt_last_source||null, medium:a._wt_last_medium||null, campaign:a._wt_last_campaign||null, content:a._wt_last_content||null, fbclid:a._wt_last_fbclid||null, gclid:a._wt_last_gclid||null, campaign_id:a._wt_last_campaign_id||null, adset_id:a._wt_last_adset_id||null, adset_name:a._wt_last_adset_name||null, ad_id:a._wt_last_ad_id||null, ad_name:a._wt_last_ad_name||null }, utm_first:{ source:a._wt_first_source||null, medium:a._wt_first_medium||null, campaign:a._wt_first_campaign||null, referrer:a._wt_first_referrer||null, landing:a._wt_first_landing||null, fbclid:a._wt_first_fbclid||null }, customer:{ email:data.customer?.email||null, fullName:data.customer?.fullName||null, city:data.customer?.city||null, postalCode:data.customer?.postalCode||null, countryCode:data.customer?.countryCode||null }, items:(data.items||[]).map((i:any)=>({ id:i.id||i.variant_id, title:i.title, quantity:i.quantity, priceCents:i.priceCents||0, linePriceCents:i.linePriceCents||0 })), shopDomain:data.shopDomain||"notforresale.it" }) }).catch(()=>{})
        if (data.rawCart?.id||data.rawCart?.token) { const cartId=data.rawCart.id||`gid://shopify/Cart/${data.rawCart.token}`; fetch("/api/clear-cart",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cartId,sessionId})}).catch(()=>{}) }
        setLoading(false)
      } catch(err:any) { setError(err.message); setLoading(false) }
    }
    load()
  }, [sessionId])

  const fmt = (cents:number|undefined) => new Intl.NumberFormat("it-IT",{ style:"currency", currency:orderData?.currency||"EUR", minimumFractionDigits:2 }).format((cents??0)/100)

  if (loading) return (
    <div style={{ minHeight:"100vh", background:"#000", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:20 }}>
      <img src="https://cdn.shopify.com/s/files/1/0608/1806/3572/files/logo_nfr_bianco.png?v=1719300466" alt="NFR" style={{ height:32, opacity:.5 }} />
      <div style={{ width:28, height:28, border:"2px solid rgba(255,255,255,0.1)", borderTop:"2px solid #fff", borderRadius:"50%", animation:"ty-spin 0.8s linear infinite" }} />
      <style>{`@keyframes ty-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (error||!orderData) return (
    <div style={{ minHeight:"100vh", background:"#f5f5f7", display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ maxWidth:400, textAlign:"center" }}>
        <p style={{ fontSize:48, marginBottom:16 }}>⚠️</p>
        <h1 style={{ fontSize:22, fontWeight:700, marginBottom:8 }}>Ordine non trovato</h1>
        <p style={{ color:"#86868b", fontSize:14 }}>{error}</p>
        <a href={`https://${orderData?.shopDomain||"notforresale.it"}`} style={{ display:"inline-block", marginTop:24, padding:"12px 28px", background:"#000", color:"#fff", borderRadius:10, fontWeight:700, textDecoration:"none" }}>Torna al negozio</a>
      </div>
    </div>
  )

  const customer = orderData.customer
  const firstName = customer?.fullName?.split(" ")[0] || "amico"

  return (
    <>
      <Script id="facebook-pixel" strategy="afterInteractive">{`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${process.env.NEXT_PUBLIC_FB_PIXEL_ID}');`}</Script>
      <Script src="https://www.googletagmanager.com/gtag/js?id=AW-17925038279" strategy="afterInteractive" />
      <Script id="google-ads-init" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html:`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','AW-17925038279');` }} />

      <style>{`
        @keyframes ty-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
        @keyframes ty-fadein{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        .ty-fade{opacity:0;animation:ty-fadein .55s ease forwards}
        .ty-1{animation-delay:.05s}.ty-2{animation-delay:.15s}.ty-3{animation-delay:.25s}.ty-4{animation-delay:.35s}.ty-5{animation-delay:.45s}
      `}</style>

      <div style={{ minHeight:"100vh", background:"#f5f5f7", fontFamily:"-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif" }}>

        {/* HEADER */}
        <div style={{ background:"#000", padding:"18px 24px", textAlign:"center" }}>
          <img src="https://cdn.shopify.com/s/files/1/0608/1806/3572/files/logo_nfr_bianco.png?v=1719300466" alt="Not For Resale" style={{ height:34, display:"inline-block" }} />
        </div>

        {/* HERO */}
        <div style={{ position:"relative", overflow:"hidden", maxHeight:260 }}>
          <img src="https://img.bayengage.com/b5cc27ebe82e/studio/41162/Kraft-Bubble-Mailer-Mockup-Set-by-Creatsy-8-.jpg" alt="" style={{ width:"100%", display:"block", objectFit:"cover", maxHeight:260, filter:"brightness(0.8)" }} />
          <div style={{ position:"absolute", inset:0, background:"linear-gradient(to bottom,rgba(0,0,0,0) 30%,rgba(0,0,0,0.72) 100%)", display:"flex", alignItems:"flex-end", padding:"24px 28px" }}>
            <div>
              <div style={{ display:"inline-flex", alignItems:"center", gap:8, background:"rgba(255,255,255,0.14)", backdropFilter:"blur(10px)", border:"1px solid rgba(255,255,255,0.2)", borderRadius:20, padding:"6px 14px", marginBottom:8 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                <span style={{ color:"#fff", fontSize:11, fontWeight:700, letterSpacing:".08em" }}>ORDINE CONFERMATO</span>
              </div>
              {orderData.shopifyOrderNumber && (
                <p style={{ color:"rgba(255,255,255,0.6)", fontSize:13, margin:0 }}>Ordine <strong style={{ color:"#fff" }}>#{orderData.shopifyOrderNumber}</strong></p>
              )}
            </div>
          </div>
        </div>

        <div style={{ maxWidth:640, margin:"0 auto", padding:"0 16px 60px" }}>

          {/* GREETING */}
          <div className={visible?"ty-fade ty-1":""} style={{ background:"#fff", borderRadius:"0 0 20px 20px", padding:"28px 24px 24px", marginBottom:12, boxShadow:"0 2px 12px rgba(0,0,0,0.06)" }}>
            <h1 style={{ fontSize:22, fontWeight:700, color:"#1d1d1f", marginBottom:10, fontFamily:"Georgia,'Times New Roman',serif" }}>
              Ciao {firstName}! 👋
            </h1>
            <p style={{ fontSize:15, lineHeight:1.65, color:"#3a3a3c", margin:0 }}>
              Grazie per aver scelto <strong style={{ color:"#000" }}>Not For Resale</strong>. Il tuo ordine è confermato e il nostro team lo sta preparando con cura.
            </p>
            {orderData.email && (
              <div style={{ display:"flex", alignItems:"center", gap:10, marginTop:16, padding:"12px 16px", background:"#f2f2f7", borderRadius:12 }}>
                <svg width="15" height="15" fill="none" stroke="#34c759" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                <span style={{ fontSize:13, color:"#3a3a3c" }}>Conferma inviata a <strong>{orderData.email}</strong></span>
              </div>
            )}
          </div>

          {/* PRODOTTI */}
          {orderData.items && orderData.items.length > 0 && (
            <div className={visible?"ty-fade ty-2":""} style={{ background:"#fff", borderRadius:20, padding:"24px", marginBottom:12, boxShadow:"0 2px 12px rgba(0,0,0,0.06)" }}>
              <h2 style={{ fontSize:12, fontWeight:700, color:"#86868b", letterSpacing:".12em", textTransform:"uppercase", marginBottom:18 }}>Il tuo ordine</h2>
              <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                {orderData.items.map((item,idx) => (
                  <div key={idx} style={{ display:"flex", gap:14, alignItems:"center" }}>
                    {item.image && (
                      <div style={{ width:60, height:60, flexShrink:0, background:"#f2f2f7", borderRadius:10, overflow:"hidden" }}>
                        <img src={item.image} alt={item.title} style={{ width:"100%", height:"100%", objectFit:"contain", padding:4 }} />
                      </div>
                    )}
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ fontSize:14, fontWeight:600, color:"#1d1d1f", marginBottom:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{item.title}</p>
                      {item.variantTitle && <p style={{ fontSize:12, color:"#86868b", marginBottom:2 }}>{item.variantTitle}</p>}
                      <p style={{ fontSize:12, color:"#86868b" }}>Qtà: {item.quantity}</p>
                    </div>
                    <p style={{ fontSize:14, fontWeight:600, color:"#1d1d1f", flexShrink:0 }}>{fmt(item.linePriceCents||item.priceCents||0)}</p>
                  </div>
                ))}
              </div>
              <div style={{ borderTop:"1px solid #f2f2f7", marginTop:20, paddingTop:16, display:"flex", flexDirection:"column", gap:8 }}>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, color:"#86868b" }}>
                  <span>Subtotale</span><span style={{ color:"#1d1d1f" }}>{fmt(orderData.subtotalCents)}</span>
                </div>
                {(orderData.discountCents||0)>0 && (
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, color:"#34c759" }}>
                    <span>Sconto</span><span>−{fmt(orderData.discountCents)}</span>
                  </div>
                )}
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, color:"#86868b" }}>
                  <span>Spedizione</span><span style={{ color:"#1d1d1f" }}>{fmt(orderData.shippingCents)}</span>
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:17, fontWeight:700, color:"#1d1d1f", paddingTop:8, borderTop:"1px solid #f2f2f7" }}>
                  <span>Totale</span><span>{fmt(orderData.totalCents)}</span>
                </div>
              </div>
            </div>
          )}

          {/* INDIRIZZO */}
          {customer?.address1 && (
            <div className={visible?"ty-fade ty-3":""} style={{ background:"#fff", borderRadius:20, padding:"24px", marginBottom:12, boxShadow:"0 2px 12px rgba(0,0,0,0.06)" }}>
              <h2 style={{ fontSize:12, fontWeight:700, color:"#86868b", letterSpacing:".12em", textTransform:"uppercase", marginBottom:14 }}>📦 Spedizione a</h2>
              <div style={{ background:"#f2f2f7", borderRadius:12, padding:"16px 18px", fontSize:14, lineHeight:1.8, color:"#1d1d1f" }}>
                <strong>{customer.fullName}</strong><br/>
                {customer.address1}{customer.address2?`, ${customer.address2}`:""}<br/>
                {customer.postalCode} {customer.city}<br/>
                {customer.province?`${customer.province} · `:""}{customer.countryCode}
              </div>
            </div>
          )}

          {/* UPSELL */}
          <div className={visible?"ty-fade ty-4":""}>
            {sessionId && <UpsellBlock sessionId={sessionId} />}
          </div>

          {/* PROSSIMI PASSI */}
          <div className={visible?"ty-fade ty-4":""} style={{ background:"#fff", borderRadius:20, padding:"24px", marginTop:12, marginBottom:12, boxShadow:"0 2px 12px rgba(0,0,0,0.06)" }}>
            <h2 style={{ fontSize:12, fontWeight:700, color:"#86868b", letterSpacing:".12em", textTransform:"uppercase", marginBottom:18 }}>Cosa succede ora</h2>
            {[
              { icon:"📬", step:"Email di conferma", desc:"Tutti i dettagli del tuo ordine nella tua casella" },
              { icon:"📦", step:"Preparazione", desc:"Il team prepara il tuo ordine entro 1-2 giorni lavorativi" },
              { icon:"🚚", step:"Spedizione", desc:"Ricevi il tracking via email non appena parte" },
            ].map((s,i) => (
              <div key={i} style={{ display:"flex", gap:14, alignItems:"flex-start", marginBottom:i<2?16:0 }}>
                <div style={{ width:42, height:42, borderRadius:12, background:"#f2f2f7", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>{s.icon}</div>
                <div>
                  <p style={{ fontSize:14, fontWeight:600, color:"#1d1d1f", marginBottom:2 }}>{s.step}</p>
                  <p style={{ fontSize:13, color:"#86868b", margin:0 }}>{s.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className={visible?"ty-fade ty-5":""} style={{ marginBottom:12 }}>
            <a href={`https://${orderData.shopDomain||"notforresale.it"}`} style={{ display:"block", padding:"16px", background:"#000", color:"#fff", textAlign:"center", fontWeight:700, fontSize:15, borderRadius:16, textDecoration:"none", boxSizing:"border-box", boxShadow:"0 4px 16px rgba(0,0,0,0.15)" }}>
              Continua a fare shopping →
            </a>
          </div>

          {/* FOOTER */}
          <div className={visible?"ty-fade ty-5":""} style={{ textAlign:"center", padding:"20px 0 8px" }}>
            <p style={{ fontSize:13, color:"#86868b", marginBottom:12 }}>
              Hai bisogno di aiuto?{" "}
              <a href="mailto:info@notforresale.it" style={{ color:"#000", fontWeight:600, textDecoration:"none" }}>info@notforresale.it</a>
            </p>
            <a href="https://www.instagram.com/notforresale_italia/?hl=it" target="_blank" rel="noreferrer">
              <img src="https://cdn.tools.unlayer.com/social/icons/circle/instagram.png" alt="Instagram" style={{ width:28, opacity:.55 }} />
            </a>
            <p style={{ fontSize:11, color:"#c7c7cc", marginTop:16 }}>© {new Date().getFullYear()} Not For Resale · Made with ❤️ in Italy</p>
          </div>
        </div>
      </div>
    </>
  )
}

export default function ThankYouPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight:"100vh", background:"#000", display:"flex", alignItems:"center", justifyContent:"center" }}>
        <div style={{ width:28, height:28, border:"2px solid rgba(255,255,255,0.1)", borderTop:"2px solid #fff", borderRadius:"50%", animation:"ty-spin 0.8s linear infinite" }} />
        <style>{`@keyframes ty-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
      </div>
    }>
      <ThankYouContent />
    </Suspense>
  )
}
