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

        const subtotal = data.subtotalCents || 0
        const shipping = 590
        
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
          customer: data.customer,
        }

        setOrderData(processedOrderData)

        // ===================================================================
        // FACEBOOK TRACKING - SOLO PAGEVIEW (Purchase gestito da webhook)
        // ===================================================================
        
        if (typeof window !== 'undefined') {
          console.log('[ThankYou] 📊 Facebook Pixel PageView')
          
          if ((window as any).fbq) {
            try {
              // ✅ SOLO PAGEVIEW (Purchase già inviato dal webhook)
              ;(window as any).fbq('track', 'PageView')
              console.log('[ThankYou] ✅ Facebook Pixel PageView inviato')
              console.log('[ThankYou] ℹ️ Purchase già tracciato dal webhook Stripe con UTM')
            } catch (err) {
              console.error('[ThankYou] ⚠️ Facebook Pixel bloccato:', err)
            }
          } else {
            console.log('[ThankYou] ⚠️ Facebook Pixel non disponibile (fbq non trovato)')
          }
        }

        // ===================================================================
        // GOOGLE ADS CONVERSION
        // ===================================================================

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

        // ===================================================================
        // FIREBASE ANALYTICS - ✅ VERSIONE COMPLETA
        // ===================================================================

        const saveAnalytics = async () => {
          try {
            console.log('[ThankYou] 💾 Salvataggio analytics completi su Firebase...')
            
            const cartAttrs = data.rawCart?.attributes || {}
            
            // ✅ DATI COMPLETI PER ANALYTICS
            const analyticsData = {
              orderId: processedOrderData.shopifyOrderId || sessionId,
              orderNumber: processedOrderData.shopifyOrderNumber || null,
              sessionId: sessionId,
              timestamp: new Date().toISOString(),
              
              // ✅ VALORI DETTAGLIATI
              value: finalTotal / 100,
              valueCents: finalTotal,
              subtotalCents: subtotal,
              shippingCents: shipping,
              discountCents: discount,
              currency: data.currency || 'EUR',
              itemCount: (data.items || []).length,
              
              // ✅ UTM LAST CLICK (con fbclid e gclid)
              utm: {
                source: cartAttrs._wt_last_source || null,
                medium: cartAttrs._wt_last_medium || null,
                campaign: cartAttrs._wt_last_campaign || null,
                content: cartAttrs._wt_last_content || null,
                term: cartAttrs._wt_last_term || null,
                fbclid: cartAttrs._wt_last_fbclid || null,
                gclid: cartAttrs._wt_last_gclid || null,
              },
              
              // ✅ UTM FIRST CLICK (con referrer e landing page)
              utm_first: {
                source: cartAttrs._wt_first_source || null,
                medium: cartAttrs._wt_first_medium || null,
                campaign: cartAttrs._wt_first_campaign || null,
                content: cartAttrs._wt_first_content || null,
                term: cartAttrs._wt_first_term || null,
                referrer: cartAttrs._wt_first_referrer || null,
                landing: cartAttrs._wt_first_landing || null,
                fbclid: cartAttrs._wt_first_fbclid || null,
                gclid: cartAttrs._wt_first_gclid || null,
              },
              
              // ✅ CUSTOMER COMPLETO
              customer: {
                email: processedOrderData.email || null,
                fullName: data.customer?.fullName || null,
                city: data.customer?.city || null,
                postalCode: data.customer?.postalCode || null,
                countryCode: data.customer?.countryCode || null,
              },
              
              // ✅ ITEMS COMPLETI (con tutti i dettagli)
              items: (data.items || []).map((item: any) => ({
                id: item.id || item.variant_id,
                title: item.title,
                quantity: item.quantity,
                priceCents: item.priceCents || 0,
                linePriceCents: item.linePriceCents || 0,
                image: item.image || null,
                variantTitle: item.variantTitle || null,
              })),
              
              // ✅ SHOP DOMAIN
              shopDomain: data.shopDomain || 'notforresale.it',
            }

            console.log('[ThankYou] 📊 Analytics payload:')
            console.log('[ThankYou]    - Order:', analyticsData.orderNumber || 'pending')
            console.log('[ThankYou]    - Value:', analyticsData.value, analyticsData.currency)
            console.log('[ThankYou]    - Items:', analyticsData.itemCount)
            console.log('[ThankYou]    - UTM Last:', analyticsData.utm.campaign || 'direct')
            console.log('[ThankYou]    - UTM First:', analyticsData.utm_first.campaign || 'direct')

            // ✅ ENDPOINT CORRETTO
            const analyticsRes = await fetch('/api/analytics/purchase', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(analyticsData)
            })

            if (analyticsRes.ok) {
              const result = await analyticsRes.json()
              console.log('[ThankYou] ✅ Analytics salvate su Firebase - ID:', result.id)
            } else {
              const errorData = await analyticsRes.json()
              console.error('[ThankYou] ⚠️ Errore salvataggio analytics:', errorData)
            }
          } catch (err) {
            console.error('[ThankYou] ⚠️ Errore chiamata analytics:', err)
          }
        }

        saveAnalytics()

        // ===================================================================
        // CLEAR CART
        // ===================================================================

        if (data.rawCart?.id || data.rawCart?.token) {
          const cartId = data.rawCart.id || `gid://shopify/Cart/${data.rawCart.token}`
          console.log('[ThankYou] 🧹 Svuotamento carrello')
          
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
          <a
            href={`https://${orderData?.shopDomain || 'nfrcheckout.com'}`}
            className="inline-block mt-4 px-6 py-3 bg-gray-900 text-white font-medium rounded-md hover:bg-gray-800 transition"
          >
            Torna al negozio
          </a>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* ✅ FACEBOOK PIXEL INIT - Solo per PageView */}
      <Script id="facebook-pixel" strategy="afterInteractive">
        {`
          !function(f,b,e,v,n,t,s)
          {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s)}(window, document,'script',
          'https://connect.facebook.net/en_US/fbevents.js');
          
          fbq('init', '${process.env.NEXT_PUBLIC_FB_PIXEL_ID}');
          console.log('[ThankYou] ✅ Facebook Pixel inizializzato (PageView only)');
        `}
      </Script>

      {/* ✅ GOOGLE ADS */}
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

      <div className="min-h-screen bg-[#fafafa] py-12">
        <div className="max-w-3xl mx-auto px-4">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
            
            {/* Success Icon */}
            <div className="flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mx-auto mb-6">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <h1 className="text-3xl font-bold text-gray-900 text-center mb-2">
              Ordine Confermato!
            </h1>
            <p className="text-center text-gray-600 mb-6">
              Grazie per il tuo acquisto
            </p>

            {/* Order Number */}
            {orderData.shopifyOrderNumber && (
              <div className="bg-gray-50 rounded-lg p-4 mb-6 text-center">
                <p className="text-sm text-gray-600 mb-1">Numero ordine</p>
                <p className="text-2xl font-bold text-gray-900">
                  #{orderData.shopifyOrderNumber}
                </p>
              </div>
            )}

            {/* Email Confirmation */}
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

            {/* Order Items */}
            {orderData.items && orderData.items.length > 0 && (
              <div className="border-t border-gray-200 pt-6 mb-6">
                <h2 className="text-base font-semibold text-gray-900 mb-4">
                  Prodotti ordinati
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

            {/* Order Totals */}
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

          {/* Info Box */}
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

          {/* Action Buttons */}
          <div className="space-y-3 mt-6">
            <a
              href={`https://${orderData.shopDomain || 'nfrcheckout.com'}`}
              className="block w-full py-3 px-4 bg-gray-900 text-white text-center font-medium rounded-md hover:bg-gray-800 transition"
            >
              Torna al negozio
            </a>
          </div>

          {/* Cart Cleared Confirmation */}
          {cartCleared && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
              <p className="text-xs text-green-800 text-center">
                ✓ Carrello svuotato con successo
              </p>
            </div>
          )}
        </div>
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
