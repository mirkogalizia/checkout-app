// src/middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const rateLimit = new Map<string, { count: number; resetTime: number }>()

export function middleware(request: NextRequest) {
  // Next.js 16: usa headers invece di request.ip
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded ? forwarded.split(',')[0] : 'unknown'
  
  const now = Date.now()
  const windowMs = 60000 // 1 minuto
  const maxRequests = 100 // 100 richieste per minuto

  const record = rateLimit.get(ip)

  if (record && now < record.resetTime) {
    if (record.count >= maxRequests) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429 }
      )
    }
    record.count++
  } else {
    rateLimit.set(ip, { count: 1, resetTime: now + windowMs })
  }

  // Pulisci vecchie entry ogni tanto
  if (Math.random() < 0.01) {
    for (const [key, value] of rateLimit.entries()) {
      if (now > value.resetTime) {
        rateLimit.delete(key)
      }
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/api/:path*',
}
