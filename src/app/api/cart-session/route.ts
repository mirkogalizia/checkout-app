import { NextRequest, NextResponse } from 'next/server'

// In dev va bene una Map in memoria.
// In produzione: Redis / DB.
const sessions = new Map<string, any>()

function createSnapshotFromCart(cart: any) {
  const currency = cart.currency || cart.presentment_currency || 'EUR'

  const items = (cart.items || []).map((item: any) => ({
    id: item.id,
    title: item.product_title,
    variantTitle: item.variant_title,
    quantity: item.quantity,
    price: item.price,        // in centesimi
    line_price: item.line_price,
    image: item.image,
    sku: item.sku,
  }))

  const subtotal = cart.items_subtotal_price || 0
  const total = cart.total_price || subtotal

  return {
    currency,
    items,
    subtotalAmount: subtotal, // centesimi
    totalAmount: total,       // centesimi
    rawCart: cart,
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const cart = body.cart

    if (!cart || !Array.isArray(cart.items)) {
      return NextResponse.json(
        { error: 'Cart non valido' },
        { status: 400 }
      )
    }

    const snapshot = createSnapshotFromCart(cart)

    const sessionId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2)

    sessions.set(sessionId, snapshot)

    return NextResponse.json({ sessionId })
  } catch (err: any) {
    console.error('[cart-session] errore POST', err)
    return NextResponse.json(
      { error: 'Errore interno' },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get('sessionId')

  if (!sessionId) {
    return NextResponse.json(
      { error: 'sessionId mancante' },
      { status: 400 }
    )
  }

  const snapshot = sessions.get(sessionId)

  if (!snapshot) {
    return NextResponse.json(
      { error: 'Sessione non trovata o scaduta' },
      { status: 404 }
    )
  }

  return NextResponse.json({ sessionId, snapshot })
}