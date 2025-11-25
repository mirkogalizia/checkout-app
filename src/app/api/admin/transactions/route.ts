// src/app/api/admin/transactions/route.ts
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { db } from '@/lib/firebaseAdmin'

export async function GET(req: NextRequest) {
  try {
    console.log('[Admin] Request ricevuta')
    
    const { searchParams } = new URL(req.url)
    const key = searchParams.get('key')
    
    console.log('[Admin] Key ricevuta:', key ? 'SI' : 'NO')
    console.log('[Admin] Secret in env:', process.env.ADMIN_SECRET_KEY ? 'SI' : 'NO')
    
    if (key !== process.env.ADMIN_SECRET_KEY) {
      console.log('[Admin] Password errata')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[Admin] Password corretta, carico Stripe...')
    
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '')
    
    console.log('[Admin] Carico payment intents...')
    const payments = await stripe.paymentIntents.list({
      limit: 100,
    })
    
    console.log('[Admin] Payment intents trovati:', payments.data.length)
    
    console.log('[Admin] Carico Firebase...')
    const sessionsSnapshot = await db.collection('cartSessions')
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get()

    console.log('[Admin] Sessioni Firebase trovate:', sessionsSnapshot.docs.length)

    const sessions = new Map()
    sessionsSnapshot.docs.forEach(doc => {
      const data = doc.data()
      if (data.paymentIntentId) {
        sessions.set(data.paymentIntentId, {
          sessionId: doc.id,
          email: data.customer?.email,
          fullName: data.customer?.fullName,
          items: data.items || [],
          shopifyOrderNumber: data.shopifyOrderNumber,
        })
      }
    })

    const transactions = payments.data.map(payment => {
      const session = sessions.get(payment.id)
      
      return {
        id: payment.id,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        created: payment.created,
        email: session?.email || payment.receipt_email || 'N/A',
        fullName: session?.fullName || 'N/A',
        items: session?.items || [],
        orderNumber: session?.shopifyOrderNumber,
        errorCode: payment.last_payment_error?.code,
        errorMessage: payment.last_payment_error?.message,
        declineCode: payment.last_payment_error?.decline_code,
      }
    })

    console.log('[Admin] ✅ Transazioni formattate:', transactions.length)
    return NextResponse.json({ transactions })
    
  } catch (error: any) {
    console.error('[Admin] ❌ ERRORE:', error.message)
    console.error('[Admin] Stack:', error.stack)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
