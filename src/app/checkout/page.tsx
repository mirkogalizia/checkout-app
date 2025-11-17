// src/app/checkout/page.tsx
"use client"

import React, {
  useEffect,
  useMemo,
  useState,
  ChangeEvent,
  FormEvent,
  Suspense,
} from "react"
import { useSearchParams } from "next/navigation"
import { loadStripe } from "@stripe/stripe-js"
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js"

// Forziamo render dinamico (niente prerender statico che rompe useSearchParams)
export const dynamic = "force-dynamic"

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
  subtotalCents?: number       // subtotale prodotti SENZA sconto
  shippingCents?: number       // eventuale spedizione salvata
  totalCents?: number          // totale prodotti DOPO sconti (quello che vogliamo usare)
  paymentIntentClientSecret?: string
  discountCodes?: { code: string }[]
  rawCart?: any
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

// ------------- COMPONENTE PRINCIPALE DEL CHECKOUT (UI + pagamento) -------------

function CheckoutInner({
  cart,
  sessionId,
  clientSecret,
  setClientSecret,
}: {
  cart: CartSessionResponse
  sessionId: string
  clientSecret: string | null
  setClientSecret: (s: string) => void
}) {
  const stripe = useStripe()
  const elements = useElements()

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

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Spedizione calcolata lato checkout (per ora flat 5,90 quando indirizzo valido)
  const [shippingCents, setShippingCents] = useState<number>(0)

  const currency = (cart.currency || "EUR").toUpperCase()

  // Subtotale lordo (senza sconti)
  const rawSubtotalCents = useMemo(() => {
    if (typeof cart.subtotalCents === "number") return cart.subtotalCents
    // fallback: somma dei prezzi unitari * quantità
    return cart.items.reduce((sum, item) => {
      const unit = item.priceCents ?? item.linePriceCents ?? 0
      return sum + unit * (item.quantity || 1)
    }, 0)
  }, [cart])

  // Subtotale netto prodotti DOPO sconti (questo vogliamo usare per il pagamento)
  const discountedSubtotalCents = useMemo(() => {
    if (typeof cart.totalCents === "number") return cart.totalCents
    // se non c'è totalCents, uso come fallback la somma delle linee scontate
    const sumLines = cart.items.reduce((sum, item) => {
      const line =
        typeof item.linePriceCents === "number"
          ? item.linePriceCents
          : (item.priceCents ?? 0) * (item.quantity || 1)
      return sum + line
    }, 0)
    return sumLines
  }, [cart])

  const discountCents = useMemo(() => {
    const diff = rawSubtotalCents - discountedSubtotalCents
    return diff > 0 ? diff : 0
  }, [rawSubtotalCents, discountedSubtotalCents])

  // Totale da pagare = totale prodotti (doposconto) + spedizione calcolata qui
  const totalToPayCents = discountedSubtotalCents + (shippingCents || 0)

  // ---------------- CALCOLO SPEDIZIONE (per ora flat 5,90) ----------------
  // In futuro qui chiamiamo /api/shipping, ora usiamo flat rate quando l'indirizzo è completo

  useEffect(() => {
    const isAddressValid =
      customer.address1.trim().length > 3 &&
      customer.city.trim().length > 1 &&
      customer.postalCode.trim().length > 2 &&
      customer.province.trim().length > 1 &&
      customer.countryCode.trim().length >= 2

    if (!isAddressValid) {
      setShippingCents(0)
      return
    }

    // 🔹 Logica temporanea: spedizione flat 5,90€
    // (la sostituiamo con /api/shipping quando vuoi)
    setShippingCents(590)
  }, [
    customer.address1,
    customer.city,
    customer.postalCode,
    customer.province,
    customer.countryCode,
  ])

  // ---------- HANDLER FORM ----------

  function handleChange(
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) {
    const { name, value } = e.target
    setCustomer((prev) => ({ ...prev, [name]: value }))
  }

  function isFormValid() {
    return (
      customer.fullName.trim().length > 2 &&
      customer.email.includes("@") &&
      customer.address1.trim().length > 3 &&
      customer.city.trim().length > 1 &&
      customer.postalCode.trim().length > 2 &&
      customer.province.trim().length > 1 &&
      customer.countryCode.trim().length >= 2
    )
  }

  // ---------- CREA PAYMENT INTENT (SOLO QUANDO SERVE) ----------

  async function ensurePaymentIntent(): Promise<string> {
    // se già esiste lo riuso
    if (clientSecret) return clientSecret

    // non ha senso creare PaymentIntent se non abbiamo ancora la spedizione
    if (!shippingCents) {
      throw new Error(
        "Calcolo della spedizione non completato. Attendi un secondo dopo aver inserito l'indirizzo.",
      )
    }

    const res = await fetch("/api/payment-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
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
          countryCode: customer.countryCode || "IT",
        },
      }),
    })

    const data = await res.json()

    if (!res.ok || !data.clientSecret) {
      throw new Error(
        data?.error || "Errore nella creazione del pagamento.",
      )
    }

    setClientSecret(data.clientSecret)
    return data.clientSecret as string
  }

  // ---------- SUBMIT PAGAMENTO ----------

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (!isFormValid()) {
      setError("Compila tutti i campi obbligatori per procedere al pagamento.")
      return
    }

    if (!shippingCents) {
      setError(
        "Stiamo calcolando la spedizione. Attendi un secondo e riprova.",
      )
      return
    }

    if (!stripe || !elements) {
      setError("Stripe non è ancora pronto, riprova tra qualche secondo.")
      return
    }

    try {
      setLoading(true)

      // 1) assicura il PaymentIntent con IMPORTO GIUSTO (prodotti scontati + spedizione)
      await ensurePaymentIntent()

      // 2) conferma il pagamento passando i dati cliente a Stripe
      const { error: stripeError } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          payment_method_data: {
            billing_details: {
              name: customer.fullName,
              email: customer.email,
              phone: customer.phone || undefined,
              address: {
                line1: customer.address1,
                line2: customer.address2 || undefined,
                city: customer.city,
                postal_code: customer.postalCode,
                state: customer.province,
                country: customer.countryCode || "IT",
              },
            },
          },
          shipping: {
            name: customer.fullName,
            phone: customer.phone || undefined,
            address: {
              line1: customer.address1,
              line2: customer.address2 || undefined,
              city: customer.city,
              postal_code: customer.postalCode,
              state: customer.province,
              country: customer.countryCode || "IT",
            },
          },
        },
        redirect: "if_required",
      })

      if (stripeError) {
        console.error("Stripe error:", stripeError)
        setError(stripeError.message || "Pagamento non riuscito.")
        setLoading(false)
        return
      }

      setSuccess(true)
      setLoading(false)
    } catch (err: any) {
      console.error("Errore pagamento:", err)
      setError(err.message || "Errore imprevisto durante il pagamento.")
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex justify-center px-4 py-8">
      <div className="w-full max-w-5xl grid gap-8 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {/* Colonna sinistra: dati spedizione + pagamento */}
        <section className="space-y-6">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-[0.18em]">
              Checkout
            </p>
            <h1 className="mt-2 text-2xl md:text-3xl font-semibold">
              Completa i dati di spedizione e paga in modo sicuro.
            </h1>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Dati di spedizione */}
            <div className="glass-card space-y-4 p-5 md:p-6">
              <h2 className="text-sm font-semibold text-slate-100">
                Dati di spedizione
              </h2>
              <p className="text-xs text-slate-400">
                La spedizione verrà aggiunta automaticamente dopo aver inserito
                tutti i dati obbligatori.
              </p>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="glass-label">Nome completo</label>
                  <input
                    name="fullName"
                    value={customer.fullName}
                    onChange={handleChange}
                    className="glass-input"
                    placeholder="Nome e cognome"
                    required
                  />
                </div>

                <div>
                  <label className="glass-label">Email</label>
                  <input
                    type="email"
                    name="email"
                    value={customer.email}
                    onChange={handleChange}
                    className="glass-input"
                    placeholder="nome@email.com"
                    required
                  />
                </div>

                <div>
                  <label className="glass-label">Telefono</label>
                  <input
                    name="phone"
                    value={customer.phone}
                    onChange={handleChange}
                    className="glass-input"
                    placeholder="+39 ..."
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="glass-label">Indirizzo</label>
                  <input
                    name="address1"
                    value={customer.address1}
                    onChange={handleChange}
                    className="glass-input"
                    placeholder="Via, numero civico"
                    required
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="glass-label">
                    Complemento (scala, interno) — opzionale
                  </label>
                  <input
                    name="address2"
                    value={customer.address2}
                    onChange={handleChange}
                    className="glass-input"
                    placeholder="Interno, scala, c/o..."
                  />
                </div>

                <div>
                  <label className="glass-label">Città</label>
                  <input
                    name="city"
                    value={customer.city}
                    onChange={handleChange}
                    className="glass-input"
                    placeholder="Città"
                    required
                  />
                </div>

                <div>
                  <label className="glass-label">CAP</label>
                  <input
                    name="postalCode"
                    value={customer.postalCode}
                    onChange={handleChange}
                    className="glass-input"
                    placeholder="CAP"
                    required
                  />
                </div>

                <div>
                  <label className="glass-label">Provincia</label>
                  <input
                    name="province"
                    value={customer.province}
                    onChange={handleChange}
                    className="glass-input"
                    placeholder="MO"
                    required
                  />
                </div>

                <div>
                  <label className="glass-label">Paese</label>
                  <input
                    name="countryCode"
                    value={customer.countryCode}
                    onChange={handleChange}
                    className="glass-input"
                    placeholder="IT"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Pagamento con carta */}
            <div className="glass-card space-y-4 p-5 md:p-6">
              <h2 className="text-sm font-semibold text-slate-100">
                Pagamento con carta
              </h2>
              <p className="text-xs text-slate-400">
                Tutte le transazioni sono sicure.
              </p>

              {!clientSecret && (
                <p className="text-xs text-amber-300/90 bg-amber-900/30 border border-amber-500/30 rounded-xl px-3 py-2">
                  Inserisci i dati di spedizione: l’importo totale sarà
                  calcolato e il pagamento verrà inizializzato automaticamente.
                </p>
              )}

              {clientSecret && (
                <div className="border border-white/10 rounded-2xl p-3 bg-slate-900/60">
                  <PaymentElement
                    options={{
                      layout: "tabs",
                    }}
                  />
                </div>
              )}

              <button
                type="submit"
                className="glass-button-primary w-full mt-2"
                disabled={
                  loading || !stripe || !elements || !isFormValid()
                }
              >
                {loading
                  ? "Elaborazione in corso…"
                  : `Paga ${formatMoney(totalToPayCents, currency)}`}
              </button>

              {error && (
                <p className="text-xs text-rose-300 bg-rose-950/50 border border-rose-700/40 rounded-xl px-3 py-2">
                  {error}
                </p>
              )}

              {success && (
                <p className="text-xs text-emerald-300 bg-emerald-950/40 border border-emerald-700/40 rounded-xl px-3 py-2">
                  Pagamento riuscito. Stiamo creando il tuo ordine su Shopify.
                </p>
              )}
            </div>
          </form>
        </section>

        {/* Colonna destra: riepilogo ordine */}
        <aside className="space-y-4">
          <div className="glass-card p-5 md:p-6 space-y-4">
            <h2 className="text-sm font-semibold text-slate-100">
              Articoli nel carrello
            </h2>
            <p className="text-xs text-slate-400">
              ({cart.items.length} articolo
              {cart.items.length !== 1 ? "i" : ""})
            </p>

            <div className="space-y-4">
              {cart.items.map((item, idx) => {
                const baseUnit =
                  typeof item.priceCents === "number"
                    ? item.priceCents
                    : item.linePriceCents ?? 0

                const line =
                  typeof item.linePriceCents === "number"
                    ? item.linePriceCents
                    : baseUnit * item.quantity

                const fullLine = baseUnit * item.quantity
                const diff = fullLine - line
                const hasDiscount = diff > 0

                return (
                  <div
                    key={`${item.id}-${idx}`}
                    className="flex gap-3 items-start"
                  >
                    {item.image && (
                      <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-slate-900/70 border border-white/10 flex-shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.image}
                          alt={item.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    <div className="flex-1 space-y-1">
                      <p className="text-xs font-medium text-slate-100">
                        {item.title}
                      </p>
                      {item.variantTitle && (
                        <p className="text-[11px] text-slate-400">
                          {item.variantTitle}
                        </p>
                      )}
                      <p className="text-[11px] text-slate-400">
                        {item.quantity}×{" "}
                        {formatMoney(baseUnit, currency)}
                      </p>

                      <div className="flex items-center gap-2">
                        <p className="text-xs font-semibold">
                          {formatMoney(line, currency)}
                        </p>
                        {hasDiscount && (
                          <span className="text-[11px] text-emerald-300">
                            Risparmi {formatMoney(diff, currency)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="glass-card p-5 md:p-6 space-y-3">
            <h2 className="text-sm font-semibold text-slate-100">
              Riepilogo ordine
            </h2>

            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">
                  Subtotale prodotti
                </span>
                <span className="text-slate-100">
                  {formatMoney(rawSubtotalCents, currency)}
                </span>
              </div>

              {discountCents > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Sconto</span>
                  <span className="text-emerald-300">
                    −{formatMoney(discountCents, currency)}
                  </span>
                </div>
              )}

              <div className="flex justify-between">
                <span className="text-slate-400">Subtotale</span>
                <span className="text-slate-100">
                  {formatMoney(discountedSubtotalCents, currency)}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-400">Spedizione</span>
                <span className="text-slate-100">
                  {shippingCents > 0
                    ? formatMoney(shippingCents, currency)
                    : "Da calcolare"}
                </span>
              </div>
            </div>

            {shippingCents > 0 && (
              <p className="text-[11px] text-slate-400 mt-1">
                Spedizione Standard 24/48h
                <br />
                Consegna stimata in 24/48h in tutta Italia.
              </p>
            )}

            <div className="border-t border-white/10 mt-3 pt-3 flex justify-between items-baseline">
              <span className="text-xs text-slate-400">Totale</span>
              <span className="text-lg font-semibold text-slate-50">
                {formatMoney(totalToPayCents, currency)}
              </span>
            </div>

            <p className="text-[11px] text-slate-500 mt-1">
              Inserisci i dati di spedizione per attivare il pagamento.
            </p>
          </div>
        </aside>
      </div>
    </main>
  )
}

// ---------- WRAPPER CON FETCH CARRELLO + ELEMENTS ----------

function CheckoutPageContent() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get("sessionId") || ""

  const [cart, setCart] = useState<CartSessionResponse | null>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      if (!sessionId) {
        setError("Sessione non valida: manca il sessionId.")
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError(null)

        // 1) Recupera sessione carrello
        const res = await fetch(
          `/api/cart-session?sessionId=${encodeURIComponent(sessionId)}`,
        )
        const data: CartSessionResponse & { error?: string } =
          await res.json()

        if (!res.ok || (data as any).error) {
          setError(
            data.error ||
              "Errore nel recupero del carrello. Riprova dal sito.",
          )
          setLoading(false)
          return
        }

        setCart(data)

        // 2) Se esiste già un PaymentIntent (es. retry), riusa il clientSecret
        if (data.paymentIntentClientSecret) {
          setClientSecret(data.paymentIntentClientSecret)
        }

        setLoading(false)
      } catch (err: any) {
        console.error("Errore checkout:", err)
        setError(
          err?.message || "Errore imprevisto nel caricamento del checkout.",
        )
        setLoading(false)
      }
    }

    load()
  }, [sessionId])

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
        <p className="text-sm text-slate-300">
          Caricamento del checkout in corso…
        </p>
      </main>
    )
  }

  if (error || !cart) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-lg font-semibold">
            Impossibile caricare il checkout
          </h1>
          <p className="text-sm text-slate-400">{error}</p>
          <p className="text-xs text-slate-500">
            Ritorna al sito e riprova ad aprire il checkout.
          </p>
        </div>
      </main>
    )
  }

  if (!clientSecret) {
    // Nessun PaymentIntent ancora → lo creeremo al submit (ensurePaymentIntent)
  }

  const options = clientSecret
    ? {
        clientSecret,
        appearance: {
          theme: "night" as const,
          variables: {
            colorPrimary: "#22c55e",
          },
        },
      }
    : undefined

  if (!options) {
    // Mostra comunque la pagina, ma PaymentElement verrà attivato dopo il primo PaymentIntent
    return (
      <CheckoutInner
        cart={cart}
        sessionId={sessionId}
        clientSecret={clientSecret}
        setClientSecret={setClientSecret}
      />
    )
  }

  return (
    <Elements stripe={stripePromise} options={options}>
      <CheckoutInner
        cart={cart}
        sessionId={sessionId}
        clientSecret={clientSecret}
        setClientSecret={setClientSecret}
      />
    </Elements>
  )
}

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
          <p className="text-sm text-slate-300">
            Caricamento del checkout…
          </p>
        </main>
      }
    >
      <CheckoutPageContent />
    </Suspense>
  )
}