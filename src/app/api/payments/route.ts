import { NextRequest } from 'next/server'
import Stripe from 'stripe'
import { getConfig } from '@/lib/config'

let rrIndex = -1

function pickStripeKey() {
  const cfg = getConfig()
  const list = cfg.stripeAccounts || []
  const active = list.filter(a => a.secretKey)

  if (!active.length) {
    throw new Error('No Stripe accounts configured')
  }

  rrIndex = (rrIndex + 1) % active.length
  const chosen = active[rrIndex]

  return { key: chosen.secretKey, label: chosen.label }
}

function computeTotalCents(snapshot: any) {
  const items = Array.isArray(snapshot?.lineItems) ? snapshot.lineItems : []
  const itemsSum = items.reduce((sum: number, it: any) => {
    const price = Number(it?.price) || 0   // in centesimi
    const qty = Number(it?.quantity) || 0
    return sum + price * qty
  }, 0)

  const shipping = Number(snapshot?.shipping?.selected?.amount) || 0
  const tax = Number(snapshot?.tax) || 0

  return itemsSum + shipping + tax
}

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  let body: any = null
  try {
    body = await req.json()
  } catch {
    return Response.json(
      { error: true, message: 'Invalid JSON body' },
      { status: 400 }
    )
  }

  let snapshot = body?.snapshot ?? body

  // 🔧 Fallback demo (permette di testare anche se il client invia vuoto)
  if (!snapshot || Object.keys(snapshot).length === 0) {
    console.warn('[payments] Empty snapshot received, using fallback demo snapshot')
    const demoItems = [{ title: 'Demo item', quantity: 1, price: 1299 }]
    const demoShipping = 500
    const demoTax = 0
    snapshot = {
      lineItems: demoItems,
      currency: 'EUR',
      totalAmount: demoItems.reduce((s, i) => s + i.price * i.quantity, 0) + demoShipping + demoTax,
      customer: { email: 'test@example.com' },
      shipping: { selected: { title: 'Standard', amount: demoShipping, code: 'STD' } },
      tax: demoTax,
    }
  }

  const currency = (snapshot.currency || 'EUR').toString().toLowerCase()

  let totalAmount = Number(snapshot.totalAmount)
  if (!Number.isInteger(totalAmount) || totalAmount < 50) {
    // fallback: calcolo dal contenuto
    totalAmount = computeTotalCents(snapshot)
  }

  if (!Number.isInteger(totalAmount) || totalAmount < 50) {
    console.error('[payments] Invalid totalAmount after fallback:', totalAmount, 'snapshot:', snapshot)
    return Response.json(
      { error: true, message: 'Invalid totalAmount (must be integer >= 50)' },
      { status: 400 }
    )
  }

  if (!/^[a-z]{3}$/.test(currency)) {
    console.error('[payments] Invalid currency:', currency)
    return Response.json(
      { error: true, message: 'Invalid currency' },
      { status: 400 }
    )
  }

  let keyRaw: string
  let checkoutDomain: string

  try {
    const cfg = getConfig()
    checkoutDomain = cfg.checkoutDomain || 'http://localhost:3000'
    keyRaw = pickStripeKey().key
  } catch (e: any) {
    console.error('[payments] Config error:', e?.message)
    return Response.json(
      { error: true, message: `Config error: ${e?.message || 'unknown'}` },
      { status: 500 }
    )
  }

  // 🔒 Sanitize + validazione formale della secret key Stripe
  const sk = (keyRaw || '').trim().replace(/\s+/g, '')
  const okFormat = /^sk_(test|live)_[A-Za-z0-9]+$/.test(sk) && sk.length > 25
  const masked = sk ? `${sk.slice(0, 10)}…${sk.slice(-6)} (len:${sk.length})` : '(vuota)'

  console.log('[payments] using Stripe key:', masked)

  if (!okFormat) {
    return Response.json(
      { error: true, message: `Invalid Stripe secret key format (${masked})` },
      { status: 400 }
    )
  }

  const stripe = new Stripe(sk, { apiVersion: '2023-10-16' })

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      success_url: `${checkoutDomain}/thank-you?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${checkoutDomain}/cancel`,
      line_items: [
        {
          price_data: {
            currency,
            product_data: { name: 'Order' },
            unit_amount: totalAmount,
          },
          quantity: 1,
        },
      ],
      customer_email: snapshot.customer?.email,
      metadata: { snapshot: JSON.stringify(snapshot) },
    })

    console.log(
      '[payments] Created checkout session ✅',
      session.id,
      'total',
      totalAmount,
      currency
    )

    return Response.json({ url: session.url })
  } catch (err: any) {
    console.error('[payments] Stripe error:', err?.raw || err?.message || err)
    return Response.json(
      { error: true, message: err?.message || 'Stripe error' },
      { status: 500 }
    )
  }
}