import { NextRequest } from 'next/server'
import Stripe from 'stripe'
import { getConfig } from '@/lib/config'

export const runtime = 'nodejs' // per req.text()

function verifyWithAnySecret(rawBody: string, signature: string, secrets: string[]): Stripe.Event {
  let lastErr: any = null
  for (const s of secrets) {
    try {
      return Stripe.webhooks.constructEvent(rawBody, signature, s)
    } catch (e) {
      lastErr = e
      continue
    }
  }
  throw lastErr || new Error('No valid webhook secret provided')
}

export async function POST(req: NextRequest) {
  const cfg = getConfig()
  const signature = req.headers.get('stripe-signature') || ''
  const rawBody = await req.text()

  const secrets = (cfg.stripeAccounts || [])
    .map(a => a.webhookSecret)
    .filter(Boolean) as string[]

  if (!secrets.length) {
    return new Response('No webhook secrets configured', { status: 500 })
  }

  let event: Stripe.Event
  try {
    event = verifyWithAnySecret(rawBody, signature, secrets)
  } catch (err: any) {
    return new Response(`Webhook signature verification failed: ${err.message}`, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session

    // prova a recuperare lo snapshot che avevamo passato nella sessione
    let snapshot: any = {}
    try {
      snapshot = session.metadata?.snapshot ? JSON.parse(session.metadata.snapshot as string) : {}
    } catch {
      snapshot = {}
    }

    const items = Array.isArray(snapshot.lineItems) && snapshot.lineItems.length
      ? snapshot.lineItems
      : [{ title: 'Order', quantity: 1, price: session.amount_total ?? 0 }]

    const orderPayload = {
      order: {
        line_items: items.map((it: any) => ({
          variant_id: it.variantId, // se disponibile
          title: it.title,
          quantity: it.quantity,
          price: ((it.price ?? 0) / 100).toFixed(2),
        })),
        financial_status: 'paid',
        fulfillment_status: null,
        email: snapshot.customer?.email || session.customer_details?.email || session.customer_email || undefined,
        shipping_address: snapshot.shipping?.address,
        billing_address: snapshot.billing?.address ?? snapshot.shipping?.address,
        tags: 'OffsiteCheckout, Stripe',
        note: `Stripe session ${session.id}`,
        shipping_lines: snapshot.shipping?.selected ? [{
          title: snapshot.shipping.selected.title,
          price: ((snapshot.shipping.selected.amount ?? 0) / 100).toFixed(2),
          code: snapshot.shipping.selected.code || 'offsite',
        }] : undefined,
        currency: (snapshot.currency || session.currency || 'EUR').toUpperCase(),
        presentment_currency: (snapshot.currency || session.currency || 'EUR').toUpperCase(),
        taxes_included: true,
      }
    }

    // Shopify (se configurato)
    if (cfg.shopifyDomain && cfg.shopifyToken) {
      const url = `https://${cfg.shopifyDomain}/admin/api/${cfg.shopifyApiVersion || '2024-10'}/orders.json`
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': cfg.shopifyToken,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(orderPayload),
      })

      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        console.error('[Webhook] Shopify order create FAILED', resp.status, text)
      } else {
        const data = await resp.json().catch(() => ({}))
        console.log('[Webhook] Shopify order created ✅', data?.order?.id || data)
      }
    } else {
      console.log('[Webhook] Skipped Shopify creation (config non completa). Payload:', orderPayload)
    }
  } else {
    console.log('[Webhook] event', event.type)
  }

  return Response.json({ received: true })
}