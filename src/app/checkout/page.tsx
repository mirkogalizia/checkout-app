"use client"

import {
  useEffect,
  useState,
  Suspense,
} from "react"
import { useSearchParams } from "next/navigation"
import {
  loadStripe,
} from "@stripe/stripe-js"
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js"

// ---------------------------------------------
// Stripe publishable key (pk_live / pk_test)
// ---------------------------------------------
const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,
)

type CheckoutItem = {
  id: number | string
  title: string
  variantTitle?: string
  quantity: number
  priceCents: number
  linePriceCents: number
  image?: string
}

type Customer = {
  email: string
  fullName: string
  address1: string
  address2?: string
  city: string
  province: string
  zip: string
  country: string
}

// ---------------------------------------------
// WRAPPER CON SUSPENSE
// ---------------------------------------------
function CheckoutPageInner() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get("sessionId")

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [items, setItems] = useState<CheckoutItem[]>([])
  const [currency, setCurrency] = useState("EUR")

  const [subtotal, setSubtotal] = useState(0)
  const [shippingAmount, setShippingAmount] = useState(0)
  const [total, setTotal] = useState(0)

  const [clientSecret, setClientSecret] = useState<string | null>(null)

  // dati cliente (spedizione)
  const [customer, setCustomer] = useState<Customer>({
    email: "",
    fullName: "",
    address1: "",
    address2: "",
    city: "",
    province: "",
    zip: "",
    country: "IT",
  })

  // ---------------------------------------------
  // Cambio campi cliente
  // ---------------------------------------------
  function handleCustomerChange(
    field: keyof Customer,
    value: string,
  ) {
    setCustomer(prev => ({
      ...prev,
      [field]: value,
    }))
  }

  // ---------------------------------------------
  // Carica carrello + clientSecret in UNA chiamata
  // ---------------------------------------------
  useEffect(() => {
    async function load() {
      if (!sessionId) {
        setError("Nessuna sessione di checkout trovata.")
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError(null)

        const res = await fetch(
          `/api/cart-session?sessionId=${encodeURIComponent(sessionId)}`,
        )
        const data = await res.json()

        if (!res.ok) {
          setError(data.error || "Errore nel recupero del carrello")
          setLoading(false)
          return
        }

        const items: CheckoutItem[] = data.items || []
        const currency = data.currency || "EUR"
        const subtotalCents = Number(data.subtotalCents || 0)
        const shippingCents = Number(data.shippingCents || 0)
        const totalCents =
          data.totalCents != null
            ? Number(data.totalCents)
            : subtotalCents + shippingCents

        setItems(items)
        setCurrency(currency)
        setSubtotal(subtotalCents / 100)
        setShippingAmount(shippingCents / 100)
        setTotal(totalCents / 100)

        setClientSecret(
          typeof data.paymentIntentClientSecret === "string"
            ? data.paymentIntentClientSecret
            : null,
        )
      } catch (err) {
        console.error(err)
        setError("Errore nel caricamento del carrello")
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [sessionId])

  // ---------------------------------------------
  // Calcolo spedizione fissa 5,90€ (se vuoi API -> /api/shipping)
  // ---------------------------------------------
  async function handleCalcShipping() {
    // qui puoi attaccarti alla tua /api/shipping
    const shipping = 5.9
    setShippingAmount(shipping)
    setTotal(subtotal + shipping)
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white text-gray-900">
        Caricamento checkout…
      </main>
    )
  }

  if (error || !sessionId) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white text-gray-900">
        <div className="border border-red-200 bg-red-50 rounded-2xl px-6 py-4 max-w-md text-center">
          <h1 className="text-lg font-semibold mb-2">
            Errore checkout
          </h1>
          <p className="text-sm opacity-90 mb-4">
            {error ||
              "Si è verificato un problema nel recupero del carrello."}
          </p>
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
    (acc, it) => acc + Number(it.quantity || 0),
    0,
  )

  const totalFormatted = `${total.toFixed(2)} ${currency}`

  return (
    <main className="min-h-screen bg-[#f5f5f5] text-gray-900 flex items-start justify-center px-4 py-10">
      <div className="w-full max-w-5xl grid gap-8 md:grid-cols-[minmax(0,2.1fr)_minmax(0,1.4fr)]">

        {/* COLONNA SINISTRA – dati cliente */}
        <section className="bg-white border border-gray-200 rounded-3xl p-6 md:p-8 shadow-sm">
          <header className="mb-6">
            <h1 className="text-2xl font-semibold">
              Checkout
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Completa i dati e paga in modo sicuro.
            </p>
          </header>

          {/* CONTATTI */}
          <div className="mb-8 space-y-3">
            <h2 className="text-sm font-semibold uppercase text-gray-800">
              Contatti
            </h2>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Email
              </label>
              <input
                type="email"
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
                value={customer.email}
                onChange={e =>
                  handleCustomerChange("email", e.target.value)
                }
                placeholder="tuoindirizzo@email.com"
              />
            </div>
          </div>

          {/* CONSEGNA */}
          <div className="mb-8 space-y-4">
            <h2 className="text-sm font-semibold uppercase text-gray-800">
              Consegna
            </h2>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Nome completo
              </label>
              <input
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
                value={customer.fullName}
                onChange={e =>
                  handleCustomerChange("fullName", e.target.value)
                }
                placeholder="Es. Mario Rossi"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Indirizzo
              </label>
              <input
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
                value={customer.address1}
                onChange={e =>
                  handleCustomerChange("address1", e.target.value)
                }
                placeholder="Via, numero civico"
              />
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  CAP
                </label>
                <input
                  className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
                  value={customer.zip}
                  onChange={e =>
                    handleCustomerChange("zip", e.target.value)
                  }
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Città
                </label>
                <input
                  className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
                  value={customer.city}
                  onChange={e =>
                    handleCustomerChange("city", e.target.value)
                  }
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Provincia
                </label>
                <input
                  className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
                  value={customer.province}
                  onChange={e =>
                    handleCustomerChange("province", e.target.value)
                  }
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-end">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Paese / Regione
                </label>
                <input
                  className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
                  value={customer.country}
                  onChange={e =>
                    handleCustomerChange("country", e.target.value)
                  }
                />
              </div>
              <button
                type="button"
                onClick={handleCalcShipping}
                className="inline-flex items-center justify-center rounded-xl bg-black text-white text-sm font-medium px-4 py-2.5 hover:bg-gray-900 transition"
              >
                Calcola spedizione
              </button>
            </div>
          </div>

          {/* ARTICOLI */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold uppercase text-gray-800">
              Articoli nel carrello ({itemsCount})
            </h2>

            {items.map((item, idx) => {
              const linePrice = Number(item.linePriceCents || 0) / 100
              const unitPrice = Number(item.priceCents || 0) / 100

              return (
                <div
                  key={idx}
                  className="flex justify-between items-start p-3 bg-gray-50 border border-gray-200 rounded-2xl"
                >
                  <div>
                    <div className="text-sm font-medium">
                      {item.title}
                    </div>
                    {item.variantTitle && (
                      <div className="text-xs text-gray-500">
                        {item.variantTitle}
                      </div>
                    )}
                    <div className="text-xs text-gray-500 mt-1">
                      {item.quantity}×{" "}
                      {unitPrice.toFixed(2)} {currency}
                    </div>
                  </div>

                  <div className="text-sm font-semibold">
                    {linePrice.toFixed(2)} {currency}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* COLONNA DESTRA – riepilogo + pagamento */}
        <section className="bg-white border border-gray-200 rounded-3xl p-6 md:p-8 shadow-sm flex flex-col gap-6">
          <div>
            <h2 className="text-sm font-semibold uppercase text-gray-800 mb-4">
              Totale ordine
            </h2>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Subtotale</span>
                <span>
                  {subtotal.toFixed(2)} {currency}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-gray-600">Spedizione</span>
                <span>
                  {shippingAmount > 0
                    ? `${shippingAmount.toFixed(2)} ${currency}`
                    : "Calcolata dopo"}
                </span>
              </div>

              <div className="border-t border-gray-200 pt-3 flex justify-between text-base">
                <span className="font-semibold text-gray-900">
                  Totale
                </span>
                <span className="font-semibold text-lg">
                  {totalFormatted}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold flex items-center justify-between">
              <span>Pagamento con carta</span>
              <span className="text-xs text-gray-500">
                Tutte le transazioni sono sicure.
              </span>
            </h3>

            <PaymentBox
              clientSecret={clientSecret}
              sessionId={sessionId}
              customer={customer}
              totalFormatted={totalFormatted}
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
        Preparazione del pagamento in corso…
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
        borderRadius: "8px",
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
      cardholderName.trim() || customer.fullName.trim() || ""

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          payment_method_data: {
            billing_details: {
              name: fullName || undefined,
              email: customer.email || undefined,
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
          // se vuoi redirect di successo lato Stripe:
          // return_url: `${window.location.origin}/thank-you?sessionId=${encodeURIComponent(sessionId)}`,
        },
        redirect: "if_required",
      } as any)

      if (error) {
        console.error(error)
        setError(error.message || "Errore durante il pagamento")
        setPaying(false)
        return
      }

      if (paymentIntent && paymentIntent.status === "succeeded") {
        try {
          // puoi creare ordine Shopify qui (API tua privata)
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
      {/* Nome sull'intestatario sopra al box carta */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1.5">
          Nome completo sull&apos;intestatario della carta
        </label>
        <input
          type="text"
          value={cardholderName}
          onChange={e => setCardholderName(e.target.value)}
          className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-black focus:ring-2 focus:ring-black"
          placeholder="Es. Mario Rossi"
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
        I pagamenti sono elaborati in modo sicuro da Stripe. I dati
        della carta non passano mai sui nostri server.
      </p>
    </div>
  )
}

// wrapper con Suspense (Next 13+)
export default function CheckoutPage() {
  return (
    <Suspense fallback={<div>Caricamento checkout…</div>}>
      <CheckoutPageInner />
    </Suspense>
  )
}