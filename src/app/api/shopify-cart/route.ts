// src/app/api/shopify-cart/route.ts
import { NextRequest } from 'next/server'
import { getConfig } from '@/lib/config'

export const runtime = 'nodejs'

function toCents(amount?: string | number | null): number {
  if (amount == null) return 0
  const n = typeof amount === 'number' ? amount : parseFloat(amount)
  if (Number.isNaN(n)) return 0
  return Math.round(n * 100)
}

export async function POST(req: NextRequest) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: true, message: 'Invalid JSON body' }, { status: 400 })
  }

  const cartId = body?.cartId
  if (!cartId) {
    return Response.json({ error: true, message: 'Missing cartId' }, { status: 400 })
  }

  const cfg = getConfig()
  const domain = cfg.shopifyDomain
  const storefrontToken = cfg.shopifyStorefrontToken || process.env.SHOPIFY_STOREFRONT_TOKEN

  if (!domain || !storefrontToken) {
    return Response.json(
      { error: true, message: 'Shopify domain or Storefront token not configured' },
      { status: 500 }
    )
  }

  const url = `https://${domain}/api/2024-10/graphql.json`

  const query = `
    query Cart($id: ID!) {
      cart(id: $id) {
        id
        buyerIdentity {
          email
        }
        cost {
          subtotalAmount {
            amount
            currencyCode
          }
          totalAmount {
            amount
            currencyCode
          }
          totalTaxAmount {
            amount
            currencyCode
          }
        }
        lines(first: 50) {
          edges {
            node {
              quantity
              cost {
                amountPerQuantity {
                  amount
                }
                totalAmount {
                  amount
                }
              }
              merchandise {
                ... on ProductVariant {
                  title
                  product {
                    title
                  }
                  image {
                    url
                  }
                }
              }
            }
          }
        }
      }
    }
  `

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': storefrontToken,
    },
    body: JSON.stringify({
      query,
      variables: { id: cartId },
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    console.error('[shopify-cart] HTTP error', res.status, text)
    return Response.json(
      { error: true, message: `Shopify Storefront error: HTTP ${res.status}` },
      { status: 500 }
    )
  }

  const json = await res.json()
  const cart = json?.data?.cart

  if (!cart) {
    console.error('[shopify-cart] No cart in response', json)
    return Response.json(
      { error: true, message: 'Cart not found in Shopify response' },
      { status: 500 }
    )
  }

  const currency =
    cart.cost?.totalAmount?.currencyCode ||
    cart.cost?.subtotalAmount?.currencyCode ||
    'EUR'

  const subtotalCents = toCents(cart.cost?.subtotalAmount?.amount)
  const totalCents = toCents(cart.cost?.totalAmount?.amount)
  const taxCents = toCents(cart.cost?.totalTaxAmount?.amount)
  const shippingCents = 0 // la Cart API non espone shipping in modo diretto; lo gestiremo in step successivo

  // stima sconto = (subtotal + tax + shipping) - total (se positivo)
  const discountTotal = Math.max(0, subtotalCents + taxCents + shippingCents - totalCents)

  const items = (cart.lines?.edges || []).map((edge: any) => {
    const node = edge?.node
    const qty = Number(node?.quantity) || 0
    const totalAmount = toCents(node?.cost?.totalAmount?.amount)
    const perQty = toCents(node?.cost?.amountPerQuantity?.amount)
    const merchandise = node?.merchandise

    const title =
      merchandise?.product?.title && merchandise?.title
        ? `${merchandise.product.title} - ${merchandise.title}`
        : merchandise?.product?.title || merchandise?.title || 'Articolo'

    const image = merchandise?.image?.url || ''

    // linePrice = prezzo per unità effettivo (dopo sconti)
    const unitEffective = qty > 0 ? Math.round(totalAmount / qty) : perQty

    return {
      title,
      quantity: qty,
      unitPrice: unitEffective, // centesimi
      linePrice: unitEffective, // usato dal frontend come “prezzo scontato per unità”
      image,
    }
  })

  const payload = {
    currency,
    items,
    subtotal: subtotalCents,
    discountTotal,
    shipping: shippingCents,
    tax: taxCents,
    total: totalCents,
    email: cart.buyerIdentity?.email || '',
  }

  console.log('[shopify-cart] normalized cart', {
    total: totalCents,
    items: items.length,
    currency,
  })

  return Response.json(payload)
}