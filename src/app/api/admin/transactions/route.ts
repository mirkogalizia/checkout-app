// src/app/api/admin/transactions/route.ts
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const key = searchParams.get('key')
    
    if (key !== process.env.ADMIN_SECRET_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '')
    
    const payments = await stripe.paymentIntents.list({
      limit: 100,
    })

    const transactions = payments.data.map(payment => {
      return {
        id: payment.id,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        created: payment.created,
        email: payment.receipt_email || 'N/A',
        fullName: payment.metadata?.customer_name || 'N/A',
        items: [],
        orderNumber: payment.metadata?.order_number,
        errorCode: payment.last_payment_error?.code,
        errorMessage: payment.last_payment_error?.message,
        declineCode: payment.last_payment_error?.decline_code,
      }
    })

    return NextResponse.json({ transactions })
    
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
