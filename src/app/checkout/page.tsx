// src/app/checkout/page.tsx
"use client"

import React, {
  useEffect,
  useMemo,
  useState,
  useRef,
  ChangeEvent,
  FormEvent,
  Suspense,
} from "react"
import { useSearchParams } from "next/navigation"
import Script from "next/script"
import { loadStripe, Stripe } from "@stripe/stripe-js"
import {
  Elements,
  PaymentElement,
  ExpressCheckoutElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js"
import dynamic_import from "next/dynamic"

const AirwallexPayment = dynamic_import(
  () => import("./airwallex/AirwallexPayment"),
  { ssr: false },
)

const AirwallexExpressCheckout = dynamic_import(
  () => import("./airwallex/AirwallexExpressCheckout"),
  { ssr: false },
)

export const dynamic = "force-dynamic"

type CheckoutItem = {
  id: string | number
  title: string
  variantTitle?: string
  quantity: number
  priceCents?: number
  linePriceCents?: number
  image?: string
}

type CartSessionResponse = {
  sessionId: string
  currency: string
  items: CheckoutItem[]
  subtotalCents?: number
  shippingCents?: number
  totalCents?: number
  paymentIntentClientSecret?: string
  paymentIntentId?: string
  discountCodes?: { code: string }[]
  rawCart?: any
  shopDomain?: string
  error?: string
}

type CustomerForm = {
  fullName: string
  email: string
  phone: string
  address1: string
  address2: string
  city: string
  postalCode: string
  province: string
  countryCode: string
}

// ── GEO CONFIG ────────────────────────────────────────────────────────
type GeoLabels = {
  contacts: string; delivery: string; payment: string
  firstName: string; lastName: string; address: string
  address2: string; city: string; postalCode: string
  province: string; phone: string; company: string
  country: string; emailUpdates: string; saveInfo: string
  pay: string; shipping: string; billing: string
  shippingMethod: string; email: string
}

type GeoConfig = {
  countryCode: string
  phonePrefix: string
  labels: GeoLabels
}

const GEO_CONFIG: Record<string, GeoConfig> = {
  IT: {
    countryCode: "IT", phonePrefix: "+39",
    labels: {
      contacts: "Contatti", delivery: "Consegna", payment: "Pagamento",
      firstName: "Nome", lastName: "Cognome", address: "Indirizzo",
      address2: "Interno, scala, ecc. (facoltativo)", city: "Città",
      postalCode: "CAP", province: "Provincia", phone: "Telefono",
      company: "Azienda (facoltativo)", country: "Paese / Regione",
      emailUpdates: "Inviami email con notizie e offerte",
      saveInfo: "Salva questi dati per la prossima volta",
      pay: "Paga in sicurezza", shipping: "Spedizione",
      billing: "Fatturazione", shippingMethod: "Metodo di spedizione",
      email: "Email",
    }
  },
  ES: {
    countryCode: "ES", phonePrefix: "+34",
    labels: {
      contacts: "Contacto", delivery: "Entrega", payment: "Pago",
      firstName: "Nombre", lastName: "Apellido", address: "Dirección",
      address2: "Piso, escalera, etc. (opcional)", city: "Ciudad",
      postalCode: "Código postal", province: "Provincia", phone: "Teléfono",
      company: "Empresa (opcional)", country: "País / Región",
      emailUpdates: "Envíame emails con novedades y ofertas",
      saveInfo: "Guardar estos datos para la próxima vez",
      pay: "Pagar de forma segura", shipping: "Envío",
      billing: "Facturación", shippingMethod: "Método de envío",
      email: "Correo electrónico",
    }
  },
  FR: {
    countryCode: "FR", phonePrefix: "+33",
    labels: {
      contacts: "Contact", delivery: "Livraison", payment: "Paiement",
      firstName: "Prénom", lastName: "Nom", address: "Adresse",
      address2: "Appartement, étage, etc. (facultatif)", city: "Ville",
      postalCode: "Code postal", province: "Région", phone: "Téléphone",
      company: "Société (facultatif)", country: "Pays / Région",
      emailUpdates: "Recevez nos emails avec actualités et offres",
      saveInfo: "Enregistrer ces informations pour la prochaine fois",
      pay: "Payer en sécurité", shipping: "Livraison",
      billing: "Facturation", shippingMethod: "Mode de livraison",
      email: "Email",
    }
  },
  DE: {
    countryCode: "DE", phonePrefix: "+49",
    labels: {
      contacts: "Kontakt", delivery: "Lieferung", payment: "Zahlung",
      firstName: "Vorname", lastName: "Nachname", address: "Adresse",
      address2: "Wohnung, Stockwerk usw. (optional)", city: "Stadt",
      postalCode: "PLZ", province: "Bundesland", phone: "Telefon",
      company: "Unternehmen (optional)", country: "Land / Region",
      emailUpdates: "E-Mails mit Neuigkeiten und Angeboten erhalten",
      saveInfo: "Diese Daten für das nächste Mal speichern",
      pay: "Sicher bezahlen", shipping: "Versand",
      billing: "Rechnungsadresse", shippingMethod: "Versandmethode",
      email: "E-Mail",
    }
  },
  PT: {
    countryCode: "PT", phonePrefix: "+351",
    labels: {
      contacts: "Contacto", delivery: "Entrega", payment: "Pagamento",
      firstName: "Nome", lastName: "Apelido", address: "Morada",
      address2: "Andar, fração, etc. (opcional)", city: "Cidade",
      postalCode: "Código postal", province: "Distrito", phone: "Telefone",
      company: "Empresa (opcional)", country: "País / Região",
      emailUpdates: "Envie-me emails com novidades e ofertas",
      saveInfo: "Guardar estes dados para a próxima vez",
      pay: "Pagar com segurança", shipping: "Envio",
      billing: "Faturação", shippingMethod: "Método de envio",
      email: "Email",
    }
  },
  NL: {
    countryCode: "NL", phonePrefix: "+31",
    labels: {
      contacts: "Contact", delivery: "Bezorging", payment: "Betaling",
      firstName: "Voornaam", lastName: "Achternaam", address: "Adres",
      address2: "Appartement, verdieping, etc. (optioneel)", city: "Stad",
      postalCode: "Postcode", province: "Provincie", phone: "Telefoon",
      company: "Bedrijf (optioneel)", country: "Land / Regio",
      emailUpdates: "Stuur mij e-mails met nieuws en aanbiedingen",
      saveInfo: "Deze gegevens opslaan voor de volgende keer",
      pay: "Veilig betalen", shipping: "Verzending",
      billing: "Facturering", shippingMethod: "Verzendmethode",
      email: "E-mail",
    }
  },
}

function getGeoConfig(country: string): GeoConfig {
  if (GEO_CONFIG[country]) return GEO_CONFIG[country]
  return {
    countryCode: country,
    phonePrefix: "",
    labels: {
      contacts: "Contact", delivery: "Delivery", payment: "Payment",
      firstName: "First name", lastName: "Last name", address: "Address",
      address2: "Apartment, suite, etc. (optional)", city: "City",
      postalCode: "Postal code", province: "Region", phone: "Phone",
      company: "Company (optional)", country: "Country / Region",
      emailUpdates: "Email me with news and offers",
      saveInfo: "Save this information for next time",
      pay: "Pay now securely", shipping: "Shipping",
      billing: "Billing", shippingMethod: "Shipping method",
      email: "Email",
    }
  }
}
// ─────────────────────────────────────────────────────────────────────

function formatMoney(cents: number | undefined, currency: string = "EUR") {
  const value = (cents ?? 0) / 100
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(value)
}

// ── STEP INDICATOR ────────────────────────────────────────────────────
function StepIndicator({ currentStep }: { currentStep: number }) {
  const steps = ["Contatti", "Consegna", "Pagamento"]
  return (
    <div className="flex items-center justify-center gap-0 mb-6">
      {steps.map((label, i) => {
        const idx = i + 1
        const done = currentStep > idx
        const active = currentStep === idx
        return (
          <React.Fragment key={label}>
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                  done
                    ? "bg-emerald-500 text-white shadow-md shadow-emerald-200"
                    : active
                    ? "bg-gray-900 text-white shadow-md"
                    : "bg-gray-100 text-gray-400 border border-gray-200"
                }`}
              >
                {done ? (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                ) : idx}
              </div>
              <span className={`text-[10px] mt-1 font-medium ${active ? "text-gray-900" : done ? "text-emerald-600" : "text-gray-400"}`}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`h-px w-10 mb-4 mx-1 transition-all duration-300 ${done ? "bg-emerald-400" : "bg-gray-200"}`} />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ── TRUST BADGES ROW ──────────────────────────────────────────────────
function TrustBadges() {
  return (
    <div className="grid grid-cols-3 gap-2 mb-5">
      {[
        { icon: "🔒", label: "SSL 256-bit" },
        { icon: "🚚", label: "24/48h" },
        { icon: "↩️", label: "14gg reso" },
      ].map(({ icon, label }) => (
        <div key={label} className="flex flex-col items-center gap-1 py-2.5 px-2 bg-gray-50 rounded-xl border border-gray-100">
          <span className="text-base">{icon}</span>
          <span className="text-[10px] font-semibold text-gray-600 text-center leading-tight">{label}</span>
        </div>
      ))}
    </div>
  )
}

// ── SECTION CARD ──────────────────────────────────────────────────────
function SectionCard({ title, children, className = "" }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-4 ${className}`}>
      {title && (
        <div className="px-5 pt-5 pb-3 border-b border-gray-50">
          <h2 className="text-sm font-semibold text-gray-900 tracking-wide uppercase">{title}</h2>
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  )
}

// ── FLOATING LABEL INPUT ──────────────────────────────────────────────
function FloatingInput({
  label,
  type = "text",
  name,
  value,
  onChange,
  placeholder,
  required,
  autoComplete,
  inputRef,
}: {
  label: string
  type?: string
  name?: string
  value: string
  onChange: (e: ChangeEvent<HTMLInputElement>) => void
  placeholder?: string
  required?: boolean
  autoComplete?: string
  inputRef?: React.Ref<HTMLInputElement>
}) {
  const [focused, setFocused] = useState(false)
  const hasValue = value.length > 0
  const floated = focused || hasValue

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={floated ? placeholder : ""}
        required={required}
        autoComplete={autoComplete}
        className={`w-full px-4 pt-6 pb-2 text-[16px] text-gray-900 bg-white border rounded-xl transition-all duration-200 outline-none appearance-none
          ${focused
            ? "border-gray-900 shadow-[0_0_0_2px_rgba(17,24,39,0.08)]"
            : hasValue
            ? "border-gray-300"
            : "border-gray-200"
          }`}
      />
      <label
        className={`absolute left-4 transition-all duration-200 pointer-events-none select-none
          ${floated
            ? "top-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider"
            : "top-1/2 -translate-y-1/2 text-sm text-gray-400"
          }`}
      >
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
    </div>
  )
}

// ── FLOATING SELECT ───────────────────────────────────────────────────
function FloatingSelect({
  label,
  name,
  value,
  onChange,
  children,
  required,
}: {
  label: string
  name?: string
  value: string
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void
  children: React.ReactNode
  required?: boolean
}) {
  const [focused, setFocused] = useState(false)

  return (
    <div className="relative">
      <select
        name={name}
        value={value}
        onChange={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        required={required}
        className={`w-full px-4 pt-6 pb-2 text-[16px] text-gray-900 bg-white border rounded-xl transition-all duration-200 outline-none appearance-none
          ${focused
            ? "border-gray-900 shadow-[0_0_0_2px_rgba(17,24,39,0.08)]"
            : "border-gray-200"
          }`}
      >
        {children}
      </select>
      <label className="absolute left-4 top-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider pointer-events-none select-none">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
  )
}

// ── ORDER SUMMARY (mobile accordion + desktop static) ─────────────────
function OrderSummary({
  cart,
  subtotalCents,
  discountCents,
  shippingToApply,
  totalToPayCents,
  currency,
  mobile = false,
}: {
  cart: CartSessionResponse
  subtotalCents: number
  discountCents: number
  shippingToApply: number
  totalToPayCents: number
  currency: string
  mobile?: boolean
}) {
  const [open, setOpen] = useState(false)

  const inner = (
    <>
      {discountCents > 0 && (
        <div className="mb-4 p-4 bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 rounded-xl">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-bold text-emerald-700">🎉 Stai risparmiando</span>
            <span className="ml-auto text-lg font-black text-emerald-600">-{formatMoney(discountCents, currency)}</span>
          </div>
        </div>
      )}

      <div className="space-y-3 mb-5">
        {cart.items.map((item, idx) => {
          const originalPrice = item.priceCents || 0
          const currentPrice = item.linePriceCents || 0
          const expectedTotal = originalPrice * item.quantity
          const discountAmount = expectedTotal - currentPrice
          const isFullyFree = currentPrice === 0 && originalPrice > 0
          const isDiscounted = discountAmount > 0

          return (
            <div key={idx} className="flex gap-3">
              {/* Immagine con badge quantità */}
              {item.image && (
                <div className="relative flex-shrink-0">
                  <img
                    src={item.image}
                    alt={item.title}
                    className="w-16 h-16 object-cover rounded-xl border border-gray-100 shadow-sm"
                  />
                  <span className="absolute -top-1.5 -right-1.5 bg-gray-800 text-white text-[10px] rounded-full w-5 h-5 flex items-center justify-center font-bold shadow">
                    {item.quantity}
                  </span>
                </div>
              )}

              {/* Info prodotto */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 leading-tight">{item.title}</p>
                {item.variantTitle && (
                  <p className="text-xs text-gray-400 mt-0.5">{item.variantTitle}</p>
                )}

                {/* Badge sconto inline, sotto la variante */}
                {isFullyFree && (
                  <span className="inline-flex items-center gap-1 mt-1 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                    🎁 GRATIS
                  </span>
                )}
                {!isFullyFree && isDiscounted && (
                  <span className="inline-flex items-center gap-1 mt-1 bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                    -{formatMoney(discountAmount, currency)}
                  </span>
                )}

                {/* Prezzo barrato */}
                {isDiscounted && (
                  <p className="text-xs line-through text-gray-300 mt-0.5">{formatMoney(expectedTotal, currency)}</p>
                )}
              </div>

              {/* Prezzo finale */}
              <div className="flex-shrink-0 text-right self-start pt-0.5">
                {isFullyFree ? (
                  <span className="text-sm font-bold text-emerald-600">€0,00</span>
                ) : (
                  <span className="text-sm font-bold text-gray-900">{formatMoney(currentPrice, currency)}</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="border-t border-gray-100 pt-4 space-y-2.5 text-sm">
        <div className="flex justify-between text-gray-500">
          <span>Subtotale</span>
          <span className="text-gray-900 font-medium">{formatMoney(subtotalCents, currency)}</span>
        </div>
        {discountCents > 0 && (
          <div className="flex justify-between text-emerald-600">
            <span className="font-medium">✨ Sconto</span>
            <span className="font-semibold">-{formatMoney(discountCents, currency)}</span>
          </div>
        )}
        <div className="flex justify-between text-gray-500">
          <span>Spedizione</span>
          {shippingToApply > 0 ? (
            <span className="text-gray-900 font-medium">{formatMoney(shippingToApply, currency)}</span>
          ) : (
            <span className="text-gray-400 text-xs italic">Inserisci indirizzo</span>
          )}
        </div>
        <div className="flex justify-between pt-3 border-t border-gray-100">
          <span className="text-base font-bold text-gray-900">Totale</span>
          {shippingToApply > 0 ? (
            <span className="text-xl font-black text-gray-900">{formatMoney(totalToPayCents, currency)}</span>
          ) : (
            <span className="text-xl font-black text-gray-900">{formatMoney(subtotalCents - discountCents, currency)}</span>
          )}
        </div>
      </div>
    </>
  )

  if (!mobile) return inner

  // Mobile accordion
  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3.5 bg-white border border-gray-100 rounded-2xl shadow-sm tap-highlight-none"
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 11H4L5 9z" />
          </svg>
          <span className="text-sm font-semibold text-gray-700">
            {open ? "Nascondi ordine" : `Mostra ordine (${cart.items.length} ${cart.items.length === 1 ? "articolo" : "articoli"})`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-black text-gray-900">{formatMoney(totalToPayCents, currency)}</span>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      <div className={`overflow-hidden transition-all duration-300 ${open ? "max-h-[800px] opacity-100 mt-2" : "max-h-0 opacity-0"}`}>
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4">
          {inner}
        </div>
      </div>
    </div>
  )
}

// ── MAIN CHECKOUT INNER ───────────────────────────────────────────────
function CheckoutInnerStripe({ cart, sessionId }: { cart: CartSessionResponse; sessionId: string }) {
  const stripe = useStripe()
  const elements = useElements()
  return <CheckoutInner cart={cart} sessionId={sessionId} gatewayType="stripe" stripe={stripe} elements={elements} />
}

function CheckoutInner({
  cart,
  sessionId,
  gatewayType = "stripe",
  airwallexConfig,
  stripe: stripeProp,
  elements: elementsProp,
}: {
  cart: CartSessionResponse
  sessionId: string
  gatewayType?: "stripe" | "airwallex"
  airwallexConfig?: { clientId: string; environment: string }
  stripe?: any
  elements?: any
}) {
  const stripe = stripeProp || null
  const elements = elementsProp || null

  const cartUrl = useMemo(() => {
    if (cart.shopDomain) return `https://${cart.shopDomain}/cart`
    return "https://notforresale.it/cart"
  }, [cart.shopDomain])

  const [customer, setCustomer] = useState<CustomerForm>({
    fullName: "",
    email: "",
    phone: "",
    address1: "",
    address2: "",
    city: "",
    postalCode: "",
    province: "",
    countryCode: "IT",
  })

  const [useDifferentBilling, setUseDifferentBilling] = useState(false)
  const [billingAddress, setBillingAddress] = useState<CustomerForm>({
    fullName: "",
    email: "",
    phone: "",
    address1: "",
    address2: "",
    city: "",
    postalCode: "",
    province: "",
    countryCode: "IT",
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [calculatedShippingCents, setCalculatedShippingCents] = useState<number>(0)
  const [isCalculatingShipping, setIsCalculatingShipping] = useState(false)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [shippingError, setShippingError] = useState<string | null>(null)
  const [expressPaymentReady, setExpressPaymentReady] = useState(false)

  const [geo, setGeo] = useState<GeoConfig>(GEO_CONFIG["IT"])

  useEffect(() => {
    fetch("/api/geo")
      .then(r => r.json())
      .then(data => {
        const config = getGeoConfig(data.country || "IT")
        setGeo(config)
        setCustomer(prev => ({
          ...prev,
          countryCode: config.countryCode,
          phone: config.phonePrefix,
        }))
        setBillingAddress(prev => ({
          ...prev,
          countryCode: config.countryCode,
        }))
      })
      .catch(() => {})
  }, [])

  const [lastCalculatedHash, setLastCalculatedHash] = useState<string>("")
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const addressInputRef = useRef<HTMLInputElement>(null)
  const autocompleteRef = useRef<any>(null)
  const scriptLoadedRef = useRef(false)
  const airwallexConfirmRef = useRef<(() => Promise<void>) | null>(null)

  const currency = (cart.currency || "EUR").toUpperCase()

  const subtotalCents = useMemo(() => {
    if (typeof cart.subtotalCents === "number") return cart.subtotalCents
    return cart.items.reduce((sum, item) => {
      const line = item.linePriceCents ?? item.priceCents ?? 0
      return sum + line
    }, 0)
  }, [cart])

  const shippingCents = calculatedShippingCents

  const discountCents = useMemo(() => {
    const shopifyTotal = typeof cart.totalCents === "number" ? cart.totalCents : subtotalCents
    const raw = subtotalCents - shopifyTotal
    return raw > 0 ? raw : 0
  }, [subtotalCents, cart.totalCents])

  const shippingToApply = calculatedShippingCents
  const totalToPayCents = subtotalCents - discountCents + shippingToApply

  const firstName = customer.fullName.split(" ")[0] || ""
  const lastName = customer.fullName.split(" ").slice(1).join(" ") || ""
  const billingFirstName = billingAddress.fullName.split(" ")[0] || ""
  const billingLastName = billingAddress.fullName.split(" ").slice(1).join(" ") || ""

  // Compute step for indicator
  const formStep = useMemo(() => {
    const hasContact = customer.email.includes("@") && customer.fullName.trim().length > 2
    const hasAddress = customer.address1.trim().length > 3 && customer.city.trim().length > 1
    if (!hasContact) return 1
    if (!hasAddress) return 2
    return 3
  }, [customer])

  // Facebook Pixel
  const pixelInitRef = useRef(false)
  useEffect(() => {
    if (!sessionId || cart.items.length === 0) return
    if (pixelInitRef.current) return
    pixelInitRef.current = true
    const storageKey = `meta_pixel_fired_initiate_${sessionId}`
    if (sessionStorage.getItem(storageKey)) return

    const eventId = `initiate_checkout_${sessionId}`
    const contentIds = cart.items.map(item => String(item.id)).filter(Boolean)
    const numItems = cart.items.reduce((sum, item) => sum + item.quantity, 0)

    const fire = () => {
      if (!(window as any).fbq) return
      sessionStorage.setItem(storageKey, "1")
      ;(window as any).fbq("track", "InitiateCheckout", {
        value: totalToPayCents / 100,
        currency,
        content_ids: contentIds,
        content_type: "product",
        num_items: numItems,
      }, { eventID: eventId })
    }

    if ((window as any).fbq) {
      fire()
    } else {
      const t = setInterval(() => {
        if (!(window as any).fbq) return
        clearInterval(t)
        fire()
      }, 100)
      setTimeout(() => clearInterval(t), 5000)
    }
  }, [sessionId, cart.items.length])

  // Google Maps Autocomplete
  useEffect(() => {
    let mounted = true
    const win = window as any

    const initAutocomplete = () => {
      if (!mounted || !addressInputRef.current) return
      if (!win.google?.maps?.places) return

      try {
        if (autocompleteRef.current) {
          win.google.maps.event.clearInstanceListeners(autocompleteRef.current)
          autocompleteRef.current = null
        }

        autocompleteRef.current = new win.google.maps.places.Autocomplete(
          addressInputRef.current,
          {
            types: ["address"],
            componentRestrictions: { country: ["it", "fr", "de", "es", "at", "be", "nl", "ch", "pt"] },
            fields: ["address_components", "formatted_address", "geometry"],
          }
        )

        autocompleteRef.current.addListener("place_changed", () => {
          if (!mounted) return
          handlePlaceSelect()
        })
      } catch (err) {
        console.error("[Autocomplete] Errore:", err)
      }
    }

    if (!win.google?.maps?.places && !scriptLoadedRef.current) {
      scriptLoadedRef.current = true
      const script = document.createElement("script")
      const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
      if (!apiKey) return

      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&language=it&callback=initGoogleMaps`
      script.async = true
      script.defer = true
      win.initGoogleMaps = () => { if (mounted) requestAnimationFrame(initAutocomplete) }
      script.onerror = () => console.error("[Autocomplete] Errore caricamento")
      document.head.appendChild(script)
    } else if (win.google?.maps?.places) {
      initAutocomplete()
    }

    return () => {
      mounted = false
      if (autocompleteRef.current && win.google?.maps?.event) {
        try { win.google.maps.event.clearInstanceListeners(autocompleteRef.current) } catch (e) {}
      }
    }
  }, [])

  function handlePlaceSelect() {
    const place = autocompleteRef.current?.getPlace()
    if (!place || !place.address_components) return

    let street = "", streetNumber = "", city = "", province = "", postalCode = "", country = ""

    place.address_components.forEach((component: any) => {
      const types = component.types
      if (types.includes("route")) street = component.long_name
      if (types.includes("street_number")) streetNumber = component.long_name
      if (types.includes("locality")) city = component.long_name
      if (types.includes("postal_town") && !city) city = component.long_name
      if (types.includes("administrative_area_level_3") && !city) city = component.long_name
      if (types.includes("administrative_area_level_2")) province = component.short_name
      if (types.includes("administrative_area_level_1") && !province) province = component.short_name
      if (types.includes("postal_code")) postalCode = component.long_name
      if (types.includes("country")) country = component.short_name
    })

    const fullAddress = streetNumber ? `${street} ${streetNumber}` : street
    setCustomer(prev => ({
      ...prev,
      address1: fullAddress || prev.address1,
      city: city || prev.city,
      postalCode: postalCode || prev.postalCode,
      province: province || prev.province,
      countryCode: country || prev.countryCode,
    }))
  }

  function handleChange(e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target
    setCustomer(prev => ({ ...prev, [name]: value }))
  }

  function isFormValid() {
    const shippingValid =
      customer.fullName.trim().length > 2 &&
      customer.email.trim().includes("@") &&
      customer.email.trim().length > 5 &&
      customer.phone.trim().length > 8 &&
      customer.address1.trim().length > 3 &&
      customer.city.trim().length > 1 &&
      customer.postalCode.trim().length > 2 &&
      customer.province.trim().length > 1 &&
      customer.countryCode.trim().length >= 2

    if (!useDifferentBilling) return shippingValid

    const billingValid =
      billingAddress.fullName.trim().length > 2 &&
      billingAddress.address1.trim().length > 3 &&
      billingAddress.city.trim().length > 1 &&
      billingAddress.postalCode.trim().length > 2 &&
      billingAddress.province.trim().length > 1 &&
      billingAddress.countryCode.trim().length >= 2

    return shippingValid && billingValid
  }

  useEffect(() => {
    async function calculateShipping() {
      const formHash = JSON.stringify({
        fullName: customer.fullName.trim(),
        email: customer.email.trim(),
        phone: customer.phone.trim(),
        address1: customer.address1.trim(),
        city: customer.city.trim(),
        postalCode: customer.postalCode.trim(),
        province: customer.province.trim(),
        countryCode: customer.countryCode,
        billingFullName: useDifferentBilling ? billingAddress.fullName.trim() : "",
        billingAddress1: useDifferentBilling ? billingAddress.address1.trim() : "",
        subtotal: subtotalCents,
        discount: discountCents,
      })

      if (!isFormValid()) {
        setCalculatedShippingCents(0)
        setClientSecret(null)
        setShippingError(null)
        setLastCalculatedHash("")
        return
      }

      if (formHash === lastCalculatedHash && clientSecret) return

      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)

      debounceTimerRef.current = setTimeout(async () => {
        setIsCalculatingShipping(true)
        setError(null)
        setShippingError(null)

        try {
          // Chiedi a Shopify le tariffe di spedizione reali
          const shippingRes = await fetch("/api/calculate-shipping", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId,
              destination: {
                address1: customer.address1,
                city: customer.city,
                province: customer.province,
                postalCode: customer.postalCode,
                countryCode: customer.countryCode || "IT",
              },
            }),
          })
          const shippingData = await shippingRes.json()
          const realShippingCents = shippingRes.ok && shippingData.shippingCents ? shippingData.shippingCents : 590
          setCalculatedShippingCents(realShippingCents)

          const shopifyTotal = typeof cart.totalCents === "number" ? cart.totalCents : subtotalCents
          const currentDiscountCents = subtotalCents - shopifyTotal
          const finalDiscountCents = currentDiscountCents > 0 ? currentDiscountCents : 0
          const newTotalCents = subtotalCents - finalDiscountCents + realShippingCents

          const piRes = await fetch("/api/payment-intent", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId,
              amountCents: newTotalCents,
              customer: {
                fullName: customer.fullName,
                email: customer.email,
                phone: customer.phone,
                address1: customer.address1,
                address2: customer.address2,
                city: customer.city,
                postalCode: customer.postalCode,
                province: customer.province,
                countryCode: customer.countryCode || "IT",
              },
            }),
          })

          const piData = await piRes.json()

          if (!piRes.ok || !piData.clientSecret) {
            throw new Error(piData.error || "Errore creazione pagamento")
          }

          setClientSecret(piData.clientSecret)
          setLastCalculatedHash(formHash)
          setIsCalculatingShipping(false)
        } catch (err: any) {
          console.error("Errore creazione payment:", err)
          setShippingError(err.message || "Errore nel calcolo del totale")
          setIsCalculatingShipping(false)
        }
      }, 1000)
    }

    calculateShipping()

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    }
  }, [
    customer.fullName, customer.email, customer.phone,
    customer.address1, customer.address2, customer.city,
    customer.postalCode, customer.province, customer.countryCode,
    billingAddress.fullName, billingAddress.address1, billingAddress.city,
    billingAddress.postalCode, billingAddress.province, billingAddress.countryCode,
    useDifferentBilling, sessionId, subtotalCents, cart.totalCents,
    clientSecret, lastCalculatedHash, discountCents,
  ])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (!isFormValid()) {
      setError("Compila tutti i campi obbligatori")
      return
    }

    // Airwallex: conferma tramite card element
    if (gatewayType === "airwallex") {
      if (!airwallexConfirmRef.current) {
        setError("Elemento carta non pronto")
        return
      }
      setLoading(true)
      try {
        await airwallexConfirmRef.current()
        // onSuccess è gestito dall'event listener in AirwallexPayment
      } catch (err: any) {
        setError(err?.message || "Errore nel pagamento")
        setLoading(false)
      }
      return
    }

    if (!stripe || !elements) {
      setError("Stripe non pronto")
      return
    }

    if (!clientSecret) {
      setError("Payment Intent non creato")
      return
    }

    try {
      setLoading(true)

      const { error: submitError } = await elements.submit()
      if (submitError) {
        setError(submitError.message || "Errore nella validazione")
        setLoading(false)
        return
      }

      const finalBillingAddress = useDifferentBilling ? billingAddress : customer

      const { error: stripeError } = await stripe.confirmPayment({
        elements,
        clientSecret,
        confirmParams: {
          return_url: `${window.location.origin}/thank-you?sessionId=${sessionId}`,
          payment_method_data: {
            billing_details: {
              name: finalBillingAddress.fullName || customer.fullName,
              email: customer.email,
              phone: finalBillingAddress.phone || customer.phone,
              address: {
                line1: finalBillingAddress.address1,
                line2: finalBillingAddress.address2 || undefined,
                city: finalBillingAddress.city,
                postal_code: finalBillingAddress.postalCode,
                state: finalBillingAddress.province,
                country: finalBillingAddress.countryCode || "IT",
              },
            },
          },
        },
        redirect: "if_required",
      })

      if (stripeError) {
        setError(stripeError.message || "Pagamento non riuscito")
        setLoading(false)
        return
      }

      setSuccess(true)
      setLoading(false)
      setTimeout(() => {
        window.location.href = `/thank-you?sessionId=${sessionId}`
      }, 2000)
    } catch (err: any) {
      setError(err.message || "Errore imprevisto")
      setLoading(false)
    }
  }

  // ── Apple Pay / Google Pay express confirm ────────────────────────
  // ── Apple Pay / Google Pay express confirm ────────────────────────
  // Flusso corretto per ExpressCheckoutElement:
  // 1. L'utente apre il sheet Apple Pay → vede i suoi dati salvati
  // 2. Conferma con Touch ID / Face ID → scatta onConfirm con TUTTI i dati
  // 3. Noi creiamo il PI con quei dati e confermiamo il pagamento
  // L'utente non deve compilare NULLA nel form.
  async function handleExpressConfirm(event: any) {
    if (!stripe || !elements) return

    // event.shippingAddress = indirizzo di spedizione scelto nel wallet Apple Pay
    // event.billingDetails  = dati carta/contatto del wallet
    const sd = event.shippingAddress  // { name?, address: { line1, city, postal_code, state, country } }
    const bd = event.billingDetails   // { name?, email?, phone?, address? }

    // Costruisci i dati cliente dal wallet — priorità a shipping (destinatario)
    const name        = sd?.name          || bd?.name          || ""
    const email       = bd?.email         || ""
    const phone       = bd?.phone         || ""
    const address1    = sd?.address?.line1        || bd?.address?.line1        || ""
    const address2    = sd?.address?.line2        || bd?.address?.line2        || ""
    const city        = sd?.address?.city         || bd?.address?.city         || ""
    const postalCode  = sd?.address?.postal_code  || bd?.address?.postal_code  || ""
    const province    = sd?.address?.state        || bd?.address?.state        || ""
    const countryCode = sd?.address?.country      || bd?.address?.country      || "IT"

    // Calcola il totale con la shipping rate selezionata nel payment sheet
    const selectedShippingCents = event.shippingRate?.amount ?? 590
    const expressTotal = subtotalCents - discountCents + selectedShippingCents

    console.log("[ApplePay] ✅ Dati ricevuti:", { name, email, phone, address1, city, postalCode, province, countryCode, shippingCents: selectedShippingCents })

    try {
      // Crea il PI con i dati reali del wallet
      const piRes = await fetch("/api/payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          amountCents: expressTotal,
          customer: { fullName: name, email, phone, address1, address2, city, postalCode, province, countryCode },
          expressCheckout: true,
          paymentMethodType: event.expressPaymentType || "express",
        }),
      })
      const piData = await piRes.json()

      if (!piRes.ok || !piData.clientSecret) {
        console.error("[ApplePay] ❌ Errore creazione PI:", piData.error)
        event.paymentFailed?.({ reason: "fail" })
        return
      }

      setClientSecret(piData.clientSecret)

      // ✅ Usa stripe.confirmPayment con il clientSecret appena creato.
      // NON passare payment_method_data manualmente: l'Elements gestisce
      // internamente il token Apple Pay criptato di questo session.
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        clientSecret: piData.clientSecret,
        confirmParams: {
          return_url: `${window.location.origin}/thank-you?sessionId=${sessionId}`,
        },
        redirect: "if_required",
      })

      if (error) {
        console.error("[ApplePay] ❌ Errore pagamento:", error.message)
        event.paymentFailed?.({ reason: "fail" })
      } else if (paymentIntent && paymentIntent.status === "succeeded") {
        window.location.href = `/thank-you?sessionId=${sessionId}`
      }
    } catch (err) {
      console.error("[ApplePay] ❌ Eccezione:", err)
      event.paymentFailed?.({ reason: "fail" })
    }
  }

  return (
    <>
      {/* Facebook Pixel */}
      <Script id="facebook-pixel" strategy="afterInteractive">
        {`
          !function(f,b,e,v,n,t,s)
          {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s)}(window, document,'script',
          'https://connect.facebook.net/en_US/fbevents.js');
          fbq('init', '3891846021132542');
          fbq('track', 'PageView');
        `}
      </Script>
      <noscript>
        <img height="1" width="1" style={{ display: "none" }}
          src="https://www.facebook.com/tr?id=3891846021132542&ev=PageView&noscript=1" />
      </noscript>

      <style jsx global>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
          background: #f5f5f7;
          color: #1d1d1f;
          -webkit-font-smoothing: antialiased;
          -webkit-text-size-adjust: 100%;
        }

        input, select, button, textarea {
          font-family: inherit;
          -webkit-appearance: none;
          appearance: none;
        }

        /* Prevent iOS zoom on input focus */
        @media (max-width: 768px) {
          input, select, textarea {
            font-size: 16px !important;
          }
        }

        .tap-highlight-none {
          -webkit-tap-highlight-color: transparent;
        }

        /* Google Places autocomplete */
        .pac-container {
          background: #fff !important;
          border: 1px solid #e5e7eb !important;
          border-radius: 16px !important;
          box-shadow: 0 20px 40px rgba(0,0,0,0.12) !important;
          margin-top: 6px !important;
          padding: 6px !important;
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif !important;
          z-index: 9999 !important;
          overflow: hidden !important;
        }
        .pac-item {
          padding: 10px 14px !important;
          cursor: pointer !important;
          border: none !important;
          border-radius: 10px !important;
          font-size: 14px !important;
          color: #1d1d1f !important;
          transition: background 0.15s !important;
        }
        .pac-item:hover { background: #f5f5f7 !important; }
        .pac-icon { display: none !important; }
        .pac-item-query { font-weight: 600 !important; color: #1d1d1f !important; }

        /* Stripe Elements override */
        .StripeElement {
          border-radius: 12px !important;
        }

        /* Express checkout container */
        #express-checkout-element iframe {
          border-radius: 14px !important;
        }

        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up {
          animation: fadeInUp 0.4s ease forwards;
        }

        @keyframes pulse-ring {
          0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.3); }
          70% { box-shadow: 0 0 0 8px rgba(16, 185, 129, 0); }
          100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }
        .pulse-green { animation: pulse-ring 2s infinite; }
      `}</style>

      {/* ── HEADER ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-xl border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <a href={cartUrl} className="flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors tap-highlight-none">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span className="text-xs font-medium hidden sm:inline">Carrello</span>
          </a>

          <img
            src="https://cdn.shopify.com/s/files/1/0899/2188/0330/files/logo_checkify_d8a640c7-98fe-4943-85c6-5d1a633416cf.png?v=1761832152"
            alt="Logo"
            className="h-12 object-contain drop-shadow-sm"
            style={{ maxWidth: "200px" }}
          />

          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 rounded-full border border-emerald-100">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 pulse-green" />
            <span className="text-[11px] font-semibold text-emerald-700">Sicuro</span>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-5 pb-24 lg:pb-8">
        <div className="lg:grid lg:grid-cols-[1fr_380px] lg:gap-8 lg:items-start">

          {/* ── LEFT COLUMN ──────────────────────────────────────────── */}
          <div>

            {/* Mobile Order Summary */}
            <div className="lg:hidden">
              <OrderSummary
                cart={cart}
                subtotalCents={subtotalCents}
                discountCents={discountCents}
                shippingToApply={shippingToApply}
                totalToPayCents={totalToPayCents}
                currency={currency}
                mobile
              />
            </div>

            {/* Step Indicator */}
            <StepIndicator currentStep={formStep} />

            {/* ── EXPRESS CHECKOUT AIRWALLEX (Apple Pay / Google Pay) ──────── */}
            {gatewayType === "airwallex" && airwallexConfig && (
              <AirwallexExpressCheckout
                sessionId={sessionId}
                totalCents={totalToPayCents}
                currency={currency}
                environment={airwallexConfig.environment as "demo" | "prod"}
                onSuccess={() => {
                  window.location.href = `/thank-you?sessionId=${sessionId}`
                }}
                onError={(msg) => setError(msg)}
              />
            )}

            {/* ── EXPRESS CHECKOUT (Apple Pay / Google Pay) — solo Stripe ─── */}
            {gatewayType === "stripe" && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-4 animate-fade-in-up">
              <div className="px-5 pt-5 pb-3">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest text-center mb-3">
                  Pagamento rapido
                </p>
                <ExpressCheckoutElement
                  id="express-checkout-element"
                  onConfirm={handleExpressConfirm}
                  onClick={(event) => {
                    event.resolve({
                      phoneNumberRequired: true,
                      shippingAddressRequired: true,
                      emailRequired: true,
                      shippingRates: [
                        {
                          id: "standard",
                          displayName: "Spedizione Standard",
                          amount: 590,
                        },
                      ],
                    })
                  }}
                  onShippingAddressChange={async (event) => {
                    try {
                      const addr = event.address
                      const res = await fetch("/api/calculate-shipping", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          sessionId,
                          destination: {
                            city: addr.city || "",
                            province: addr.state || "",
                            postalCode: addr.postal_code || "",
                            countryCode: addr.country || "IT",
                          },
                        }),
                      })
                      const data = await res.json()
                      if (res.ok && data.availableRates?.length > 0) {
                        event.resolve({
                          shippingRates: data.availableRates.map((rate: any) => ({
                            id: rate.handle,
                            displayName: rate.title,
                            amount: rate.priceCents,
                          })),
                        })
                      } else {
                        event.resolve({
                          shippingRates: [{
                            id: "standard",
                            displayName: data.method || "Spedizione Standard",
                            amount: data.shippingCents || 590,
                          }],
                        })
                      }
                    } catch {
                      event.resolve({
                        shippingRates: [{
                          id: "standard",
                          displayName: "Spedizione Standard",
                          amount: 590,
                        }],
                      })
                    }
                  }}
                  onReady={(event) => {
                    const available = event.availablePaymentMethods
                    setExpressPaymentReady(!!(available?.applePay || available?.googlePay))
                  }}
                  options={{
                    buttonType: {
                      applePay: "buy",
                      googlePay: "buy",
                    },
                    buttonTheme: {
                      applePay: "black",
                      googlePay: "black",
                    },
                    layout: {
                      maxColumns: 1,
                      maxRows: 3,
                      overflow: "auto",
                    },
                  }}
                />
              </div>

              <div className="flex items-center gap-3 px-5 pb-5">
                <div className="flex-1 h-px bg-gray-100" />
                <span className="text-[11px] font-medium text-gray-400">oppure inserisci i tuoi dati</span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>
            </div>
            )}

            {/* ── FORM ─────────────────────────────────────────────────── */}
            <form onSubmit={handleSubmit} noValidate>

              {/* CONTATTI */}
              <SectionCard title={geo.labels.contacts}>
                <div className="space-y-3">
                  <FloatingInput
                    label={geo.labels.email}
                    type="email"
                    name="email"
                    value={customer.email}
                    onChange={handleChange}
                    placeholder="mario@esempio.com"
                    required
                    autoComplete="email"
                  />
                  <div className="flex items-start gap-2 mt-2">
                    <input
                      type="checkbox"
                      id="emailUpdates"
                      className="w-4 h-4 mt-0.5 flex-shrink-0 rounded accent-gray-900"
                    />
                    <label htmlFor="emailUpdates" className="text-xs text-gray-500 leading-relaxed cursor-pointer">
                      {geo.labels.emailUpdates}
                    </label>
                  </div>
                </div>
              </SectionCard>

              {/* CONSEGNA */}
              <SectionCard title={geo.labels.delivery}>
                <div className="space-y-3">
                  <FloatingSelect
                    label={geo.labels.country}
                    name="countryCode"
                    value={customer.countryCode}
                    onChange={handleChange}
                    required
                  >
                    <option value="IT">🇮🇹 Italia</option>
                    <option value="FR">🇫🇷 Francia</option>
                    <option value="DE">🇩🇪 Germania</option>
                    <option value="ES">🇪🇸 Spagna</option>
                    <option value="PT">🇵🇹 Portogallo</option>
                    <option value="NL">🇳🇱 Paesi Bassi</option>
                  </FloatingSelect>

                  <div className="grid grid-cols-2 gap-3">
                    <FloatingInput
                      label={geo.labels.firstName}
                      type="text"
                      value={firstName}
                      onChange={(e) => setCustomer(prev => ({ ...prev, fullName: `${e.target.value} ${lastName}`.trim() }))}
                      placeholder="Mario"
                      required
                      autoComplete="given-name"
                    />
                    <FloatingInput
                      label={geo.labels.lastName}
                      type="text"
                      value={lastName}
                      onChange={(e) => setCustomer(prev => ({ ...prev, fullName: `${firstName} ${e.target.value}`.trim() }))}
                      placeholder="Rossi"
                      required
                      autoComplete="family-name"
                    />
                  </div>

                  <FloatingInput
                    label={geo.labels.address}
                    type="text"
                    name="address1"
                    value={customer.address1}
                    onChange={handleChange}
                    placeholder="Via Roma 123"
                    required
                    autoComplete="address-line1"
                    inputRef={addressInputRef}
                  />

                  <FloatingInput
                    label={geo.labels.address2}
                    type="text"
                    name="address2"
                    value={customer.address2}
                    onChange={handleChange}
                    placeholder="Scala B, piano 3"
                    autoComplete="address-line2"
                  />

                  <div className="grid grid-cols-5 gap-3">
                    <div className="col-span-2">
                      <FloatingInput
                        label={geo.labels.postalCode}
                        type="text"
                        name="postalCode"
                        value={customer.postalCode}
                        onChange={handleChange}
                        placeholder="00100"
                        required
                        autoComplete="postal-code"
                      />
                    </div>
                    <div className="col-span-3">
                      <FloatingInput
                        label={geo.labels.city}
                        type="text"
                        name="city"
                        value={customer.city}
                        onChange={handleChange}
                        placeholder="Roma"
                        required
                        autoComplete="address-level2"
                      />
                    </div>
                  </div>

                  <FloatingInput
                    label={geo.labels.province}
                    type="text"
                    name="province"
                    value={customer.province}
                    onChange={handleChange}
                    placeholder="RM"
                    required
                    autoComplete="address-level1"
                  />

                  <FloatingInput
                    label={geo.labels.phone}
                    type="tel"
                    name="phone"
                    value={customer.phone}
                    onChange={handleChange}
                    placeholder="+39 333 123 4567"
                    required
                    autoComplete="tel"
                  />
                </div>
              </SectionCard>

              {/* METODO DI SPEDIZIONE */}
              {isFormValid() && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-4 animate-fade-in-up">
                  <div className="px-5 pt-5 pb-3 border-b border-gray-50">
                    <h2 className="text-sm font-semibold text-gray-900 tracking-wide uppercase">{geo.labels.shippingMethod}</h2>
                  </div>
                  <div className="p-5">
                    <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-xl border border-blue-100">
                      <div className="w-5 h-5 rounded-full bg-gray-900 border-2 border-gray-900 flex items-center justify-center flex-shrink-0">
                        <div className="w-2 h-2 rounded-full bg-white" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-gray-900">BRT Express</p>
                        <p className="text-xs text-gray-500 mt-0.5">Consegna in 24/48 ore lavorative</p>
                      </div>
                      <span className="text-sm font-bold text-gray-900">€5,90</span>
                    </div>

                    {/* Social proof */}
                    <div className="mt-3 flex items-center gap-2 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                      <div className="flex -space-x-2">
                        {["M", "L", "A"].map((l, i) => (
                          <div key={i} className={`w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-white text-[10px] font-bold shadow-sm ${["bg-blue-500", "bg-purple-500", "bg-pink-500"][i]}`}>{l}</div>
                        ))}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-emerald-800">Oltre 2.000+ clienti soddisfatti</p>
                        <div className="flex gap-0.5 mt-0.5">
                          {[...Array(5)].map((_, i) => (
                            <svg key={i} className="w-3 h-3 text-amber-400 fill-current" viewBox="0 0 20 20">
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                          ))}
                          <span className="text-[10px] text-emerald-700 font-semibold ml-1">4.9 · Ultima vendita 3min fa</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* INDIRIZZO FATTURAZIONE DIVERSO */}
              <div className="flex items-center gap-3 px-4 py-3.5 bg-white rounded-2xl border border-gray-100 shadow-sm mb-4 cursor-pointer tap-highlight-none"
                onClick={() => setUseDifferentBilling(v => !v)}>
                <div className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-all flex-shrink-0 ${useDifferentBilling ? "bg-gray-900 border-gray-900" : "border-gray-300"}`}>
                  {useDifferentBilling && (
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
                <span className="text-sm font-medium text-gray-700">Usa un indirizzo di fatturazione diverso</span>
              </div>

              {useDifferentBilling && (
                <SectionCard title={geo.labels.billing}>
                  <div className="space-y-3">
                    <FloatingSelect
                      label={geo.labels.country}
                      value={billingAddress.countryCode}
                      onChange={(e) => setBillingAddress(prev => ({ ...prev, countryCode: e.target.value }))}
                      required
                    >
                      <option value="IT">🇮🇹 Italia</option>
                      <option value="FR">🇫🇷 Francia</option>
                      <option value="DE">🇩🇪 Germania</option>
                      <option value="ES">🇪🇸 Spagna</option>
                    </FloatingSelect>

                    <div className="grid grid-cols-2 gap-3">
                      <FloatingInput
                        label={geo.labels.firstName}
                        type="text"
                        value={billingFirstName}
                        onChange={(e) => setBillingAddress(prev => ({ ...prev, fullName: `${e.target.value} ${billingLastName}`.trim() }))}
                        placeholder="Mario"
                        required
                      />
                      <FloatingInput
                        label={geo.labels.lastName}
                        type="text"
                        value={billingLastName}
                        onChange={(e) => setBillingAddress(prev => ({ ...prev, fullName: `${billingFirstName} ${e.target.value}`.trim() }))}
                        placeholder="Rossi"
                        required
                      />
                    </div>

                    <FloatingInput
                      label={geo.labels.address}
                      type="text"
                      value={billingAddress.address1}
                      onChange={(e) => setBillingAddress(prev => ({ ...prev, address1: e.target.value }))}
                      placeholder="Via Roma 123"
                      required
                    />

                    <div className="grid grid-cols-5 gap-3">
                      <div className="col-span-2">
                        <FloatingInput
                          label={geo.labels.postalCode}
                          type="text"
                          value={billingAddress.postalCode}
                          onChange={(e) => setBillingAddress(prev => ({ ...prev, postalCode: e.target.value }))}
                          placeholder="00100"
                          required
                        />
                      </div>
                      <div className="col-span-3">
                        <FloatingInput
                          label={geo.labels.city}
                          type="text"
                          value={billingAddress.city}
                          onChange={(e) => setBillingAddress(prev => ({ ...prev, city: e.target.value }))}
                          placeholder="Roma"
                          required
                        />
                      </div>
                    </div>

                    <FloatingInput
                      label={geo.labels.province}
                      type="text"
                      value={billingAddress.province}
                      onChange={(e) => setBillingAddress(prev => ({ ...prev, province: e.target.value }))}
                      placeholder="RM"
                      required
                    />
                  </div>
                </SectionCard>
              )}

              {/* PAGAMENTO */}
              <SectionCard title={geo.labels.payment}>
                {/* Payment method icons */}
                <div className="flex items-center gap-2 mb-4 flex-wrap">
                  {[
                    { text: "VISA", color: "#1A1F71" },
                    { text: "MC", isIcon: true },
                    { text: "AMEX", color: "#006FCF" },
                  ].map((card, i) => (
                    <div key={i} className="h-7 px-2.5 bg-white border border-gray-200 rounded-lg flex items-center gap-1 shadow-xs">
                      {card.isIcon ? (
                        <>
                          <span className="text-[10px] font-black" style={{ color: "#EB001B" }}>●</span>
                          <span className="text-[10px] font-black -ml-1.5" style={{ color: "#FF5F00" }}>●</span>
                        </>
                      ) : (
                        <span className="text-[11px] font-black" style={{ color: card.color }}>{card.text}</span>
                      )}
                    </div>
                  ))}
                  <div className="ml-auto flex items-center gap-1.5 text-[11px] text-gray-400">
                    <svg className="w-3.5 h-3.5 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                    </svg>
                    <span className="font-medium">SSL · 3D Secure</span>
                  </div>
                </div>

                {isCalculatingShipping && (
                  <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-100 rounded-xl mb-4">
                    <svg className="animate-spin h-4 w-4 text-blue-500 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <p className="text-sm text-blue-700 font-medium">Preparazione pagamento...</p>
                  </div>
                )}

                {shippingError && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-xl mb-4">
                    <p className="text-sm text-red-700">{shippingError}</p>
                  </div>
                )}

                {/* ── AIRWALLEX CARD ELEMENT ────────────────────────── */}
                {gatewayType === "airwallex" && airwallexConfig && !isCalculatingShipping && (
                  <div className="border border-gray-100 rounded-xl overflow-hidden bg-gray-50/50 p-4 mb-4">
                    <AirwallexPayment
                      sessionId={sessionId}
                      totalCents={totalToPayCents}
                      environment={airwallexConfig.environment as "demo" | "prod"}
                      customer={customer}
                      onSuccess={() => {
                        window.location.href = `/thank-you?sessionId=${sessionId}`
                      }}
                      onError={(msg) => { setError(msg); setLoading(false) }}
                      onConfirmReady={(fn) => { airwallexConfirmRef.current = fn }}
                    />
                  </div>
                )}

                {/* ── STRIPE PAYMENT ELEMENT ─────────────────────────── */}
                {gatewayType === "stripe" && clientSecret && !isCalculatingShipping && (
                  <div className="border border-gray-100 rounded-xl overflow-hidden bg-gray-50/50 p-4 mb-4">
                    <PaymentElement
                      options={{
                        layout: {
                          type: "accordion",
                          defaultCollapsed: false,
                          radios: false,
                          spacedAccordionItems: false,
                        },
                        paymentMethodOrder: ["card"],
                        fields: {
                          billingDetails: {
                            name: "auto",
                            email: "never",
                            phone: "never",
                            address: "never",
                          },
                        },
                        defaultValues: {
                          billingDetails: {
                            name: useDifferentBilling ? billingAddress.fullName : customer.fullName,
                          },
                        },
                      }}
                    />
                  </div>
                )}

                {gatewayType === "stripe" && !clientSecret && !isCalculatingShipping && (
                  <div className="p-5 bg-gray-50 rounded-xl border border-dashed border-gray-200 text-center">
                    <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                    <p className="text-sm text-gray-400 font-medium">Compila tutti i campi per sbloccare il pagamento</p>
                  </div>
                )}

                {/* Error */}
                {error && (
                  <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl mt-4">
                    <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    <p className="text-sm text-red-700 font-medium">{error}</p>
                  </div>
                )}

                {success && (
                  <div className="flex items-start gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl mt-4">
                    <svg className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <p className="text-sm text-emerald-700 font-semibold">Pagamento completato! Reindirizzamento...</p>
                  </div>
                )}
              </SectionCard>

              {/* CTA BUTTON */}
              <button
                type="submit"
                disabled={
                  loading || isCalculatingShipping ||
                  (gatewayType === "stripe" && (!stripe || !elements || !clientSecret))
                }
                className="w-full py-4 px-6 text-base font-semibold text-white rounded-2xl transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: loading || (gatewayType === "stripe" && !clientSecret)
                    ? "#9ca3af"
                    : "linear-gradient(135deg, #1d1d1f 0%, #3d3d3f 100%)",
                  boxShadow: loading || (gatewayType === "stripe" && !clientSecret) ? "none" : "0 4px 20px rgba(0,0,0,0.2)",
                }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Elaborazione...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                    </svg>
                    {gatewayType === "airwallex"
                      ? `Concludi il tuo ordine · ${formatMoney(totalToPayCents, currency)}`
                      : `${geo.labels.pay} · ${formatMoney(totalToPayCents, currency)}`}
                  </span>
                )}
              </button>

              {/* Post-CTA trust */}
              <div className="mt-4 space-y-2.5">
                {[
                  { icon: "✓", color: "text-emerald-600", title: "Garanzia 14 giorni", desc: "Reso gratuito, rimborso completo garantito" },
                  { icon: "🚚", color: "text-blue-600", title: "Spedizione BRT Tracciata", desc: "Tracking via email in tempo reale" },
                  { icon: "📞", color: "text-purple-600", title: "Assistenza 7/7", desc: "Supporto clienti via email o chat" },
                ].map(({ icon, color, title, desc }) => (
                  <div key={title} className="flex items-start gap-3 p-3 bg-white rounded-xl border border-gray-100 shadow-xs">
                    <span className={`text-base flex-shrink-0 ${color}`}>{icon}</span>
                    <div>
                      <p className="text-xs font-semibold text-gray-800">{title}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-center text-[11px] text-gray-400 mt-4 flex items-center justify-center gap-1">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
                {gatewayType === "airwallex"
                  ? "Crittografia SSL 256-bit · Powered by Airwallex · PCI DSS Level 1"
                  : "Crittografia SSL 256-bit · Powered by Stripe · PCI DSS Level 1"}
              </p>
            </form>
          </div>

          {/* ── RIGHT COLUMN (desktop) ─────────────────────────────── */}
          <div className="hidden lg:block">
            <div className="sticky top-20">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-5">Riepilogo ordine</h3>
                <OrderSummary
                  cart={cart}
                  subtotalCents={subtotalCents}
                  discountCents={discountCents}
                  shippingToApply={shippingToApply}
                  totalToPayCents={totalToPayCents}
                  currency={currency}
                />
              </div>

              <TrustBadges />

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-sm font-semibold text-gray-700">Metodi accettati</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {[
                    <span key="visa" className="text-xs font-black text-[#1A1F71]">VISA</span>,
                    <><span key="mc1" className="text-xs font-black text-[#EB001B]">●</span><span key="mc2" className="text-xs font-black text-[#FF5F00] -ml-1">●</span></>,
                    <span key="amex" className="text-xs font-black text-[#006FCF]">AMEX</span>,
                    <span key="apple" className="text-[11px] font-bold text-gray-800"> Pay</span>,
                    <span key="google" className="text-[11px] font-bold"><span className="text-blue-500">G</span><span className="text-red-500">o</span><span className="text-amber-500">o</span><span className="text-blue-500">g</span><span className="text-green-500">l</span><span className="text-red-500">e</span> Pay</span>,
                  ].map((el, i) => (
                    <div key={i} className="h-7 px-2.5 bg-gray-50 border border-gray-200 rounded-lg flex items-center gap-0.5 shadow-xs">
                      {el}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── MOBILE STICKY FOOTER ───────────────────────────────────────── */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-xl border-t border-gray-100 px-4 py-3 safe-bottom">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-500 font-medium">Totale ordine</span>
          <span className="text-base font-black text-gray-900">{formatMoney(totalToPayCents, currency)}</span>
        </div>
        <TrustBadges />
      </div>
    </>
  )
}

// ── PAGE WRAPPER ──────────────────────────────────────────────────────
function CheckoutPageContent() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get("sessionId") || ""

  const [cart, setCart] = useState<CartSessionResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null)
  const [totalCents, setTotalCents] = useState(1000)
  const [currency, setCurrency] = useState("eur")
  const [gatewayType, setGatewayType] = useState<"stripe" | "airwallex">("stripe")
  const [airwallexConfig, setAirwallexConfig] = useState<{ clientId: string; environment: string } | null>(null)

  useEffect(() => {
    async function load() {
      if (!sessionId) {
        setError("Sessione non valida: manca il sessionId.")
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError(null)

        // Fetch cart e gateway-status in parallelo
        const [res, pkRes] = await Promise.all([
          fetch(`/api/cart-session?sessionId=${encodeURIComponent(sessionId)}`),
          fetch("/api/stripe-status"),
        ])

        const data: CartSessionResponse & { error?: string; gatewayType?: string } = await res.json()

        if (!res.ok || (data as any).error) {
          setError(data.error || "Errore nel recupero del carrello.")
          setLoading(false)
          return
        }

        setCart(data)

        // Compute total for Elements
        const subtotal = typeof data.subtotalCents === "number"
          ? data.subtotalCents
          : data.items.reduce((s, i) => s + (i.linePriceCents ?? i.priceCents ?? 0), 0)
        const shopifyTotal = typeof data.totalCents === "number" ? data.totalCents : subtotal
        const discount = Math.max(0, subtotal - shopifyTotal)
        const total = subtotal - discount + 590 // stima iniziale, verrà ricalcolato con shipping reale
        setTotalCents(total)
        setCurrency((data.currency || "eur").toLowerCase())

        try {
          if (!pkRes.ok) throw new Error("API gateway-status non disponibile")
          const pkData = await pkRes.json()

          if (pkData.gatewayType === "airwallex") {
            setGatewayType("airwallex")
            setAirwallexConfig({
              clientId: pkData.clientId,
              environment: pkData.environment,
            })
          } else if (pkData.publishableKey) {
            setGatewayType("stripe")
            setStripePromise(loadStripe(pkData.publishableKey))
          } else {
            throw new Error("Configurazione gateway non valida")
          }
        } catch (err) {
          setError("Impossibile inizializzare il sistema di pagamento.")
          setLoading(false)
          return
        }

        setLoading(false)
      } catch (err: any) {
        setError(err?.message || "Errore imprevisto nel caricamento.")
        setLoading(false)
      }
    }

    load()
  }, [sessionId])

  if (loading || (gatewayType === "stripe" && !stripePromise)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 mx-auto mb-4 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500 font-medium">Caricamento checkout...</p>
        </div>
      </div>
    )
  }

  if (error || !cart) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-sm w-full text-center p-8 bg-white rounded-2xl shadow-sm border border-gray-100">
          <div className="w-14 h-14 mx-auto mb-4 bg-red-50 rounded-full flex items-center justify-center">
            <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-gray-900 mb-2">Impossibile caricare il checkout</h1>
          <p className="text-sm text-gray-500 mb-1">{error}</p>
          <p className="text-xs text-gray-400">Ritorna al sito e riprova ad aprire il checkout.</p>
        </div>
      </div>
    )
  }

  const elementsOptions = {
    mode: "payment" as const,
    amount: totalCents,
    currency,
    // ✅ FIX: rimuovere paymentMethodTypes abilita automatic payment methods
    // che include Apple Pay, Google Pay e carta
    appearance: {
      theme: "stripe" as const,
      variables: {
        colorPrimary: "#1d1d1f",
        colorBackground: "#ffffff",
        colorText: "#1d1d1f",
        colorDanger: "#ef4444",
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif',
        spacingUnit: "4px",
        borderRadius: "10px",
        fontSizeBase: "16px",
      },

    },
  }

  // ─── AIRWALLEX ─────────────────────────────────────────────────────────────
  if (gatewayType === "airwallex" && airwallexConfig) {
    return (
      <CheckoutInner
        cart={cart}
        sessionId={sessionId}
        gatewayType="airwallex"
        airwallexConfig={airwallexConfig}
      />
    )
  }

  // ─── STRIPE ───────────────────────────────────────────────────────────────
  return (
    <Elements stripe={stripePromise} options={elementsOptions}>
      <CheckoutInnerStripe cart={cart} sessionId={sessionId} />
    </Elements>
  )
}

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="w-10 h-10 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <CheckoutPageContent />
    </Suspense>
  )
}