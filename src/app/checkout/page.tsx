// src/app/checkout/page.tsx
"use client"

import {
  useEffect,
  useState,
  Suspense,
  FormEvent,
} from "react"
import { useSearchParams } from "next/navigation"
import { loadStripe } from "@stripe/stripe-js"
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js"

type CheckoutItem = {
  id: string | number
  title: string
  variantTitle?: string
  quantity: number
  priceCents: number
  linePriceCents: number
  image?: string
}

type RawCart = {
  total_discount?: number
  discount_codes?: { code: string; amount: number }[]
  // altri campi non tipizzati
  [key: string]: any
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

const stripePublicKey =
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ""
const stripePromise = loadStripe(stripePublicKey)

/* ---------------------------------------------
   COMPONENTE PRINCIPALE (WRAPPER SUSPENSE)
---------------------------------------------- */

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-700">Caricamento checkout…</div>}>
      <CheckoutPageInner />
    </Suspense>
  )
}

/* ---------------------------------------------
   LOGICA CHECKOUT
---------------------------------------------- */

function CheckoutPageInner() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get("sessionId") || ""

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [items, setItems] = useState<CheckoutItem[]>([])
  const [currency, setCurrency] = useState("EUR")

  const [subtotal, setSubtotal] = useState(0) // netto (dopo sconto)
  const [discount, setDiscount] = useState(0)
  const [shippingAmount, setShippingAmount] = useState(0)
  const [total, setTotal] = useState(0)

  const [rawCart, setRawCart] = useState<RawCart | null>(null)

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

  const [hasShippingApplied, setHasShippingApplied] = useState(false)

  // ------------ helper UI ------------

  function formatMoney(amount: number) {
    return `${amount.toFixed(2)} ${currency}`
  }

  function onCustomerChange<K extends keyof Customer>(
    field: K,
    value: Customer[K],
  ) {
    setCustomer(prev => ({ ...prev, [field]: value }))
  }

  function isAddressComplete(c: Customer) {
    return (
      c.firstName.trim() &&
      c.lastName.trim() &&
      c.email.trim() &&
      c.address1.trim() &&
      c.city.trim() &&
      c.zip.trim() &&
      c.province.trim() &&
      c.country.trim()
    )
  }

  /* ---------------------------------------------
     1) CARICA CARRELLO DA /api/cart-session
  ---------------------------------------------- */

  useEffect(() => {
    if (!sessionId) {
      setError("Sessione di checkout non trovata.")
      setLoading(false)
      return
    }

    async function loadCart() {
      try {
        setLoading(true)
        const res = await fetch(
          `/api/cart-session?sessionId=${encodeURIComponent(
            sessionId,
          )}`,
          { cache: "no-store" },
        )

        const data = await res.json()

        if (!res.ok) {
          setError(
            data.error || "Errore nel recupero del carrello.",
          )
          setLoading(false)
          return
        }

        const items = (data.items || []) as CheckoutItem[]
        const curr = (data.currency || "EUR").toString().toUpperCase()

        const subtotalCents =
          typeof data.subtotalCents === "number"
            ? data.subtotalCents
            : typeof data.totals?.subtotal === "number"
            ? data.totals.subtotal
            : 0

        const shippingCents =
          typeof data.shippingCents === "number"
            ? data.shippingCents
            : 0

        const totalCents =
          typeof data.totalCents === "number"
            ? data.totalCents
            : subtotalCents + shippingCents

        const raw = (data.rawCart || null) as RawCart | null
        const discountCents =
          typeof raw?.total_discount === "number"
            ? raw.total_discount
            : typeof data.discountCents === "number"
            ? data.discountCents
            : 0

        setItems(items)
        setCurrency(curr)
        setSubtotal(subtotalCents / 100)
        setShippingAmount(shippingCents / 100)
        setTotal(totalCents / 100)
        setDiscount(discountCents / 100)
        setRawCart(raw)

        // se c'è già spedizione salvata lato server, segna flag
        if (shippingCents > 0) {
          setHasShippingApplied(true)
        }

        setError(null)
      } catch (err) {
        console.error(err)
        setError("Errore nel caricamento del carrello.")
      } finally {
        setLoading(false)
      }
    }

    loadCart()
  }, [sessionId])

  /* ---------------------------------------------
     2) APPlica SPEDIZIONE 5,90€ quando indirizzo completo
     + aggiorna totale e server
  ---------------------------------------------- */

  useEffect(() => {
    if (!sessionId || hasShippingApplied) return
    if (!isAddressComplete(customer)) return

    // appena indirizzo completo, applica 5,90€
    const shipping = 5.9
    setShippingAmount(shipping)
    setTotal(prev => prev + shipping)
    setHasShippingApplied(true)

    // opzionale: aggiorna Firestore lato server
    ;(async () => {
      try {
        await fetch("/api/cart-session/shipping", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            shippingCents: Math.round(shipping * 100),
          }),
        })
      } catch (e) {
        console.warn("Impossibile aggiornare la spedizione lato server", e)
      }
    })()
  }, [customer, sessionId, hasShippingApplied])

  /* ---------------------------------------------
     3) CREA PAYMENT INTENT quando abbiamo totale e indirizzo
  ---------------------------------------------- */

  useEffect(() => {
    if (!sessionId) return
    if (!isAddressComplete(customer)) return

    async function createPaymentIntent() {
      try {
        const res = await fetch("/api/payment-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            shippingCents: Math.round(shippingAmount * 100),
          }),
        })

        const data = await res.json()

        if (!res.ok) {
          console.error(data)
          setError(
            data.error ||
              "Errore nella preparazione del pagamento.",
          )
          return
        }

        setClientSecret(data.clientSecret)
      } catch (e) {
        console.error(e)
        setError("Errore nella preparazione del pagamento.")
      }
    }

    createPaymentIntent()
  }, [sessionId, shippingAmount, customer])

  /* ---------------------------------------------
     RENDER: stati base
  ---------------------------------------------- */

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white text-gray-700">
        Caricamento checkout…
      </main>
    )
  }

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white text-gray-800">
        <div className="max-w-md w-full border border-red-200 bg-red-50 rounded-2xl p-6 text-center">
          <h1 className="text-lg font-semibold mb-2">
            Errore nel checkout
          </h1>
          <p className="text-sm mb-4">{error}</p>
          <a
            href="/"
            className="inline-flex items-center justify-center px-4 py-2 rounded-full bg-black text-white text-sm font-medium"
          >
            Torna allo shop
          </a>
        </div>
      </main>
    )
  }

  const itemsCount = items.reduce(
    (sum, it) => sum + Number(it.quantity || 0),
    0,
  )

  const couponCode =
    rawCart?.discount_codes && rawCart.discount_codes.length > 0
      ? rawCart.discount_codes[0].code
      : null

  return (
    <main className="min-h-screen bg-white text-gray-900">
      <div className="mx-auto max-w-6xl px-4 py-6 md:py-10">
        {/* LOGO */}
        <header className="flex flex-col items-center mb-8">
          <a href="/" className="inline-flex items-center gap-2">
            <img
              src="https://cdn.shopify.com/s/files/1/0899/2188/0330/files/logo_checkify_d8a640c7-98fe-4943-85c6-5d1a633416cf.png?v=1761832152"
              alt="NOT FOR RESALE"
              className="h-10 md:h-12 w-auto"
            />
          </a>
        </header>

        {/* GRID PRINCIPALE */}
        <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)]">
          {/* COLONNA SINISTRA – DATI + CARRELLO */}
          <section className="space-y-8">
            <div>
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
                Checkout
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Completa i dati di spedizione e paga in modo sicuro.
              </p>
            </div>

            {/* DATI DI SPEDIZIONE */}
            <form
              className="space-y-5"
              onSubmit={(e: FormEvent) => e.preventDefault()}
            >
              <div className="space-y-2">
                <h2 className="text-xs font-semibold tracking-wide text-gray-600 uppercase">
                  Dati di spedizione
                </h2>

                <div className="grid gap-3 md:grid-cols-2">
                  <Input
                    label="Nome"
                    value={customer.firstName}
                    onChange={v => onCustomerChange("firstName", v)}
                  />
                  <Input
                    label="Cognome"
                    value={customer.lastName}
                    onChange={v => onCustomerChange("lastName", v)}
                  />
                </div>

                <Input
                  label="Email"
                  type="email"
                  value={customer.email}
                  onChange={v => onCustomerChange("email", v)}
                />

                <Input
                  label="Telefono (per il corriere)"
                  value={customer.phone}
                  onChange={v => onCustomerChange("phone", v)}
                />

                <Input
                  label="Indirizzo"
                  placeholder="Via, numero civico"
                  value={customer.address1}
                  onChange={v => onCustomerChange("address1", v)}
                />

                <Input
                  label="Interno, scala, citofono (opzionale)"
                  value={customer.address2}
                  onChange={v => onCustomerChange("address2", v)}
                />

                <div className="grid gap-3 md:grid-cols-3">
                  <Input
                    label="CAP"
                    value={customer.zip}
                    onChange={v => onCustomerChange("zip", v)}
                  />
                  <Input
                    label="Città"
                    value={customer.city}
                    onChange={v => onCustomerChange("city", v)}
                  />
                  <Input
                    label="Provincia"
                    value={customer.province}
                    onChange={v => onCustomerChange("province", v)}
                    placeholder="Es. MI"
                  />
                </div>

                <Input
                  label="Paese"
                  value={customer.country}
                  onChange={v => onCustomerChange("country", v)}
                />

                <p className="text-[11px] text-gray-500 mt-1">
                  La spedizione verrà aggiunta automaticamente dopo aver
                  inserito tutti i dati obbligatori.
                </p>
              </div>
            </form>

            {/* ARTICOLI NEL CARRELLO */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold tracking-wide text-gray-600 uppercase">
                  Articoli nel carrello ({itemsCount})
                </h2>
              </div>

              <div className="space-y-3">
                {items.map((item, idx) => {
                  const qty = Number(item.quantity || 0)
                  const unitFull = (item.priceCents || 0) / 100
                  const lineActual = (item.linePriceCents || 0) / 100
                  const unitActual =
                    qty > 0 ? lineActual / qty : unitFull
                  const lineFull = unitFull * qty
                  const lineDiscount = Math.max(
                    0,
                    lineFull - lineActual,
                  )

                  return (
                    <div
                      key={idx}
                      className="flex gap-3 rounded-2xl border border-gray-200 bg-white px-3 py-3 shadow-sm"
                    >
                      {item.image && (
                        <div className="flex-shrink-0">
                          <img
                            src={item.image}
                            alt={item.title}
                            className="h-16 w-16 rounded-xl object-cover border border-gray-200"
                          />
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {item.title}
                            </p>
                            {item.variantTitle && (
                              <p className="text-xs text-gray-500">
                                {item.variantTitle}
                              </p>
                            )}
                            <p className="mt-1 text-xs text-gray-500">
                              {qty}×{" "}
                              {lineDiscount > 0 ? (
                                <>
                                  <span className="line-through text-gray-400 mr-1">
                                    {unitFull.toFixed(2)} {currency}
                                  </span>
                                  <span className="font-medium">
                                    {unitActual.toFixed(2)} {currency}
                                  </span>
                                </>
                              ) : (
                                <>
                                  {unitFull.toFixed(2)} {currency}
                                </>
                              )}
                            </p>
                            {lineDiscount > 0 && (
                              <p className="text-[11px] text-emerald-600 mt-0.5">
                                Risparmi{" "}
                                {lineDiscount.toFixed(2)} {currency}
                              </p>
                            )}
                          </div>

                          <div className="text-right text-sm font-semibold whitespace-nowrap">
                            {lineActual.toFixed(2)} {currency}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>

          {/* COLONNA DESTRA – RIEPILOGO + PAGAMENTO */}
          <section className="space-y-6">
            {/* RIEPILOGO */}
            <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
                  Riepilogo ordine
                </h2>
              </div>

              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-600">Subtotale prodotti</dt>
                  <dd>{formatMoney(subtotal + discount)}</dd>
                </div>

                {discount > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-gray-600">
                      Sconto
                      {couponCode ? ` (${couponCode})` : ""}
                    </dt>
                    <dd className="text-emerald-600">
                      −{formatMoney(discount)}
                    </dd>
                  </div>
                )}

                <div className="flex justify-between">
                  <dt className="text-gray-600">Spedizione</dt>
                  <dd>
                    {shippingAmount > 0
                      ? formatMoney(shippingAmount)
                      : "Verrà calcolata dopo l'indirizzo"}
                  </dd>
                </div>

                <div className="border-t border-gray-200 pt-3 flex justify-between text-base">
                  <dt className="font-semibold">Totale</dt>
                  <dd className="font-semibold">
                    {formatMoney(total)}
                  </dd>
                </div>
              </dl>

              {shippingAmount > 0 && (
                <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                  <p className="text-xs font-medium text-gray-800">
                    Spedizione Standard 24/48h
                  </p>
                  <p className="text-[11px] text-gray-500">
                    Consegna stimata in 24/48h in tutta Italia.
                  </p>
                </div>
              )}
            </div>

            {/* PAGAMENTO STRIPE */}
            <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
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
                totalFormatted={formatMoney(total)}
              />
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}

/* ---------------------------------------------
   INPUT COMPONENT (UI coerente)
---------------------------------------------- */

function Input({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  placeholder?: string
}) {
  return (
    <label className="block text-sm">
      <span className="block text-xs font-medium text-gray-700 mb-1">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-black focus:ring-2 focus:ring-black transition"
      />
    </label>
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
        Inserisci prima i dati di spedizione per procedere al
        pagamento.
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
      const { error, paymentIntent } = (await stripe.confirmPayment(
        {
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
        } as any,
      )) as any

      if (error) {
        console.error(error)
        setError(error.message || "Errore durante il pagamento.")
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
        err?.message || "Errore imprevisto durante il pagamento.",
      )
      setPaying(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Nome sull'intestatario sopra al box carta */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1.5">
          Nome completo sull&apos;intestatario della carta
        </label>
        <input
          type="text"
          value={cardholderName}
          onChange={e => setCardholderName(e.target.value)}
          className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-black focus:ring-2 focus:ring-black transition"
          placeholder="Es. Mario Rossi"
        />
      </div>

      {/* BOX CARTA con bordo ben visibile */}
      <div className="rounded-2xl border border-gray-300 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.06)] px-4 py-5">
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
        I pagamenti sono elaborati in modo sicuro da Stripe. I dati
        della carta non passano mai sui nostri server.
      </p>
    </div>
  )
}