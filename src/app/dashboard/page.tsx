// src/app/api/admin/verify-password/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json()

    if (password === process.env.ADMIN_SECRET_KEY) {
      return NextResponse.json({ success: true })
    }

    return NextResponse.json(
      { error: 'Password non corretta' },
      { status: 401 }
    )
  } catch (error) {
    return NextResponse.json(
      { error: 'Errore server' },
      { status: 500 }
    )
  }
}
