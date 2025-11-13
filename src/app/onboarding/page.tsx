'use client'
import { useEffect, useState } from 'react'

type StripeAccountForm = {
  label: string
  secretKey: string
  webhookSecret: string
}

export default function OnboardingPage() {
  const [form, setForm] = useState({
    shopifyDomain: '',
    shopifyToken: '',
    shopifyApiVersion: '2024-10',
    checkoutDomain: 'http://localhost:3000',
    stripeAccounts: [
      { label: 'Account 1', secretKey: '', webhookSecret: '' },
      { label: 'Account 2', secretKey: '', webhookSecret: '' },
      { label: 'Account 3', secretKey: '', webhookSecret: '' },
      { label: 'Account 4', secretKey: '', webhookSecret: '' },
    ] as StripeAccountForm[],
  })
  const [saved, setSaved] = useState<null | { ok: boolean; count: number }>(null)

  useEffect(() => {
    // precompila campi NON sensibili dal backend
    fetch('/api/config')
      .then(r => r.json())
      .then(cfg => {
        setForm(prev => ({
          ...prev,
          shopifyDomain: cfg.shopifyDomain || prev.shopifyDomain,
          shopifyApiVersion: cfg.shopifyApiVersion || prev.shopifyApiVersion,
          checkoutDomain: cfg.checkoutDomain || prev.checkoutDomain,
          // stripeAccounts dal GET hanno segreti vuoti: manteniamo i nostri placeholder di default
        }))
      })
      .catch(() => {})
  }, [])

  function changeField(e: React.ChangeEvent<HTMLInputElement>) {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  function changeAccount(idx: number, key: keyof StripeAccountForm, value: string) {
    const copy = [...form.stripeAccounts]
    copy[idx] = { ...copy[idx], [key]: value }
    setForm({ ...form, stripeAccounts: copy })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaved(null)

    // invia al backend; verranno filtrati quelli senza secretKey
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })

    if (res.ok) {
      const data = await res.json().catch(() => ({}))
      setSaved({ ok: true, count: data?.stripeAccountsSaved ?? 0 })
    } else {
      setSaved({ ok: false, count: 0 })
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-8 space-y-8">
      <h1 className="text-2xl font-semibold">Onboarding Checkout</h1>
      <p className="text-gray-600">Configura Shopify e fino a 4 account Stripe. Puoi salvarne anche solo 1.</p>

      <form onSubmit={handleSubmit} className="space-y-8">
        <section className="card p-6 space-y-4">
          <h2 className="text-lg font-semibold">Shopify</h2>
          <div>
            <label className="label">Shopify Store Domain</label>
            <input
              className="input"
              name="shopifyDomain"
              value={form.shopifyDomain}
              onChange={changeField}
              placeholder="mystore.myshopify.com"
              required
            />
          </div>
          <div>
            <label className="label">Shopify Admin API Token</label>
            <input
              className="input"
              name="shopifyToken"
              value={form.shopifyToken}
              onChange={changeField}
              placeholder="shpat_..."
              required
            />
          </div>
          <div>
            <label className="label">Shopify API Version</label>
            <input
              className="input"
              name="shopifyApiVersion"
              value={form.shopifyApiVersion}
              onChange={changeField}
              placeholder="2024-10"
            />
          </div>
          <div>
            <label className="label">Checkout Domain</label>
            <input
              className="input"
              name="checkoutDomain"
              value={form.checkoutDomain}
              onChange={changeField}
              placeholder="http://localhost:3000"
            />
          </div>
        </section>

        <section className="card p-6 space-y-4">
          <h2 className="text-lg font-semibold">Stripe (fino a 4 account)</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {form.stripeAccounts.map((acc, idx) => (
              <div key={idx} className="border rounded-xl p-4 space-y-3">
                <div>
                  <label className="label">Label</label>
                  <input
                    className="input"
                    value={acc.label}
                    onChange={(e) => changeAccount(idx, 'label', e.target.value)}
                    placeholder={`Account ${idx + 1}`}
                  />
                </div>
                <div>
                  <label className="label">Stripe Secret Key (sk_...)</label>
                  <input
                    className="input"
                    value={acc.secretKey}
                    onChange={(e) => changeAccount(idx, 'secretKey', e.target.value)}
                    placeholder="sk_test_..."
                  />
                </div>
                <div>
                  <label className="label">Webhook Secret (whsec_...)</label>
                  <input
                    className="input"
                    value={acc.webhookSecret}
                    onChange={(e) => changeAccount(idx, 'webhookSecret', e.target.value)}
                    placeholder="whsec_..."
                  />
                </div>
              </div>
            ))}
          </div>

          <p className="text-sm text-gray-500">
            Inserisci almeno <strong>una</strong> <code>sk_</code> valida. I campi vuoti verranno ignorati.
          </p>
        </section>

        <div className="pt-2">
          <button className="btn-primary w-full" type="submit">Salva configurazione</button>
        </div>

        {saved && saved.ok && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700">
            ✅ Config salvata. Account Stripe attivi: <strong>{saved.count}</strong>
          </div>
        )}
        {saved && !saved.ok && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
            ❌ Errore salvataggio configurazione.
          </div>
        )}
      </form>
    </main>
  )
}