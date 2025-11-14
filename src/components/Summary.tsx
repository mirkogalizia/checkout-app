"use client"

import React, { useState } from "react"

export type SummaryProps = {
  sessionId: string
  amountCents: number
  currency: string
}

export default function Summary({ sessionId, amountCents, currency }: SummaryProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const amount = (amountCents || 0) / 100
  const formattedTotal = `${amount.toFixed(2)} ${currency.toUpperCase() || "EUR"}`

  async function handlePay() {
    if (loading) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      })

      const json = await res.json()

      if (!res.ok || !json.url) {
        throw new Error(json.error || "Errore nella creazione del pagamento")
      }

      // Redirect alla Stripe Checkout Session
      window.location.href = json.url
    } catch (err: any) {
      console.error("[Summary] payment error:", err)
      setError(err.message || "Errore nel pagamento. Riprova.")
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-slate-800/60 bg-slate-900/60 p-4 shadow-[0_18px_45px_rgba(15,23,42,0.65)] backdrop-blur-xl">
      <div className="flex items-center justify-between text-xs text-slate-300">
        <span className="uppercase tracking-wide text-slate-400">
          Totale ordine
        </span>
        <span className="font-semibold text-slate-50">
          {formattedTotal}
        </span>
      </div>

      <p className="text-[11px] leading-snug text-slate-400">
        Pagamento sicuro gestito da{" "}
        <span className="font-semibold text-slate-100">Stripe</span>. I dati
        della tua carta non transitano mai sui nostri server.
      </p>

      <button
        type="button"
        onClick={handlePay}
        disabled={loading || amount <= 0}
        className="w-full inline-flex items-center justify-center rounded-2xl bg-sky-500 hover:bg-sky-400 disabled:bg-slate-700 disabled:cursor-not-allowed px-4 py-3 text-sm font-semibold text-slate-950 shadow-[0_14px_40px_rgba(56,189,248,0.45)] transition-all"
      >
        {loading ? "Reindirizzamento in corso…" : "Paga ora con carta"}
      </button>

      {amount <= 0 && (
        <p className="text-[11px] text-amber-400">
          L&apos;importo deve essere maggiore di 0 per procedere con il pagamento.
        </p>
      )}

      {error && (
        <p className="text-[11px] text-amber-400">
          {error}
        </p>
      )}
    </div>
  )
}