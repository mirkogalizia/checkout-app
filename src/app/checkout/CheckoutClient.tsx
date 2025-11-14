// src/app/checkout/CheckoutClient.tsx
"use client"

import React, { useEffect, useState } from "react"
import Summary from "@/components/Summary"

type CheckoutItem = {
  id: number | string
  title: string
  variantTitle?: string
  quantity: number
  priceCents: number
  linePriceCents: number
  image?: string
}

type CheckoutSessionData = {
  sessionId: string
  currency: string
  items: CheckoutItem[]
  subtotalCents: number
  shippingCents: number
  totalCents: number
}

type Props = {
  initialSessionId: string
}

export default function CheckoutClient({ initialSessionId }: Props) {
  const [loading, setLoading] = useState(true)
  const [sessionData, setSessionData] = useState<CheckoutSessionData | null>(
    null,
  )
  const [error, setError] = useState<string | null>(null)

  // Campi form (per ora solo UI; poi li potremo salvare in Firestore / mandare a Shopify)
  const [email, setEmail] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [address, setAddress] = useState("")
  const [city, setCity] = useState("")
  const [zip, setZip] = useState("")
  const [country, setCountry] = useState("IT")

  useEffect(() => {
    async function load() {
      if (!initialSessionId) {
        setError("Nessun carrello associato alla sessione.")
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError(null)

        const res = await fetch(
          `/api/cart-session?sessionId=${encodeURIComponent(initialSessionId)}`,
        )
        const json = await res.json()

        if (!res.ok) {
          throw new Error(json.error || "Errore nel recupero del carrello")
        }

        // Normalizziamo i numeri per sicurezza
        const subtotalCents =
          typeof json.subtotalCents === "number" ? json.subtotalCents : 0
        const shippingCents =
          typeof json.shippingCents === "number" ? json.shippingCents : 0
        const totalCents =
          typeof json.totalCents === "number"
            ? json.totalCents
            : subtotalCents + shippingCents

        const currency = (json.currency || "EUR").toString().toUpperCase()

        setSessionData({
          sessionId: json.sessionId,
          currency,
          items: Array.isArray(json.items) ? json.items : [],
          subtotalCents,
          shippingCents,
          totalCents,
        })
      } catch (err: any) {
        console.error("[CheckoutClient] errore load:", err)
        setError(err.message || "Errore nel caricamento del carrello")
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [initialSessionId])

  if (!initialSessionId) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <h1 className="text-xl font-semibold">Sessione non valida</h1>
          <p className="text-sm text-slate-400">
            Non è stato trovato alcun carrello collegato a questo link. Torna
            al negozio e riprova ad aprire il checkout.
          </p>
        </div>
      </main>
    )
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-3">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-900/70 border border-slate-700/70">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
          </div>
          <p className="text-sm text-slate-300">Caricamento del carrello…</p>
        </div>
      </main>
    )
  }

  if (error || !sessionData) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <h1 className="text-xl font-semibold">Errore checkout</h1>
          <p className="text-sm text-amber-300">
            {error ||
              "Si è verificato un problema nel recuperare il carrello."}
          </p>
          <p className="text-xs text-slate-500">
            Torna al negozio e riprova ad aprire il checkout.
          </p>
        </div>
      </main>
    )
  }

  const { currency, items } = sessionData

  // Calcolo sicuro dei totali in base ai centesimi salvati
  const subtotalCents =
    typeof sessionData.subtotalCents === "number"
      ? sessionData.subtotalCents
      : 0
  const shippingCents =
    typeof sessionData.shippingCents === "number"
      ? sessionData.shippingCents
      : 0
  const totalCents =
    typeof sessionData.totalCents === "number"
      ? sessionData.totalCents
      : subtotalCents + shippingCents

  const subtotal = subtotalCents / 100
  const shipping = shippingCents / 100
  const total = totalCents / 100

  const fmt = (v: number) => `${v.toFixed(2)} ${currency}`

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      {/* Header sticky */}
      <header className="border-b border-slate-900/80 bg-slate-950/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6 lg:px-0">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 border border-slate-700/80 text-xs font-semibold">
              NF
            </div>
            <div className="flex flex-col">
              <span className="text-xs uppercase tracking-[0.2em] text-slate-500">
                Secure Checkout
              </span>
              <span className="text-sm font-medium text-slate-100">
                Checkout App
              </span>
            </div>
          </div>
          <div className="hidden items-center gap-2 text-xs text-slate-400 sm:flex">
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.9)]" />
            Connessione sicura
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-8 sm:px-6 lg:flex-row lg:px-0">
        {/* Colonna sinistra: dati spedizione */}
        <section className="flex-1 space-y-6">
          <div>
            <h1 className="text-xl font-semibold text-slate-50">
              Completa i dati e paga in modo sicuro.
            </h1>
            <p className="mt-2 text-xs text-slate-400 leading-relaxed">
              Inserisci i dati di spedizione. Il pagamento viene elaborato da{" "}
              <span className="font-semibold text-slate-100">Stripe</span>: i
              dati della carta non passano mai sui nostri server.
            </p>
          </div>

          <div className="space-y-4 rounded-2xl border border-slate-800/80 bg-slate-950/80 p-4 shadow-[0_22px_60px_rgba(15,23,42,0.9)] backdrop-blur-2xl">
            <h2 className="text-sm font-medium text-slate-100">
              Dati di spedizione
            </h2>

            <div className="space-y-3 text-xs">
              <div className="space-y-1.5">
                <label className="block text-slate-400">
                  Email per conferma ordine
                </label>
                <input
                  type="email"
                  className="w-full rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-100 outline-none ring-0 transition focus:border-sky-400 focus:bg-slate-900 focus:ring-1 focus:ring-sky-500/60"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="tuoindirizzo@email.com"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="block text-slate-400">Nome</label>
                  <input
                    className="w-full rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-100 outline-none focus:border-sky-400 focus:bg-slate-900 focus:ring-1 focus:ring-sky-500/60"
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-slate-400">Cognome</label>
                  <input
                    className="w-full rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-100 outline-none focus:border-sky-400 focus:bg-slate-900 focus:ring-1 focus:ring-sky-500/60"
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-slate-400">Indirizzo</label>
                <input
                  className="w-full rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-100 outline-none focus:border-sky-400 focus:bg-slate-900 focus:ring-1 focus:ring-sky-500/60"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  placeholder="Via, numero civico, interno"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="block text-slate-400">Città</label>
                  <input
                    className="w-full rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-100 outline-none focus:border-sky-400 focus:bg-slate-900 focus:ring-1 focus:ring-sky-500/60"
                    value={city}
                    onChange={e => setCity(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-slate-400">CAP</label>
                  <input
                    className="w-full rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-100 outline-none focus:border-sky-400 focus:bg-slate-900 focus:ring-1 focus:ring-sky-500/60"
                    value={zip}
                    onChange={e => setZip(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-slate-400">Paese / Regione</label>
                <select
                  className="w-full rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-100 outline-none focus:border-sky-400 focus:bg-slate-900 focus:ring-1 focus:ring-sky-500/60"
                  value={country}
                  onChange={e => setCountry(e.target.value)}
                >
                  <option value="IT">Italia</option>
                  <option value="SM">San Marino</option>
                  <option value="VA">Vaticano</option>
                </select>
              </div>
            </div>
          </div>
        </section>

        {/* Colonna destra: riepilogo + Summary (Stripe) */}
        <section className="w-full max-w-sm space-y-4 lg:w-[360px]">
          <div className="space-y-3 rounded-2xl border border-slate-800/80 bg-slate-950/80 p-4 shadow-[0_20px_55px_rgba(15,23,42,0.95)] backdrop-blur-2xl">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Articoli nel carrello</span>
              <span className="text-slate-200">
                {items.length} articolo{items.length !== 1 ? "i" : ""}
              </span>
            </div>

            <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
              {items.map(item => {
                const linePrice = (item.linePriceCents ?? 0) / 100
                const unitPrice = (item.priceCents ?? 0) / 100

                return (
                  <div
                    key={item.id}
                    className="flex gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3"
                  >
                    <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-slate-900 border border-slate-800">
                      {item.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.image}
                          alt={item.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-500">
                          No image
                        </div>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-1">
                      <div className="text-xs font-medium text-slate-100 line-clamp-2">
                        {item.title}
                      </div>
                      {item.variantTitle && (
                        <div className="text-[11px] text-slate-400">
                          {item.variantTitle}
                        </div>
                      )}
                      <div className="mt-1 flex items-center justify-between text-[11px] text-slate-300">
                        <span>
                          {item.quantity}× {unitPrice.toFixed(2)} {currency}
                        </span>
                        <span className="font-semibold">
                          {linePrice.toFixed(2)} {currency}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="space-y-1.5 border-t border-slate-800 pt-3 text-xs">
              <div className="flex items-center justify-between text-slate-400">
                <span>Subtotale prodotti</span>
                <span className="text-slate-100">{fmt(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>Spedizione</span>
                <span className="text-slate-100">
                  {shippingCents > 0 ? fmt(shipping) : "Calcolata dopo"}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm font-semibold text-slate-50">
                <span>Totale ordine</span>
                <span>{fmt(total)}</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                Pagamento gestito da{" "}
                <span className="font-semibold text-slate-100">Stripe</span>.
                I dati della tua carta non passano mai sui nostri server.
              </p>
            </div>
          </div>

          {/* Summary: bottone Stripe inline (per ora redirect a Stripe Checkout) */}
          <Summary
            sessionId={sessionData.sessionId}
            amountCents={totalCents}
            currency={currency}
          />
        </section>
      </div>
    </main>
  )
}