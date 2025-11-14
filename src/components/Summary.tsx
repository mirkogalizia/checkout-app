"use client"

import React, { useState } from "react"

export type SummaryProps = {
  sessionId: string
}

export default function Summary({ sessionId }: SummaryProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    <div className="space-y-3">
      <button
        type="button"
        onClick={handlePay}
        disabled={loading}
        className="w-full inline-flex items-center justify-center rounded-2xl bg-sky-500 hover:bg-sky-400 disabled:bg-slate-700 disabled:cursor-not-allowed px-4 py-3 text-sm font-semibold text-slate-950 shadow-[0_14px_40px_rgba(56,189,248,0.45)] transition-all"
      >
        {loading ? "Reindirizzamento in corso…" : "Paga ora con carta"}
      </button>

      {error && (
        <p className="text-[11px] text-amber-400">
          {error}
        </p>
      )}
    </div>
  )
}