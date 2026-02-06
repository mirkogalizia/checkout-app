// src/app/layout.tsx
import "./globals.css"
import type { Metadata } from "next"
import FacebookPixel from "@/components/FacebookPixel"
import { SpeedInsights } from "@vercel/speed-insights/next" // 👈 aggiungi questo

export const metadata: Metadata = {
  title: "Checkout App",
  description: "Custom Shopify + Stripe checkout",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="it">
      <body>
        <FacebookPixel />
        {children}
        <SpeedInsights /> {/* 👈 e questo, alla fine del body */}
      </body>
    </html>
  )
}
