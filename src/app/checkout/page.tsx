"use client"

import React, { useEffect, useState } from "react"
import CheckoutLayout from "@/components/CheckoutLayout"
import Summary from "@/components/Summary"

type CheckoutItem = {
  id: number
  title: string
  variant_title?: string
  quantity: number
  price: number // centesimi
  line_price?: number // centesimi
  image?: string
}

type CartSession = {
  items: CheckoutItem[]
  subtotal: number // centesimi
  total: number // centesimi
  currency: string
}

export default function CheckoutPage() {
  // 🔹 sessionId sempre string ("" = non valido)
  const [sessionId, setSessionId] = useState<string>("")
  const [data, setData] = useState<CartSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Dati form (per step successivo: salvataggio / spedizioni)
  const [email, setEmail] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [address1, setAddress1] = useState("")
  const [city, setCity] = useState("")
  const [zip, setZip] = useState("")
  const [country, setCountry] = useState("IT")

  // 1) Leggo sessionId dall'URL (?sessionId=...)
  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const id = params.get("sessionId")
    if (!id) {
      setError("Nessun carrello trovato.")
      setLoading(false)
      return
    }
    setSessionId(id)
  }, [])

  // 2) Quando ho sessionId, chiamo /api/cart-session
  useEffect(() => {
    if (!sessionId) return

    async function load() {
      try {
        setLoading(true)
        setError(null)

        const res = await fetch(
          `/api/cart-session?sessionId=${encodeURIComponent(sessionId)}`
        )
        const json = await res.json()

        if (!res.ok) {
          throw new Error(json.error || "Errore nel recupero del carrello")
        }

        const cart: CartSession = {
          items: json.items || [],
          subtotal: typeof json.subtotal === "number" ? json.subtotal : 0,
          total: typeof json.total === "number" ? json.total : 0,
          currency: json.currency || "EUR",
        }

        setData(cart)
      } catch (err: any) {
        console.error("[checkout] errore nel load:", err)
        setError(err.message || "Errore sconosciuto")
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [sessionId])

  const currency = (data?.currency || "EUR").toUpperCase()
  const subtotalCents = data?.subtotal ?? 0
  const totalCents = data?.total ?? 0
  const subtotal = subtotalCents / 100
  const total = totalCents / 100

  return (
    <CheckoutLayout>
      <div className="min-h-screen w-full bg-slate-950 text-slate-50">
        {/* Top bar */}
        <header className="w-full border-b border-slate-800/60 bg-gradient-to-r from-slate-950 via-slate-950/95 to-slate-900/90 backdrop-blur-xl">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-sky-500/15 ring-1 ring-sky-500/40">
                <span className="text-xs font-semibold text-sky-300">NF</span>
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                  Secure Checkout
                </span>
                <span className="text-sm font-semibold text-slate-50">
                  Checkout App
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <span className="inline-flex h-6 items-center gap-1 rounded-full bg-emerald-400/10 px-2 ring-1 ring-emerald-400/40">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(74,222,128,0.9)]" />
                <span className="font-medium text-emerald-200">Connessione sicura</span>
              </span>
              <span className="hidden sm:inline text-slate-500">
                Pagamenti crittografati e conformi PCI-DSS
              </span>
            </div>
          </div>
        </header>

        <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 lg:flex-row lg:py-10">
          {/* Colonna sinistra – dati spedizione */}
          <section className="flex-1 space-y-5">
            <div className="rounded-3xl border border-slate-800/80 bg-gradient-to-br from-slate-950 via-slate-950/90 to-slate-900/80 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.9)]">
              <h1 className="text-lg font-semibold text-slate-50 sm:text-xl">
                Completa i dati e paga in modo sicuro.
              </h1>
              <p className="mt-1 text-xs text-slate-400 sm:text-[13px]">
                Inserisci i dati di spedizione. Il pagamento viene elaborato da Stripe:
                i dati della carta non passano mai sui nostri server.
              </p>

              <div className="mt-5 space-y-4">
                {/* Email */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">
                    Email per conferma ordine
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="nome@email.com"
                    className="w-full rounded-2xl border border-slate-800/80 bg-slate-900/60 px-3.5 py-2.5 text-sm text-slate-50 outline-none ring-0 transition focus:border-sky-400/70 focus:bg-slate-900/80"
                  />
                </div>

                {/* Nome / Cognome */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">
                      Nome
                    </label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={e => setFirstName(e.target.value)}
                      className="w-full rounded-2xl border border-slate-800/80 bg-slate-900/60 px-3.5 py-2.5 text-sm text-slate-50 outline-none focus:border-sky-400/70"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">
                      Cognome
                    </label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={e => setLastName(e.target.value)}
                      className="w-full rounded-2xl border border-slate-800/80 bg-slate-900/60 px-3.5 py-2.5 text-sm text-slate-50 outline-none focus:border-sky-400/70"
                    />
                  </div>
                </div>

                {/* Indirizzo */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">
                    Indirizzo
                  </label>
                  <input
                    type="text"
                    value={address1}
                    onChange={e => setAddress1(e.target.value)}
                    placeholder="Via, numero civico"
                    className="w-full rounded-2xl border border-slate-800/80 bg-slate-900/60 px-3.5 py-2.5 text-sm text-slate-50 outline-none focus:border-sky-400/70"
                  />
                </div>

                {/* Città / CAP */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">
                      Città
                    </label>
                    <input
                      type="text"
                      value={city}
                      onChange={e => setCity(e.target.value)}
                      className="w-full rounded-2xl border border-slate-800/80 bg-slate-900/60 px-3.5 py-2.5 text-sm text-slate-50 outline-none focus:border-sky-400/70"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">
                      CAP
                    </label>
                    <input
                      type="text"
                      value={zip}
                      onChange={e => setZip(e.target.value)}
                      className="w-full rounded-2xl border border-slate-800/80 bg-slate-900/60 px-3.5 py-2.5 text-sm text-slate-50 outline-none focus:border-sky-400/70"
                    />
                  </div>
                </div>

                {/* Paese */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">
                    Paese / Regione
                  </label>
                  <select
                    value={country}
                    onChange={e => setCountry(e.target.value)}
                    className="w-full rounded-2xl border border-slate-800/80 bg-slate-900/60 px-3.5 py-2.5 text-sm text-slate-50 outline-none focus:border-sky-400/70"
                  >
                    <option value="IT">Italia</option>
                    <option value="FR">Francia</option>
                    <option value="DE">Germania</option>
                    <option value="ES">Spagna</option>
                    <option value="EU">Altro paese UE</option>
                  </select>
                </div>
              </div>
            </div>
          </section>

          {/* Colonna destra – riepilogo e pagamento */}
          <aside className="w-full lg:w-[360px]">
            <div className="sticky top-4 space-y-4">
              {/* Box articoli */}
              <div className="overflow-hidden rounded-3xl border border-slate-800/80 bg-slate-950/80 p-4 shadow-[0_20px_80px_rgba(15,23,42,0.9)] backdrop-blur-2xl">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-100">
                    Articoli nel carrello
                  </h2>
                  <span className="rounded-full bg-slate-900/80 px-2 py-0.5 text-[11px] text-slate-400">
                    {data?.items?.length || 0} articolo
                    {data && data.items && data.items.length !== 1 ? "i" : ""}
                  </span>
                </div>

                {loading && (
                  <p className="text-xs text-slate-400">Caricamento carrello…</p>
                )}

                {error && (
                  <p className="text-xs text-amber-400">
                    {error}
                  </p>
                )}

                {!loading && !error && data && data.items && data.items.length > 0 && (
                  <div className="space-y-3">
                    {data.items.map((item, idx) => {
                      const linePriceCents =
                        typeof item.line_price === "number" && item.line_price > 0
                          ? item.line_price
                          : item.price * item.quantity

                      const linePrice = linePriceCents / 100
                      const unitPrice = item.price / 100

                      return (
                        <div
                          key={`${item.id}-${idx}`}
                          className="flex gap-3 rounded-2xl bg-slate-900/60 p-2.5"
                        >
                          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-900 ring-1 ring-slate-800/80">
                            {item.image ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={item.image}
                                alt={item.title}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <span className="px-1 text-center text-[10px] text-slate-500">
                                Nessuna immagine
                              </span>
                            )}
                          </div>
                          <div className="flex flex-1 flex-col gap-0.5">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <p className="text-xs font-medium text-slate-100">
                                  {item.title}
                                </p>
                                {item.variant_title && (
                                  <p className="text-[11px] text-slate-400">
                                    {item.variant_title}
                                  </p>
                                )}
                                <p className="mt-0.5 text-[11px] text-slate-500">
                                  {item.quantity}× {unitPrice.toFixed(2)} {currency}
                                </p>
                              </div>
                              <div className="text-right text-xs font-semibold text-slate-100">
                                {linePrice.toFixed(2)} {currency}
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Totali + Summary (Stripe) */}
              <div className="space-y-3 rounded-3xl border border-slate-800/80 bg-gradient-to-b from-slate-950 via-slate-950/95 to-slate-900/85 p-4 shadow-[0_28px_90px_rgba(15,23,42,0.95)]">
                <div className="space-y-1.5 text-sm">
                  <div className="flex items-center justify-between text-[13px] text-slate-300">
                    <span>Subtotale prodotti</span>
                    <span className="font-medium">
                      {subtotal.toFixed(2)} {currency}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[12px] text-slate-400">
                    <span>Spedizione</span>
                    <span>Calcolata dopo</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-slate-800/80 pt-2">
                    <span className="text-[13px] font-semibold text-slate-100">
                      Totale ordine
                    </span>
                    <span className="text-base font-semibold text-slate-50">
                      {total.toFixed(2)} {currency}
                    </span>
                  </div>
                </div>

                <div className="rounded-2xl bg-slate-900/60 px-3 py-2 text-[11px] text-slate-400 ring-1 ring-slate-800/80">
                  Pagamento gestito da Stripe. I dati della tua carta non passano mai
                  sui nostri server.
                </div>

                {sessionId && data && (
                  <Summary sessionId={sessionId} />
                )}

                {!sessionId && (
                  <p className="text-[11px] text-amber-400">
                    Nessun carrello valido. Torna al sito e riprova ad aprire il
                    checkout.
                  </p>
                )}
              </div>
            </div>
          </aside>
        </main>
      </div>
    </CheckoutLayout>
  )
}