'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

interface CheckoutItem {
  id: number
  title: string
  variantTitle: string
  quantity: number
  price: number
  line_price: number
  image?: string
  sku?: string
}

interface Snapshot {
  currency: string
  items: CheckoutItem[]
  subtotalAmount: number
  totalAmount: number
}

export default function CheckoutPage() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('sessionId')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [paying, setPaying] = useState(false)

  useEffect(() => {
    if (!sessionId) {
      setError('Nessuna sessione di checkout trovata.')
      setLoading(false)
      return
    }

    async function load() {
      try {
        const res = await fetch(`/api/cart-session?sessionId=${encodeURIComponent(sessionId)}`)
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data.error || 'Errore nel recupero del carrello')
        }
        setSnapshot(data.snapshot)
      } catch (err: any) {
        console.error(err)
        setError(err.message || 'Errore')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [sessionId])

  const handlePay = async () => {
    if (!snapshot) return
    if (paying) return
    setPaying(true)

    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          totalAmount: snapshot.totalAmount, // centesimi
          currency: snapshot.currency || 'EUR',
          description: 'Ordine Shopify via checkout custom',
        }),
      })

      const data = await res.json()

      if (!res.ok || !data.url) {
        console.error(data)
        throw new Error(data.error || 'Errore nella creazione del pagamento')
      }

      // Redirect alla pagina di pagamento Stripe
      window.location.href = data.url
    } catch (err: any) {
      console.error(err)
      alert(err.message || 'Errore nel pagamento')
      setPaying(false)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p>Caricamento carrello...</p>
      </main>
    )
  }

  if (error || !snapshot) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="p-6 border rounded-md max-w-md text-center space-y-4">
          <h1 className="text-xl font-semibold">Errore checkout</h1>
          <p>{error || 'Carrello non disponibile.'}</p>
        </div>
      </main>
    )
  }

  const currency = snapshot.currency || 'EUR'
  const formatMoney = (value: number) =>
    (value / 100).toLocaleString('it-IT', {
      style: 'currency',
      currency,
    })

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-4xl bg-white shadow-lg rounded-2xl p-8 grid md:grid-cols-[2fr,1fr] gap-8">
        <section className="space-y-4">
          <h1 className="text-2xl font-semibold">Riepilogo ordine</h1>
          <ul className="space-y-3">
            {snapshot.items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between border-b pb-3"
              >
                <div className="flex items-center gap-3">
                  {item.image && (
                    <img
                      src={item.image}
                      alt={item.title}
                      className="w-12 h-12 object-cover rounded-md"
                    />
                  )}
                  <div>
                    <p className="font-medium">{item.title}</p>
                    {item.variantTitle && (
                      <p className="text-sm text-gray-500">
                        {item.variantTitle}
                      </p>
                    )}
                    <p className="text-sm text-gray-500">
                      Quantità: {item.quantity}
                    </p>
                  </div>
                </div>
                <span className="font-medium">
                  {formatMoney(item.line_price)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <aside className="space-y-4 border-l pl-0 md:pl-4">
          <h2 className="text-xl font-semibold">Totale</h2>
          <div className="flex justify-between">
            <span>Subtotale</span>
            <span>{formatMoney(snapshot.subtotalAmount)}</span>
          </div>
          <div className="flex justify-between font-semibold text-lg">
            <span>Totale</span>
            <span>{formatMoney(snapshot.totalAmount)}</span>
          </div>

          <button
            onClick={handlePay}
            disabled={paying}
            className="btn-primary w-full mt-4 py-3 rounded-xl"
            style={{
              backgroundColor: 'black',
              color: 'white',
              fontWeight: 600,
            }}
          >
            {paying ? 'Reindirizzamento a Stripe...' : 'Paga ora con carta'}
          </button>
        </aside>
      </div>
    </main>
  )
}