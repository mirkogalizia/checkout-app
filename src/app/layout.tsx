// src/app/layout.tsx
import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Checkout',
  description: 'Checkout esterno Shopify-like con Stripe',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body className="bg-gray-50 text-gray-900">{children}</body>
    </html>
  )
}