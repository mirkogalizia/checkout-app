"use client"

import React, {
  Suspense,
  useEffect,
  useMemo,
  useState,
  ChangeEvent,
} from "react"
import { useSearchParams } from "next/navigation"
import { loadStripe } from "@stripe/stripe-js"
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js"

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "",
)

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
  rawCart?: any
}

type Customer = {
  firstName: string
  lastName: string
  email: string
  phone: string
  address1: string
  address2: string
  city: string
  province: string
  zip: string
  country: string
}

const FIXED_SHIPPING_CENTS = 590

/* ---------------------------------------------
   INPUT GENERICO
---------------------------------------------- */

type InputProps = React.InputHTMLAttributes<HTMLInputElement>

function Input(props: InputProps) {
  const { className = "", ...rest } = props
  return (
    <input
      className={[
        "w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900",
        "placeholder:text-gray-400",
        "focus:outline-none focus:ring-2 focus:ring-black focus:border-black",
        "transition-shadow",
        className,
      ].join(" ")}
      {...rest}
    />
  )
}

/* ---------------------------------------------
   PAGE INNER
---------------------------------------------- */

function CheckoutPageInner() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get("sessionId") || ""

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [items, setItems] = useState<CheckoutItem[]>([])
  const [rawCartItems, setRawCartItems] = useState<any[]>([])
  const [currency, setCurrency] = useState("EUR")
  const [discountCodeLabel, setDiscountCodeLabel] = useState<string | null>(
    null,
  )

  // prezzi
  const [originalSubtotalCents, setOriginalSubtotalCents] = useState(0) // prezzo pieno
  const [discountedSubtotalCents, setDiscountedSubtotalCents] = useState(0) // dopo tutti gli sconti
  const [discountCents, setDiscountCents] = useState(0)
  const [shippingCents, setShippingCents] = useState(0)
  const [totalCents, setTotalCents] = useState(0)

  const [clientSecret, setClientSecret] = useState<string | null>(null)

  const [customer, setCustomer] = useState<Customer>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    address1: "",
    address2: "",
    city: "",
    province: "",
    zip: "",
    country: "IT",
  })

  /* ---------------------------------------------
     CARICA SESSIONE CARRELLO
  ---------------------------------------------- */
  useEffect(() => {
    if (!sessionId) {
      setError("Nessuna sessione di checkout trovata.")
      setLoading(false)
      return
    }

    ;(async () => {
      try {
        setLoading(true)
        const res = await fetch(
          `/api/cart-session?sessionId=${encodeURIComponent(sessionId)}`,
        )
        const json = await res.json()

        if (!res.ok) {
          setError(json.error || "Errore nel recupero del carrello")
          setLoading(false)
          return
        }

        const data = json as CartSessionResponse

        setItems(data.items || [])
        setCurrency((data.currency || "EUR").toUpperCase())

        const raw = (data.rawCart as any) || {}
        setRawCartItems(Array.isArray(raw.items) ? raw.items : [])

        // prendi l’eventuale codice sconto dal carrello Shopify
        const codes = raw.discount_codes || []
        if (Array.isArray(codes) && codes.length > 0 && codes[0]?.code) {
          setDiscountCodeLabel(codes[0].code)
        } else if (
          Array.isArray(raw.cart_level_discount_applications) &&
          raw.cart_level_discount_applications.length > 0 &&
          raw.cart_level_discount_applications[0]?.title
        ) {
          setDiscountCodeLabel(raw.cart_level_discount_applications[0].title)
        } else {
          setDiscountCodeLabel(null)
        }

        setError(null)
      } catch (err) {
        console.error(err)
        setError("Errore nel caricamento del carrello")
      } finally {
        setLoading(false)
      }
    })()
  }, [sessionId])

  /* ---------------------------------------------
     RICALCOLO SUBTOTALI DA items[]
     (così includiamo TUTTI gli sconti reali)
  ---------------------------------------------- */
  useEffect(() => {
    if (!items.length) {
      setOriginalSubtotalCents(0)
      setDiscountedSubtotalCents(0)
      setDiscountCents(0)
      setTotalCents(0)
      return
    }

    let original = 0
    let discounted = 0

    for (const it of items) {
      const q = Number(it.quantity || 1)
      const base = Number(it.priceCents || 0)
      const lineTotal =
        typeof it.linePriceCents === "number"
          ? Number(it.linePriceCents)
          : base * q

      original += base * q
      discounted += lineTotal
    }

    setOriginalSubtotalCents(original)
    setDiscountedSubtotalCents(discounted)
    setDiscountCents(Math.max(0, original - discounted))
    // il totale finale verrà ricalcolato nell’effetto spedizione
  }, [items])

  /* ---------------------------------------------
     GESTIONE CAMPI INDIRIZZO + SPEDIZIONE 5,90
  ---------------------------------------------- */
  function handleCustomerChange(
    field: keyof Customer,
    e: ChangeEvent<HTMLInputElement>,
  ) {
    const value = e.target.value
    setCustomer(prev => ({ ...prev, [field]: value }))
  }

  useEffect(() => {
    const requiredOk =
      customer.firstName.trim() &&
      customer.lastName.trim() &&
      customer.email.trim() &&
      customer.address1.trim() &&
      customer.zip.trim() &&
      customer.city.trim() &&
      customer.province.trim() &&
      customer.country.trim()

    if (requiredOk) {
      const ship = FIXED_SHIPPING_CENTS
      setShippingCents(ship)
      setTotalCents(discountedSubtotalCents + ship)
    } else {
      setShippingCents(0)
      setTotalCents(discountedSubtotalCents)
    }
  }, [customer, discountedSubtotalCents])

  /* ---------------------------------------------
     CREA / AGGIORNA PAYMENT INTENT STRIPE
  ---------------------------------------------- */
  useEffect(() => {
    if (!sessionId) return
    if (!discountedSubtotalCents) return // niente carrello => niente PI

    ;(async () => {
      try {
        const res = await fetch("/api/payment-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            shippingCents,
            customer,
            // 🔹 passiamo anche gli importi per il backend
            subtotalCents: discountedSubtotalCents,
            totalCents,
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          console.error("Errore payment-intent:", data)
          return
        }
        setClientSecret(data.clientSecret)
      } catch (err) {
        console.error("Errore payment-intent:", err)
      }
    })()
  }, [sessionId, discountedSubtotalCents, shippingCents, totalCents, customer])

  const itemsCount = useMemo(
    () => items.reduce((acc, it) => acc + Number(it.quantity || 0), 0),
    [items],
  )

  const subtotalProductsFormatted = (originalSubtotalCents / 100).toFixed(2)
  const subtotalAfterDiscountFormatted = (discountedSubtotalCents / 100).toFixed(
    2,
  )
  const discountFormatted = (discountCents / 100).toFixed(2)
  const shippingFormatted = (shippingCents / 100).toFixed(2)
  const totalFormatted = (totalCents / 100).toFixed(2)

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white text-black">
        <div className="text-sm text-gray-600">Caricamento checkout…</div>
      </main>
    )
  }

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white text-black p-4">
        <div className="max-w-md w-full border border-red-200 rounded-2xl p-5 bg-red-50 text-center">
          <h1 className="text-lg font-semibold mb-2">Errore checkout</h1>
          <p className="text-sm text-red-700 mb-4">{error}</p>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-full bg-black text-white px-4 py-2 text-sm font-medium"
          >
            Torna allo shop
          </a>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-white text-black px-4 py-6 md:px-6 lg:px-10">
      {/* HEADER con logo più grande, click = back al carrello Shopify */}
      <header className="mb-8 flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined") {
              window.history.back()
            }
          }}
          className="inline-flex items-center justify-center"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://cdn.shopify.com/s/files/1/0899/2188/0330/files/logo_checkify_d8a640c7-98fe-4943-85c6-5d1a633416cf.png?v=1761832152"
            alt="NOT FOR RESALE"
            className="h-12 md:h-14 w-auto"
          />
        </button>
      </header>

      <div className="mx-auto max-w-6xl grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)]">
        {/* COLONNA SINISTRA: dati + articoli */}
        <section className="space-y-8">
          {/* TITOLO */}
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
              Checkout
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              Completa i dati di spedizione e paga in modo sicuro.
            </p>
          </div>

          {/* DATI SPEDIZIONE */}
          <div className="border border-gray-200 rounded-3xl p-5 md:p-6 bg-white shadow-sm">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-4">
              Dati di spedizione
            </h2>

            <div className="grid gap-3 md:grid-cols-2">
              <Input
                placeholder="Nome"
                value={customer.firstName}
                onChange={e => handleCustomerChange("firstName", e)}
              />
              <Input
                placeholder="Cognome"
                value={customer.lastName}
                onChange={e => handleCustomerChange("lastName", e)}
              />
            </div>

            <div className="mt-3 space-y-3">
              <Input
                placeholder="Email"
                type="email"
                value={customer.email}
                onChange={e => handleCustomerChange("email", e)}
              />
              <Input
                placeholder="Telefono"
                value={customer.phone}
                onChange={e => handleCustomerChange("phone", e)}
              />
              <Input
                placeholder="Indirizzo"
                value={customer.address1}
                onChange={e => handleCustomerChange("address1", e)}
              />
              <Input
                placeholder="Interno, scala, citofono (opzionale)"
                value={customer.address2}
                onChange={e => handleCustomerChange("address2", e)}
              />

              <div className="grid gap-3 md:grid-cols-3">
                <Input
                  placeholder="CAP"
                  value={customer.zip}
                  onChange={e => handleCustomerChange("zip", e)}
                />
                <Input
                  placeholder="Città"
                  value={customer.city}
                  onChange={e => handleCustomerChange("city", e)}
                />
                <Input
                  placeholder="Provincia"
                  value={customer.province}
                  onChange={e => handleCustomerChange("province", e)}
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  placeholder="Paese"
                  value={customer.country}
                  onChange={e => handleCustomerChange("country", e)}
                />
              </div>
            </div>

            <p className="mt-3 text-[11px] text-gray-500">
              La spedizione verrà aggiunta automaticamente dopo aver inserito
              tutti i dati obbligatori.
            </p>
          </div>

          {/* ARTICOLI NEL CARRELLO */}
          <div className="border border-gray-200 rounded-3xl p-5 md:p-6 bg-white shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Articoli nel carrello
              </h2>
              <span className="text-xs text-gray-500">
                ({itemsCount} {itemsCount === 1 ? "articolo" : "articoli"})
              </span>
            </div>

            <div className="space-y-3">
              {items.map((item, idx) => {
                const rawLine = rawCartItems.find(
                  (r: any) =>
                    String(r.id) === String(item.id) ||
                    String(r.variant_id) === String(item.id),
                )

                const quantity = Number(
                  rawLine?.quantity ?? item.quantity ?? 1,
                )

                const basePriceCents = Number(item.priceCents || 0)
                const lineTotalCents =
                  typeof item.linePriceCents === "number"
                    ? Number(item.linePriceCents)
                    : basePriceCents * quantity

                const unitOriginal = basePriceCents / 100
                const unitFinal = lineTotalCents / 100 / quantity

                const linePrice = lineTotalCents / 100
                const unitPrice = unitFinal
                const saving =
                  unitOriginal > unitFinal
                    ? (unitOriginal - unitFinal) * quantity
                    : 0

                return (
                  <div
                    key={idx}
                    className="flex gap-3 rounded-2xl border border-gray-200 bg-gray-50/70 p-3"
                  >
                    {item.image && (
                      <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl bg-white border border-gray-200">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.image}
                          alt={item.title}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-gray-900 line-clamp-2">
                        {item.title}
                      </div>
                      {item.variantTitle && (
                        <div className="text-[11px] text-gray-500 mt-0.5">
                          {item.variantTitle}
                        </div>
                      )}
                      <div className="mt-1 text-[11px] text-gray-500">
                        {quantity}× {unitPrice.toFixed(2)} {currency}
                      </div>
                      {saving > 0 && (
                        <div className="mt-0.5 text-[11px] text-emerald-600">
                          Risparmi {saving.toFixed(2)} {currency}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-end justify-center text-sm font-semibold text-gray-900">
                      {linePrice.toFixed(2)} {currency}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* COLONNA DESTRA: riepilogo + pagamento */}
        <section className="space-y-6 lg:space-y-8">
          {/* RIEPILOGO ORDINE */}
          <div className="border border-gray-200 rounded-3xl p-5 md:p-6 bg-white shadow-sm">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-4">
              Riepilogo ordine
            </h2>

            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-600">Subtotale prodotti</dt>
                <dd>
                  {subtotalProductsFormatted} {currency}
                </dd>
              </div>

              {discountCents > 0 && (
                <div className="flex justify-between">
                  <dt className="text-gray-600">
                    Sconto
                    {discountCodeLabel ? ` (${discountCodeLabel})` : ""}
                  </dt>
                  <dd className="text-red-600">
                    −{discountFormatted} {currency}
                  </dd>
                </div>
              )}

              <div className="flex justify-between">
                <dt className="text-gray-600">Subtotale</dt>
                <dd>
                  {subtotalAfterDiscountFormatted} {currency}
                </dd>
              </div>

              <div className="flex justify-between">
                <dt className="text-gray-600">Spedizione</dt>
                <dd>
                  {shippingCents > 0
                    ? `${shippingFormatted} ${currency}`
                    : "Aggiunta dopo l'indirizzo"}
                </dd>
              </div>
            </dl>

            {shippingCents > 0 && (
              <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2">
                <div className="text-xs font-semibold text-gray-800">
                  Spedizione Standard 24/48h
                </div>
                <div className="text-[11px] text-gray-600">
                  Consegna stimata in 24/48h in tutta Italia.
                </div>
              </div>
            )}

            <div className="mt-4 border-t border-gray-200 pt-3 flex justify-between items-baseline">
              <span className="text-sm font-semibold text-gray-900">
                Totale
              </span>
              <span className="text-lg font-semibold text-gray-900">
                {totalFormatted} {currency}
              </span>
            </div>
          </div>

          {/* PAGAMENTO */}
          <div className="border border-gray-200 rounded-3xl p-5 md:p-6 bg-white shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Pagamento con carta
              </h2>
              <p className="text-[11px] text-gray-500">
                Tutte le transazioni sono sicure.
              </p>
            </div>

            <PaymentBox
              clientSecret={clientSecret}
              sessionId={sessionId}
              customer={customer}
              totalFormatted={`${totalFormatted} ${currency}`}
            />
          </div>
        </section>
      </div>
    </main>
  )
}

/* ---------------------------------------------
   BOX PAGAMENTO STRIPE
---------------------------------------------- */

function PaymentBox({
  clientSecret,
  sessionId,
  customer,
  totalFormatted,
}: {
  clientSecret: string | null
  sessionId: string
  customer: Customer
  totalFormatted: string
}) {
  if (!clientSecret) {
    return (
      <div className="text-sm text-gray-500">
        Inserisci i dati di spedizione per attivare il pagamento.
      </div>
    )
  }

  const options: any = {
    clientSecret,
    appearance: {
      theme: "flat",
      labels: "floating",
      variables: {
        colorPrimary: "#000000",
        colorBackground: "#ffffff",
        colorText: "#111111",
        colorDanger: "#df1c41",
        borderRadius: "10px",
      },
      rules: {
        ".Block": {
          borderRadius: "12px",
          border: "1px solid #111111",
          boxShadow: "none",
        },
        ".Input": {
          borderRadius: "10px",
          border: "1px solid #111111",
          padding: "10px 12px",
          backgroundColor: "#ffffff",
          boxShadow: "none",
        },
        ".Input:focus": {
          borderColor: "#000000",
          boxShadow: "0 0 0 1px #000000",
        },
        ".Input--invalid": {
          borderColor: "#df1c41",
          boxShadow: "0 0 0 1px #df1c41",
        },
      },
    },
  }

  return (
    <Elements stripe={stripePromise} options={options}>
      <PaymentBoxInner
        sessionId={sessionId}
        customer={customer}
        totalFormatted={totalFormatted}
      />
    </Elements>
  )
}

function PaymentBoxInner({
  sessionId,
  customer,
  totalFormatted,
}: {
  sessionId: string
  customer: Customer
  totalFormatted: string
}) {
  const stripe = useStripe()
  const elements = useElements()

  const [cardholderName, setCardholderName] = useState("")
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handlePay() {
    if (!stripe || !elements) return

    setPaying(true)
    setError(null)

    const fullName =
      cardholderName.trim() ||
      `${customer.firstName} ${customer.lastName}`.trim()

    try {
      const { error, paymentIntent } = (await stripe.confirmPayment({
        elements,
        confirmParams: {
          payment_method_data: {
            billing_details: {
              name: fullName || undefined,
              email: customer.email || undefined,
              phone: customer.phone || undefined,
              address: {
                line1: customer.address1 || undefined,
                line2: customer.address2 || undefined,
                postal_code: customer.zip || undefined,
                city: customer.city || undefined,
                state: customer.province || undefined,
                country: customer.country || undefined,
              },
            },
          },
        },
        redirect: "if_required",
      } as any)) as {
        error: any
        paymentIntent: { id: string; status: string } | null
      }

      if (error) {
        console.error(error)
        setError(error.message || "Errore durante il pagamento")
        setPaying(false)
        return
      }

      if (paymentIntent && paymentIntent.status === "succeeded") {
        try {
          await fetch("/api/shopify/create-order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId,
              paymentIntentId: paymentIntent.id,
              customer,
            }),
          })
        } catch (e) {
          console.error("Errore creazione ordine Shopify", e)
        }

        window.location.href = `/thank-you?sessionId=${encodeURIComponent(
          sessionId,
        )}&pi=${encodeURIComponent(paymentIntent.id)}`
      } else {
        setError("Pagamento non completato. Riprova.")
        setPaying(false)
      }
    } catch (err: any) {
      console.error(err)
      setError(
        err?.message || "Errore imprevisto durante il pagamento",
      )
      setPaying(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1.5">
          Nome completo sull&apos;intestatario della carta
        </label>
        <Input
          placeholder="Es. Mario Rossi"
          value={cardholderName}
          onChange={e => setCardholderName(e.target.value)}
        />
      </div>

      <div className="rounded-2xl border border-black/80 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.08)] px-4 py-5">
        <PaymentElement />
      </div>

      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <button
        onClick={handlePay}
        disabled={paying || !stripe || !elements}
        className="w-full inline-flex items-center justify-center rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white hover:bg-gray-900 disabled:opacity-60"
      >
        {paying ? "Elaborazione…" : `Paga ora ${totalFormatted}`}
      </button>

      <p className="text-[11px] text-gray-500">
        I pagamenti sono elaborati in modo sicuro da Stripe. I dati della carta
        non passano mai sui nostri server.
      </p>
    </div>
  )
}

/* ---------------------------------------------
   EXPORT
---------------------------------------------- */

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div>Caricamento checkout…</div>}>
      <CheckoutPageInner />
    </Suspense>
  )
}