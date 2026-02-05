// src/app/thank-you/page.tsx
"use client"

import { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Script from "next/script"
import { sendFacebookPurchaseEvent } from "@/lib/facebook-capi"

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
}

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

        if (!res.ok) {
          throw new Error(data.error || "Errore caricamento ordine")
        }

        console.log('[ThankYou] 📦 Dati carrello ricevuti:', data)
        console.log('[ThankYou] 📦 RawCart attributes:', data.rawCart?.attributes)

        // ✅ CALCOLO CORRETTO DEI TOTALI
        const subtotal = data.subtotalCents || 0
        const shipping = 590 // SEMPRE 5.90€
        
        let discount = 0
        if (data.totalCents && data.totalCents < subtotal) {
          discount = subtotal - data.totalCents
        }
        
        const finalTotal = subtotal - discount + shipping

        console.log('[ThankYou] 💰 Calcoli:')
        console.log('  - Subtotal:', subtotal / 100, '€')
        console.log('  - Discount:', discount / 100, '€')
        console.log('  - Shipping:', shipping / 100, '€')
        console.log('  - TOTAL:', finalTotal / 100, '€')

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
        }

        setOrderData(processedOrderData)

        // ═══════════════════════════════════════════════════════════
        // ✅ TRACKING FACEBOOK PIXEL + CAPI CON DEDUPLICA
        // ═══════════════════════════════════════════════════════════
        if (typeof window !== 'undefined') {
          console.log('[ThankYou] 📊 Avvio tracking Facebook completo...')
          
          const contentIds = (data.items || [])
            .map((item: any) => String(item.id || item.variant_id))
            .filter(Boolean)
          
          // ✅ EVENT ID SINCRONIZZATO con webhook (CRITICO per deduplica!)
          const eventId = data.shopifyOrderId 
            ? `order_${data.shopifyOrderId}` 
            : data.paymentIntentId || sessionId

          console.log('[ThankYou] 🎯 Event ID per deduplica:', eventId)
          
          // ✅ RECUPERA COOKIE FACEBOOK
          const fbp = document.cookie
            .split('; ')
            .find(row => row.startsWith('_fbp='))
            ?.split('=')[1]
          
          const cartAttrs = data.rawCart?.attributes || {}
          
          // Costruisci fbc da cookie o ricostruiscilo da fbclid
          const fbc = document.cookie
            .split('; ')
            .find(row => row.startsWith('_fbc='))
            ?.split('=')[1] || 
            (cartAttrs._wt_last_fbclid 
              ? `fb.1.${Date.now()}.${cartAttrs._wt_last_fbclid}` 
              : undefined)
          
          // ✅ RECUPERA UTM
          const utmData = {
            source: cartAttrs._wt_last_source || undefined,
            medium: cartAttrs._wt_last_medium || undefined,
            campaign: cartAttrs._wt_last_campaign || undefined,
            content: cartAttrs._wt_last_content || undefined,
            term: cartAttrs._wt_last_term || undefined,
          }
          
          console.log('[ThankYou] 🍪 fbp:', fbp || 'N/A')
          console.log('[ThankYou] 🍪 fbc:', fbc || 'N/A')
          console.log('[ThankYou] 📍 UTM:', utmData)
          
          let pixelFired = false
          let capiFired = false
          
          // ═══════════════════════════════════════════════════════════
          // 1. FACEBOOK PIXEL (CLIENT-SIDE) - Può essere bloccato
          // ═══════════════════════════════════════════════════════════
          if ((window as any).fbq) {
            try {
              (window as any).fbq('track', 'Purchase', {
                value: finalTotal / 100,
                currency: data.currency || 'EUR',
                content_ids: contentIds,
                content_type: 'product',
                num_items: (data.items || []).length,
                ...utmData
              }, { 
                eventID: eventId // ← STESSO eventId per deduplica!
              })
              
              pixelFired = true
              console.log('[ThankYou] ✅ Facebook Pixel Purchase inviato')
              console.log('[ThankYou]    - Event ID:', eventId)
              console.log('[ThankYou]    - Value:', finalTotal / 100, data.currency || 'EUR')
              console.log('[ThankYou]    - UTM Campaign:', utmData.campaign || 'direct')
            } catch (err) {
              console.error('[ThankYou] ⚠️ Facebook Pixel bloccato:', err)
            }
          } else {
            console.log('[ThankYou] ⚠️ Facebook Pixel non disponibile (fbq non trovato)')
          }
          
          // ═══════════════════════════════════════════════════════════
          // 2. FACEBOOK CAPI (SERVER-SIDE) - Sempre funziona!
          // ═══════════════════════════════════════════════════════════
          console.log('[ThankYou] 📤 Invio Facebook CAPI...')
          
          sendFacebookPurchaseEvent({
            email: processedOrderData.email || '',
            phone: data.customer?.phone,
            firstName: data.customer?.fullName?.split(' ')[0],
            lastName: data.customer?.fullName?.split(' ').slice(1).join(' '),
            city: data.customer?.city,
            postalCode: data.customer?.postalCode,
            country: data.customer?.countryCode,
            orderValue: finalTotal,
            currency: data.currency || 'EUR',
            orderItems: (data.items || []).map((item: any) => ({
              id: String(item.id || item.variant_id || ''),
              quantity: item.quantity || 1
            })),
            eventSourceUrl: window.location.href,
            userAgent: navigator.userAgent,
            fbp: fbp,
            fbc: fbc,
            eventId: eventId, // ← STESSO eventId del Pixel!
            utm: utmData,
          }).then(result => {
            capiFired = result.success
            if (result.success) {
              console.log('[ThankYou] ✅ Facebook CAPI Purchase inviato')
              console.log('[ThankYou]    - Event ID:', eventId)
              console.log('[ThankYou]    - Match quality: alta (client-side data)')
            } else {
              console.error('[ThankYou] ⚠️ Facebook CAPI fallita:', result.error)
            }
          }).catch(err => {
            console.error('[ThankYou] ⚠️ Errore chiamata CAPI:', err)
          })

          // ═══════════════════════════════════════════════════════════
          // RIEPILOGO TRACKING FACEBOOK
          // ═══════════════════════════════════════════════════════════
          setTimeout(() => {
            console.log('[ThankYou] 📊 Riepilogo Facebook Tracking:')
            console.log('[ThankYou]    - Pixel fired:', pixelFired ? '✅' : '❌')
            console.log('[ThankYou]    - CAPI fired:', capiFired ? '✅' : '❌')
            console.log('[ThankYou]    - Event ID:', eventId)
            console.log('[ThankYou]    - Deduplica:', pixelFired && capiFired ? '✅ Attiva' : '⚠️ Non necessaria')
          }, 2000)
        }

        // ═══════════════════════════════════════════════════════════
        // ✅ TRACKING GOOGLE ADS PURCHASE CON UTM (invariato)
        // ═══════════════════════════════════════════════════════════
        const sendGoogleConversion = () => {
          if (typeof window !== 'undefined' && (window as any).gtag) {
            console.log('[ThankYou] 📊 Invio Google Ads Purchase...')
            
            const orderTotal = finalTotal / 100
            const orderId = data.shopifyOrderNumber || data.shopifyOrderId || sessionId
            
            const cartAttrs = data.rawCart?.attributes || {}
            
            ;(window as any).gtag('event', 'conversion', {
              'send_to': 'AW-17391033186/G-u0CLKyxbsbEOK22ORA',
              'value': orderTotal,
              'currency': data.currency || 'EUR',
              'transaction_id': orderId,
              'utm_source': cartAttrs._wt_last_source || '',
              'utm_medium': cartAttrs._wt_last_medium || '',
              'utm_campaign': cartAttrs._wt_last_campaign || '',
              'utm_content': cartAttrs._wt_last_content || '',
              'utm_term': cartAttrs._wt_last_term || '',
            })

            console.log('[ThankYou] ✅ Google Ads Purchase inviato con UTM')
            console.log('[ThankYou] Order ID:', orderId)
            console.log('[ThankYou] Value:', orderTotal, data.currency || 'EUR')
            console.log('[ThankYou] UTM Campaign:', cartAttrs._wt_last_campaign || 'N/A')
          }
        }

        if ((window as any).gtag) {
          sendGoogleConversion()
        } else {
          const checkGtag = setInterval(() => {
            if ((window as any).gtag) {
              clearInterval(checkGtag)
              sendGoogleConversion()
            }
          }, 100)
          setTimeout(() => clearInterval(checkGtag), 5000)
        }

        // ═══════════════════════════════════════════════════════════
        // ✅ SALVA ANALYTICS SU FIREBASE (invariato)
        // ═══════════════════════════════════════════════════════════
        const saveAnalytics = async () => {
          try {
            console.log('[ThankYou] 💾 Salvataggio analytics su Firebase...')
            
            const cartAttrs = data.rawCart?.attributes || {}
            
            const analyticsData = {
              orderId: processedOrderData.shopifyOrderId || sessionId,
              orderNumber: processedOrderData.shopifyOrderNumber || null,
              sessionId: sessionId,
              timestamp: new Date().toISOString(),
              value: finalTotal / 100,
              valueCents: finalTotal,
              subtotalCents: subtotal,
              shippingCents: shipping,
              discountCents: discount,
              currency: data.currency || 'EUR',
              itemCount: (data.items || []).length,
              utm: {
                source: cartAttrs._wt_last_source || null,
                medium: cartAttrs._wt_last_medium || null,
                campaign: cartAttrs._wt_last_campaign || null,
                content: cartAttrs._wt_last_content || null,
                term: cartAttrs._wt_last_term || null,
                fbclid: cartAttrs._wt_last_fbclid || null,
              },
              utm_first: {
                source: cartAttrs._wt_first_source || null,
                campaign: cartAttrs._wt_first_campaign || null,
                referrer: cartAttrs._wt_first_referrer || null,
                landing: cartAttrs._wt_first_landing || null,
              },
              customer: {
                email: processedOrderData.email || null,
              },
              items: (data.items || []).map((item: any) => ({
                id: item.id || item.variant_id,
                title: item.title,
                quantity: item.quantity,
                priceCents: item.priceCents || 0,
                linePriceCents: item.linePriceCents || 0,
                image: item.image || null,
                variantTitle: item.variantTitle || null,
              })),
              shopDomain: data.shopDomain || 'notforresale.it',
            }

            const analyticsRes = await fetch('/api/analytics/purchase', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(analyticsData)
            })

            if (analyticsRes.ok) {
              const result = await analyticsRes.json()
              console.log('[ThankYou] ✅ Analytics salvate su Firebase - ID:', result.id)
            } else {
              console.error('[ThankYou] ⚠️ Errore salvataggio analytics')
            }
          } catch (err) {
            console.error('[ThankYou] ⚠️ Errore chiamata analytics:', err)
          }
        }

        // Salva analytics (non blocca il resto)
        saveAnalytics()

        // ═══════════════════════════════════════════════════════════
        // SVUOTA CARRELLO (invariato)
        // ═══════════════════════════════════════════════════════════
        if (data.rawCart?.id || data.rawCart?.token) {
          const cartId = data.rawCart.id || `gid://shopify/Cart/${data.rawCart.token}`
          console.log('[ThankYou] 🧹 Avvio svuotamento carrello')
          
          try {
            const clearRes = await fetch('/api/clear-cart', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                cartId: cartId,
                sessionId: sessionId 
              }),
            })

            const clearData = await clearRes.json()

            if (clearRes.ok) {
              console.log('[ThankYou] ✅ Carrello svuotato con successo')
              setCartCleared(true)
            } else {
              console.error('[ThankYou] ⚠️ Errore svuotamento:', clearData.error)
            }
          } catch (clearErr) {
            console.error('[ThankYou] ⚠️ Errore chiamata clear-cart:', clearErr)
          }
        } else {
          console.log('[ThankYou] ℹ️ Nessun carrello da svuotare')
        }

        setLoading(false)
      } catch (err: any) {
        console.error("[ThankYou] Errore caricamento ordine:", err)
        setError(err.message)
        setLoading(false)
      }
    }

    loadOrderDataAndClearCart()
  }, [sessionId])

  const shopUrl = orderData?.shopDomain 
    ? `https://${orderData.shopDomain}`
    : "https://notforresale.it"

  const formatMoney = (cents: number | undefined) => {
    const value = (cents ?? 0) / 100
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: orderData?.currency || "EUR",
      minimumFractionDigits: 2,
    }).format(value)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-gray-900 mb-4"></div>
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
          
            href={shopUrl}
            className="inline-block mt-4 px-6 py-3 bg-gray-900 text-white font-medium rounded-md hover:bg-gray-800 transition"
          >
            Torna alla home
          </a>
        </div>
      </div>
    )
  }

  return (
    <>
      <Script
        src="https://www.googletagmanager.com/gtag/js?id=AW-17391033186"
        strategy="afterInteractive"
      />
      <Script
        id="google-ads-init"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'AW-17391033186');
            console.log('[ThankYou] ✅ Google Tag inizializzato');
          `,
        }}
      />

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
      `}</style>

      <div className="min-h-screen bg-[#fafafa]">
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-6xl mx-auto px-4 py-4">
            <div className="flex justify-center">
              <a href={shopUrl}>
                <img
                  src="https://cdn.shopify.com/s/files/1/0899/2188/0330/files/logo_checkify_d8a640c7-98fe-4943-85c6-5d1a633416cf.png?v=1761832152"
                  alt="Logo"
                  className="h-12"
                  style={{ maxWidth: '180px' }}
                />
              </a>
            </div>
          </div>
        </header>

        <div className="max-w-2xl mx-auto px-4 py-8 sm:py-12">
          
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 sm:p-8 mb-6">
            
            <div className="flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mx-auto mb-6">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900 text-center mb-2">
              Ordine confermato
            </h1>
            <p className="text-center text-gray-600 mb-6">
              Grazie per il tuo acquisto!
            </p>

            {orderData.shopifyOrderNumber && (
              <div className="bg-gray-50 rounded-lg p-4 mb-6 text-center">
                <p className="text-sm text-gray-600 mb-1">Numero ordine</p>
                <p className="text-2xl font-bold text-gray-900">
                  #{orderData.shopifyOrderNumber}
                </p>
              </div>
            )}

            {orderData.email && (
              <div className="border-t border-gray-200 pt-6 mb-6">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-gray-900 mb-1">
                      Conferma inviata a
                    </p>
                    <p className="text-sm text-gray-600">{orderData.email}</p>
                  </div>
                </div>
              </div>
            )}

            {orderData.items && orderData.items.length > 0 && (
              <div className="border-t border-gray-200 pt-6 mb-6">
                <h2 className="text-base font-semibold text-gray-900 mb-4">
                  Articoli acquistati
                </h2>
                <div className="space-y-4">
                  {orderData.items.map((item, idx) => (
                    <div key={idx} className="flex gap-4">
                      {item.image && (
                        <div className="w-16 h-16 flex-shrink-0 bg-gray-100 rounded border border-gray-200">
                          <img
                            src={item.image}
                            alt={item.title}
                            className="w-full h-full object-cover rounded"
                          />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          {item.title}
                        </p>
                        {item.variantTitle && (
                          <p className="text-xs text-gray-500 mt-1">
                            {item.variantTitle}
                          </p>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                          Quantità: {item.quantity}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-medium text-gray-900">
                          {formatMoney(item.linePriceCents || item.priceCents || 0)}
                        </p>
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

          <div className="bg-blue-50 rounded-lg border border-blue-200 p-6 mb-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Cosa succede ora?
            </h2>
            <ul className="space-y-3 text-sm text-gray-700">
              <li className="flex items-start gap-2">
                <span className="text-blue-600 font-semibold">1.</span>
                <span>Riceverai un&apos;email di conferma con tutti i dettagli</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 font-semibold">2.</span>
                <span>Il tuo ordine verrà preparato entro 1-2 giorni lavorativi</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 font-semibold">3.</span>
                <span>Riceverai il tracking della spedizione via email</span>
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            
              href={shopUrl}
              className="block w-full py-3 px-4 bg-gray-900 text-white text-center font-medium rounded-md hover:bg-gray-800 transition"
            >
              Torna alla home
            </a>
            
              href={`${shopUrl}/collections/all`}
              className="block w-full py-3 px-4 bg-white text-gray-900 text-center font-medium rounded-md border border-gray-300 hover:bg-gray-50 transition"
            >
              Continua lo shopping
            </a>
          </div>

          <div className="text-center mt-8 pt-6 border-t border-gray-200">
            <p className="text-sm text-gray-600 mb-2">
              Hai bisogno di aiuto?
            </p>
            
              href={`${shopUrl}/pages/contatti`}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Contatta il supporto →
            </a>
          </div>

          {cartCleared && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
              <p className="text-xs text-green-800 text-center">
                ✓ Carrello svuotato con successo
              </p>
            </div>
          )}
        </div>

        <footer className="border-t border-gray-200 py-6 mt-12">
          <div className="max-w-6xl mx-auto px-4 text-center">
            <p className="text-xs text-gray-500">
              © 2025 Not For Resale. Tutti i diritti riservati.
            </p>
          </div>
        </footer>
      </div>
    </>
  )
}

export default function ThankYouPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#fafafa] flex items-center justify-center">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-gray-900"></div>
        </div>
      }
    >
      <ThankYouContent />
    </Suspense>
  )
}
