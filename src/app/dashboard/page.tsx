"use client"

import { useEffect, useState, useCallback } from "react"

// ─── TIPI (identici all'originale funzionante) ────────────────────────────────

type Purchase = {
  orderId?: string
  orderNumber?: string
  sessionId?: string
  value: number
  timestamp: string
  normalizedSource?: string
  customer?: { email?: string; fullName?: string; city?: string }
  utm?: {
    source?: string
    medium?: string
    campaign?: string
    content?: string
    term?: string
    campaign_id?: string
    adset_id?: string
    adset_name?: string
    ad_id?: string
    ad_name?: string
    fbclid?: string
    gclid?: string
    ttclid?: string
    first_source?: string
    first_campaign?: string
    first_medium?: string
  }
  items?: Array<{ title: string; quantity: number; priceCents?: number; linePriceCents?: number }>
}

type CampaignDetail = {
  campaign: string
  source: string
  medium: string
  campaignId?: string
  totalRevenue: number
  totalOrders: number
  cpa: number
  orders: Array<{
    orderNumber?: string
    value: number
    timestamp: string
    adSet?: string
    adName?: string
    fbclid?: string
    gclid?: string
    customer?: string
  }>
}

type DashboardData = {
  totalPurchases: number
  totalRevenue: number
  avgOrderValue: number
  uniqueCustomers: number
  byCampaignDetail: CampaignDetail[]
  bySource: Array<{ source: string; purchases: number; revenue: number }>
  byProduct: Array<{ title: string; quantity: number; revenue: number; orders: number }>
  recentPurchases: Purchase[]
  dailyRevenue: Array<{ date: string; revenue: number }>
  hourlyRevenue: Array<{ hour: number; revenue: number }>
  comparison?: {
    purchases: number
    revenue: number
    avgOrderValue: number
    purchasesPercent: number
    revenuePercent: number
  } | null
  meta: { deduplicatedCount: number; duplicatesRemoved: number }
}

// ─── UTILS ───────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(v)

const fmtShort = (v: number) =>
  v >= 1000 ? `€${(v / 1000).toFixed(1)}k` : `€${v.toFixed(0)}`

const fmtDate = (iso: string) => {
  const d = new Date(iso)
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })
}

const toDateStr = (d: Date) => d.toISOString().split("T")[0]

const SOURCE_CFG: Record<string, { color: string; bg: string; icon: string }> = {
  Meta:     { color: "#1877F2", bg: "rgba(24,119,242,0.15)",  icon: "📘" },
  Google:   { color: "#EA4335", bg: "rgba(234,67,53,0.15)",   icon: "🔍" },
  TikTok:   { color: "#cccccc", bg: "rgba(200,200,200,0.1)",  icon: "🎵" },
  Direct:   { color: "#A3A3A3", bg: "rgba(163,163,163,0.12)", icon: "👤" },
  Organic:  { color: "#22C55E", bg: "rgba(34,197,94,0.15)",   icon: "🌱" },
  Referral: { color: "#A78BFA", bg: "rgba(167,139,250,0.15)", icon: "🔗" },
}

// ─── DATE HELPERS ─────────────────────────────────────────────────────────────

function buildCompare(startDate: string, endDate: string) {
  const start = new Date(startDate)
  const end = new Date(endDate)
  const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
  const prevEnd = new Date(start.getTime() - 24 * 60 * 60 * 1000)
  const prevStart = new Date(prevEnd.getTime() - (diffDays - 1) * 24 * 60 * 60 * 1000)
  return { compareStartDate: toDateStr(prevStart), compareEndDate: toDateStr(prevEnd) }
}

// ─── INSIGHTS ────────────────────────────────────────────────────────────────

type Insight = { type: "success" | "warning" | "info"; icon: string; title: string; msg: string; action: string }

function generateInsights(data: DashboardData): Insight[] {
  const out: Insight[] = []
  const campaigns = data.byCampaignDetail

  const top = campaigns[0]
  if (top) out.push({ type: "success", icon: "🏆", title: "Campagna TOP", msg: `"${top.campaign}" da ${top.source}: ${fmt(top.totalRevenue)} con ${top.totalOrders} ordini`, action: "Scala il budget del +20%" })

  const lowAov = campaigns.find(c => c.totalOrders >= 3 && c.cpa < data.avgOrderValue * 0.7)
  if (lowAov) out.push({ type: "warning", icon: "⚠️", title: "AOV basso", msg: `"${lowAov.campaign}" AOV ${fmt(lowAov.cpa)} vs media ${fmt(data.avgOrderValue)}`, action: "Controlla creatività e targeting" })

  const single = campaigns.filter(c => c.totalOrders === 1)
  if (single.length > 0) out.push({ type: "info", icon: "👀", title: `${single.length} campagne con 1 ordine`, msg: "Fase di apprendimento o test in corso", action: "Aspetta 5+ conversioni prima di ottimizzare" })

  const multiTouch = data.recentPurchases.filter(p => p.utm?.first_source && p.utm?.source && p.utm.first_source !== p.utm.source)
  if (multiTouch.length > 0) out.push({ type: "info", icon: "🔄", title: `${multiTouch.length} acquisti multi-touch`, msg: "Clienti che hanno interagito con più canali prima di comprare", action: "Valuta attribuzione lineare invece di last-click" })

  const best = data.hourlyRevenue.reduce((a, b) => b.revenue > a.revenue ? b : a, { hour: 0, revenue: 0 })
  if (best.revenue > 0) out.push({ type: "info", icon: "⏰", title: `Picco ore ${best.hour}:00`, msg: `Fascia oraria con più revenue: ${best.hour}:00–${best.hour + 1}:00`, action: "Concentra budget ads in questa finestra" })

  const direct = data.bySource.find(s => s.source === "Direct")
  if (direct && data.totalPurchases > 0 && direct.purchases / data.totalPurchases > 0.3)
    out.push({ type: "success", icon: "💪", title: "Brand Awareness forte", msg: `${((direct.purchases / data.totalPurchases) * 100).toFixed(0)}% ordini da traffico diretto`, action: "Continua a investire in contenuti organici" })

  return out
}

// ─── JOURNEY ─────────────────────────────────────────────────────────────────

function getJourney(p: Purchase) {
  const first = { source: p.utm?.first_source || p.utm?.source || "Direct", campaign: p.utm?.first_campaign || p.utm?.campaign || "" }
  const last  = { source: p.utm?.source || "Direct", campaign: p.utm?.campaign || "", adset: p.utm?.adset_name || "", ad: p.utm?.ad_name || "" }
  return { first, last, isMulti: first.source !== last.source || first.campaign !== last.campaign }
}

// ─── DECISIONE CAMPAGNA ───────────────────────────────────────────────────────

function getDecision(c: CampaignDetail, avg: number) {
  if (c.totalOrders >= 5 && c.cpa >= avg * 0.9)  return { label: "SCALA",     color: "#22C55E", bg: "rgba(34,197,94,0.15)",   border: "rgba(34,197,94,0.35)",   hint: "↑ Budget +20%" }
  if (c.totalOrders >= 3 && c.cpa >= avg * 0.7)  return { label: "OTTIMIZZA", color: "#60A5FA", bg: "rgba(96,165,250,0.15)",  border: "rgba(96,165,250,0.35)",  hint: "Nuove creative" }
  if (c.totalOrders === 1)                        return { label: "OSSERVA",   color: "#FBBF24", bg: "rgba(251,191,36,0.15)",  border: "rgba(251,191,36,0.35)",  hint: "Aspetta dati" }
  if (c.totalOrders >= 2 && c.cpa < avg * 0.6)   return { label: "ANALIZZA",  color: "#F97316", bg: "rgba(249,115,22,0.15)",  border: "rgba(249,115,22,0.35)",  hint: "Controlla target" }
  return                                                 { label: "IN CORSO",  color: "#A3A3A3", bg: "rgba(163,163,163,0.08)", border: "rgba(163,163,163,0.2)",  hint: "Monitora" }
}

// ─── SPARKLINE ────────────────────────────────────────────────────────────────

function Sparkline({ data, color = "#22C55E" }: { data: number[]; color?: string }) {
  if (data.length < 2) return null
  const max = Math.max(...data, 1), min = Math.min(...data), range = max - min || 1
  const w = 100, h = 32
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`).join(" ")
  const id = `sp${color.replace("#", "")}`
  return (
    <svg width={w} height={h} style={{ overflow: "visible", position: "absolute", bottom: 0, right: 0, opacity: 0.5 }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill={`url(#${id})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ─── KPI CARD ─────────────────────────────────────────────────────────────────

function KPICard({ label, value, sub, trend, spark, color = "#22C55E", icon }: {
  label: string; value: string; sub?: string; trend?: number; spark?: number[]; color?: string; icon: string
}) {
  return (
    <div
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "18px 20px", position: "relative", overflow: "hidden", transition: "border-color 0.2s" }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.18)")}
      onMouseLeave={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}
    >
      <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>{icon} {label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: "#fff", letterSpacing: "-0.02em", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", marginTop: 5 }}>{sub}</div>}
      {trend !== undefined && (
        <div style={{ marginTop: 6, display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: trend >= 0 ? "#22C55E" : "#EF4444", background: trend >= 0 ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)", padding: "2px 8px", borderRadius: 20 }}>
          {trend >= 0 ? "▲" : "▼"} {Math.abs(trend)}% vs prec.
        </div>
      )}
      {spark && <Sparkline data={spark} color={color} />}
    </div>
  )
}

// ─── REVENUE CHART ────────────────────────────────────────────────────────────

function RevenueChart({ data }: { data: Array<{ date: string; revenue: number }> }) {
  const max = Math.max(...data.map(d => d.revenue), 1)
  const [hov, setHov] = useState<number | null>(null)
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 72, paddingTop: 16 }}>
      {data.map((d, i) => {
        const bh = Math.max((d.revenue / max) * 64, 2)
        const day = new Date(d.date).toLocaleDateString("it-IT", { weekday: "short" })
        const isH = hov === i
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, cursor: "default", position: "relative" }}
            onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)}>
            {isH && (
              <div style={{ position: "absolute", top: -20, left: "50%", transform: "translateX(-50%)", fontSize: 10, fontWeight: 700, color: "#22C55E", whiteSpace: "nowrap", background: "rgba(0,0,0,0.85)", padding: "2px 6px", borderRadius: 4 }}>
                {fmtShort(d.revenue)}
              </div>
            )}
            <div style={{ width: "100%", height: bh, borderRadius: "3px 3px 0 0", background: isH ? "#22C55E" : "rgba(34,197,94,0.3)", transition: "background 0.15s", marginTop: "auto" }} />
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.22)", textTransform: "uppercase" }}>{day}</div>
          </div>
        )
      })}
    </div>
  )
}

// ─── HOURLY CHART ─────────────────────────────────────────────────────────────

function HourlyChart({ data }: { data: Array<{ hour: number; revenue: number }> }) {
  const max = Math.max(...data.map(d => d.revenue), 1)
  return (
    <div>
      <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 44 }}>
        {data.map((d, i) => {
          const t = d.revenue / max
          const color = t > 0.7 ? "#F97316" : t > 0.4 ? "#FBBF24" : t > 0.1 ? "#22C55E" : "rgba(255,255,255,0.06)"
          return <div key={i} title={`${d.hour}:00 — ${fmtShort(d.revenue)}`} style={{ flex: 1, height: Math.max(t * 40, 3), background: color, borderRadius: 2, transition: "all 0.3s" }} />
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
        {[0, 6, 12, 18, 23].map(h => <span key={h} style={{ fontSize: 9, color: "rgba(255,255,255,0.2)" }}>{h}h</span>)}
      </div>
    </div>
  )
}

// ─── SOURCE DONUT ─────────────────────────────────────────────────────────────

function SourceDonut({ sources }: { sources: Array<{ source: string; revenue: number; purchases: number }> }) {
  const total = sources.reduce((s, x) => s + x.revenue, 0)
  let cum = 0
  const cx = 40, cy = 40, r = 32, inner = 20
  const slices = sources.map(s => {
    const frac = s.revenue / total
    const a1 = cum * 2 * Math.PI - Math.PI / 2
    cum += frac
    const a2 = cum * 2 * Math.PI - Math.PI / 2
    const cfg = SOURCE_CFG[s.source] || { color: "#666", bg: "", icon: "" }
    const large = frac > 0.5 ? 1 : 0
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1)
    const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2)
    const xi1 = cx + inner * Math.cos(a1), yi1 = cy + inner * Math.sin(a1)
    const xi2 = cx + inner * Math.cos(a2), yi2 = cy + inner * Math.sin(a2)
    return { ...s, cfg, frac, path: `M${xi1},${yi1} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} L${xi2},${yi2} A${inner},${inner} 0 ${large},0 ${xi1},${yi1} Z` }
  })
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <svg width={80} height={80} style={{ flexShrink: 0 }}>
        {slices.map((s, i) => <path key={i} d={s.path} fill={s.cfg.color} opacity={0.9} />)}
      </svg>
      <div style={{ flex: 1 }}>
        {slices.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: s.cfg.color, flexShrink: 0 }} />
            <div style={{ flex: 1, fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{s.source}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>{(s.frac * 100).toFixed(0)}%</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.28)" }}>{s.purchases} ord.</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── JOURNEY BADGE ────────────────────────────────────────────────────────────

function JBadge({ source, campaign, label }: { source: string; campaign?: string; label: string }) {
  const cfg = SOURCE_CFG[source] || { color: "#A3A3A3", bg: "rgba(163,163,163,0.1)", icon: "📌" }
  return (
    <div style={{ background: cfg.bg, border: `1px solid ${cfg.color}40`, borderRadius: 10, padding: "8px 12px", textAlign: "center", minWidth: 90, maxWidth: 130 }}>
      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: cfg.color }}>{cfg.icon} {source}</div>
      {campaign && <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={campaign}>{campaign}</div>}
    </div>
  )
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

export default function AnalyticsDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState(new Date())
  const [activeTab, setActiveTab] = useState<"overview" | "campaigns" | "journey" | "products">("overview")
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null)
  const [mode, setMode] = useState<"lite" | "pro">("lite")

  const today = new Date()
  const [startDate, setStartDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split("T")[0])
  const [endDate, setEndDate] = useState(toDateStr(today))

  // ─── FETCH (identico all'originale) ──────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const { compareStartDate, compareEndDate } = buildCompare(startDate, endDate)
      const url = `/api/analytics/dashboard?startDate=${startDate}&endDate=${endDate}&compareStartDate=${compareStartDate}&compareEndDate=${compareEndDate}&limit=1000`
      const res = await fetch(url)
      if (!res.ok) throw new Error("Errore caricamento dati")
      const json = await res.json()
      setData(json)
      setLastUpdate(new Date())
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Errore sconosciuto")
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { const t = setInterval(fetchData, 60000); return () => clearInterval(t) }, [fetchData])

  // ─── QUICK DATE RANGES ────────────────────────────────────────────────────────
  const setRange = (preset: "today" | "yesterday" | number | "month") => {
    const e = new Date()
    if (preset === "today") {
      setStartDate(toDateStr(e)); setEndDate(toDateStr(e))
    } else if (preset === "yesterday") {
      const y = new Date(e); y.setDate(y.getDate() - 1)
      setStartDate(toDateStr(y)); setEndDate(toDateStr(y))
    } else if (preset === "month") {
      setStartDate(new Date(e.getFullYear(), e.getMonth(), 1).toISOString().split("T")[0]); setEndDate(toDateStr(e))
    } else {
      const s = new Date(e); s.setDate(s.getDate() - (preset as number))
      setStartDate(toDateStr(s)); setEndDate(toDateStr(e))
    }
  }

  const todayStr = toDateStr(today)
  const yesterdayStr = toDateStr(new Date(today.getTime() - 86400000))

  // ─── LOADING ──────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#0A0A0B", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
      <div style={{ width: 32, height: 32, border: "2px solid rgba(255,255,255,0.1)", borderTop: "2px solid #fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", fontFamily: "system-ui" }}>Caricamento analytics...</div>
    </div>
  )

  // ─── ERROR ────────────────────────────────────────────────────────────────────
  if (error) return (
    <div style={{ minHeight: "100vh", background: "#0A0A0B", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 16, padding: "32px 40px", textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>❌</div>
        <div style={{ color: "#fff", fontWeight: 700, marginBottom: 8, fontFamily: "system-ui" }}>{error}</div>
        <button onClick={fetchData} style={{ marginTop: 8, padding: "8px 20px", background: "#EF4444", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>Riprova</button>
      </div>
    </div>
  )

  if (!data) return null

  const insights = generateInsights(data)
  const sparkRevenue = data.dailyRevenue.map(d => d.revenue)
  const maxCampRev = Math.max(...data.byCampaignDetail.map(c => c.totalRevenue), 1)

  return (
    <div style={{ fontFamily: "'DM Sans','Helvetica Neue',Arial,sans-serif", minHeight: "100vh", background: "#0A0A0B", color: "#fff" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&family=DM+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:#111}
        ::-webkit-scrollbar-thumb{background:#333;border-radius:2px}
        .rh:hover{background:rgba(255,255,255,0.03)!important}
        @keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
        @keyframes fu{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .fu{animation:fu 0.3s ease forwards}
        @keyframes pdot{0%,100%{opacity:1}50%{opacity:0.2}}
        .ldot{animation:pdot 2s infinite}
        input[type="date"]{color-scheme:dark}
      `}</style>

      {/* ── TOPBAR ── */}
      <div style={{ background: "rgba(10,10,11,0.97)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 24px", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 1320, margin: "0 auto", minHeight: 56, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "8px 0" }}>

          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 26, height: 26, background: "#fff", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900, color: "#000", flexShrink: 0 }}>N</div>
            <span style={{ fontWeight: 800, fontSize: 14 }}>NFR Analytics</span>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div className="ldot" style={{ width: 6, height: 6, borderRadius: "50%", background: "#22C55E" }} />
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontFamily: "DM Mono,monospace" }}>
                LIVE · {lastUpdate.toLocaleTimeString("it-IT")}
              </span>
            </div>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.18)", fontFamily: "DM Mono,monospace", display: "none" }} className="md-show">
              {data.meta.deduplicatedCount} ordini{data.meta.duplicatesRemoved > 0 ? ` · ${data.meta.duplicatesRemoved} dedup` : ""}
            </span>
          </div>

          {/* Date controls */}
          <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
            {([
              { label: "Oggi",    fn: () => setRange("today") },
              { label: "Ieri",    fn: () => setRange("yesterday") },
              { label: "7gg",     fn: () => setRange(7) },
              { label: "14gg",    fn: () => setRange(14) },
              { label: "30gg",    fn: () => setRange(30) },
              { label: "Mese",    fn: () => setRange("month") },
            ]).map(({ label, fn }) => {
              const isActive =
                (label === "Oggi"  && startDate === todayStr && endDate === todayStr) ||
                (label === "Ieri"  && startDate === yesterdayStr && endDate === yesterdayStr) ||
                (label === "7gg"   && startDate === toDateStr(new Date(today.getTime() - 7 * 86400000)) && endDate === todayStr) ||
                (label === "14gg"  && startDate === toDateStr(new Date(today.getTime() - 14 * 86400000)) && endDate === todayStr) ||
                (label === "30gg"  && startDate === toDateStr(new Date(today.getTime() - 30 * 86400000)) && endDate === todayStr) ||
                (label === "Mese"  && startDate === new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split("T")[0] && endDate === todayStr)
              return (
                <button key={label} onClick={fn} style={{ padding: "4px 11px", fontSize: 11, fontWeight: 700, borderRadius: 7, border: "none", cursor: "pointer", background: isActive ? "#fff" : "rgba(255,255,255,0.07)", color: isActive ? "#000" : "rgba(255,255,255,0.45)", transition: "all 0.15s" }}>
                  {label}
                </button>
              )
            })}
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, padding: "4px 9px", fontSize: 11, color: "#fff", fontFamily: "DM Mono,monospace" }} />
            <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 12 }}>→</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, padding: "4px 9px", fontSize: 11, color: "#fff", fontFamily: "DM Mono,monospace" }} />
            <button onClick={fetchData} style={{ padding: "4px 13px", fontSize: 11, fontWeight: 700, background: "#fff", color: "#000", border: "none", borderRadius: 7, cursor: "pointer" }}>
              ↺
            </button>
          </div>

          {/* Lite / Pro */}
          <div style={{ display: "flex", background: "rgba(255,255,255,0.05)", borderRadius: 9, padding: 3, gap: 2 }}>
            {(["lite", "pro"] as const).map(m => (
              <button key={m} onClick={() => setMode(m)} style={{ padding: "4px 13px", borderRadius: 6, fontSize: 11, fontWeight: 700, border: "none", cursor: "pointer", background: mode === m ? "#fff" : "transparent", color: mode === m ? "#000" : "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.05em", transition: "all 0.15s" }}>
                {m === "lite" ? "⚡ Lite" : "🔬 Pro"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ═══════════════════════ LITE MODE ═══════════════════════ */}
      {mode === "lite" && (
        <div className="fu" style={{ maxWidth: 700, margin: "0 auto", padding: "24px 16px 60px" }}>

          {/* Revenue hero */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em" }}>
                {startDate === endDate
                  ? (startDate === todayStr ? "Oggi 📅" : startDate === yesterdayStr ? "Ieri 📅" : startDate)
                  : `${startDate} → ${endDate}`}
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.28)", marginTop: 3 }}>aggiornato {lastUpdate.toLocaleTimeString("it-IT")} · {data.meta.deduplicatedCount} ordini unici</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 30, fontWeight: 900, color: "#22C55E", letterSpacing: "-0.03em" }}>{fmt(data.totalRevenue)}</div>
              {data.comparison?.revenuePercent !== undefined && (
                <div style={{ fontSize: 11, color: data.comparison.revenuePercent >= 0 ? "#22C55E" : "#EF4444", fontWeight: 600 }}>
                  {data.comparison.revenuePercent >= 0 ? "▲" : "▼"} {Math.abs(data.comparison.revenuePercent)}% vs periodo prec.
                </div>
              )}
            </div>
          </div>

          {/* 3 KPI */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
            {[
              { label: "Ordini",       value: String(data.totalPurchases), trend: data.comparison?.purchasesPercent, color: "#60A5FA" },
              { label: "AOV medio",    value: fmt(data.avgOrderValue),     color: "#FBBF24" },
              { label: "Clienti unici",value: String(data.uniqueCustomers), color: "#A78BFA" },
            ].map((k, i) => (
              <div key={i} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 13, padding: "13px 15px" }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 5 }}>{k.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800 }}>{k.value}</div>
                {k.trend !== undefined && <div style={{ fontSize: 11, color: k.trend >= 0 ? "#22C55E" : "#EF4444", marginTop: 3, fontWeight: 600 }}>{k.trend >= 0 ? "▲" : "▼"} {Math.abs(k.trend)}%</div>}
              </div>
            ))}
          </div>

          {/* Revenue chart */}
          {data.dailyRevenue.length > 1 && (
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 15, padding: "15px 17px", marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 2 }}>Revenue giornaliero</div>
              <RevenueChart data={data.dailyRevenue.slice(-14)} />
            </div>
          )}

          {/* Da dove vengono gli acquisti */}
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 15, padding: "15px 17px", marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 14 }}>📍 Da dove vengono gli acquisti</div>
            {data.bySource.length === 0
              ? <div style={{ fontSize: 13, color: "rgba(255,255,255,0.25)", textAlign: "center", padding: "16px 0" }}>Nessun dato nel periodo selezionato</div>
              : data.bySource.map((s, i) => {
                  const cfg = SOURCE_CFG[s.source] || { color: "#888", bg: "rgba(136,136,136,0.1)", icon: "📌" }
                  const pct = data.totalRevenue > 0 ? ((s.revenue / data.totalRevenue) * 100).toFixed(0) : "0"
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 13 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: cfg.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{cfg.icon}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                          <span style={{ fontWeight: 700, fontSize: 13 }}>{s.source}</span>
                          <span style={{ fontSize: 13, fontWeight: 800, color: cfg.color }}>{fmt(s.revenue)}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ flex: 1, height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 3 }}>
                            <div style={{ height: "100%", width: `${pct}%`, background: cfg.color, borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", width: 28, textAlign: "right" }}>{pct}%</span>
                          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", width: 22, textAlign: "right" }}>{s.purchases}</span>
                        </div>
                      </div>
                    </div>
                  )
                })
            }
          </div>

          {/* Decisioni campagne */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>🎯 Cosa fare adesso</div>
            {data.byCampaignDetail.filter(c => c.source !== "Direct").length === 0
              ? <div style={{ fontSize: 13, color: "rgba(255,255,255,0.25)", textAlign: "center", padding: "16px 0" }}>Nessuna campagna ads nel periodo</div>
              : data.byCampaignDetail.filter(c => c.source !== "Direct").map((c, i) => {
                  const dec = getDecision(c, data.avgOrderValue)
                  const cfg = SOURCE_CFG[c.source] || { color: "#888", bg: "", icon: "📌" }
                  return (
                    <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${dec.border}`, borderRadius: 13, padding: "12px 15px", display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                      <div style={{ width: 5, height: 36, background: dec.color, borderRadius: 3, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: cfg.color, textTransform: "uppercase" }}>{c.source}</span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.6)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.campaign || "—"}</span>
                        </div>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.28)" }}>{c.totalOrders} ordini · {fmt(c.totalRevenue)} · AOV {fmt(c.cpa)}</div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 10, fontWeight: 800, color: dec.color, background: dec.bg, padding: "3px 10px", borderRadius: 20, marginBottom: 3 }}>{dec.label}</div>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.22)" }}>{dec.hint}</div>
                      </div>
                    </div>
                  )
                })
            }
          </div>

          {/* Ore calde */}
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 15, padding: "15px 17px", marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em" }}>⏰ Ore calde</div>
              <div style={{ display: "flex", gap: 10, fontSize: 10, color: "rgba(255,255,255,0.22)" }}>
                <span><span style={{ color: "#22C55E" }}>■</span> bassa</span>
                <span><span style={{ color: "#FBBF24" }}>■</span> alta</span>
                <span><span style={{ color: "#F97316" }}>■</span> picco</span>
              </div>
            </div>
            <HourlyChart data={data.hourlyRevenue} />
          </div>

          {/* Insights */}
          {insights.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 2 }}>🧠 Insights automatici</div>
              {insights.map((ins, i) => (
                <div key={i} style={{ background: ins.type === "success" ? "rgba(34,197,94,0.06)" : ins.type === "warning" ? "rgba(251,191,36,0.06)" : "rgba(96,165,250,0.06)", border: `1px solid ${ins.type === "success" ? "rgba(34,197,94,0.18)" : ins.type === "warning" ? "rgba(251,191,36,0.18)" : "rgba(96,165,250,0.18)"}`, borderRadius: 12, padding: "12px 14px" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{ins.icon} {ins.title}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", lineHeight: 1.5, marginBottom: 6 }}>{ins.msg}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: ins.type === "success" ? "#22C55E" : ins.type === "warning" ? "#FBBF24" : "#60A5FA" }}>→ {ins.action}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════ PRO MODE ═══════════════════════ */}
      {mode === "pro" && (
        <div className="fu">
          {/* Tab bar */}
          <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 24px" }}>
            <div style={{ maxWidth: 1320, margin: "0 auto", display: "flex" }}>
              {([
                { id: "overview",  label: "📊 Overview" },
                { id: "campaigns", label: "🎯 Campagne" },
                { id: "journey",   label: "🗺️ Journey" },
                { id: "products",  label: "📦 Prodotti" },
              ] as { id: typeof activeTab; label: string }[]).map(t => (
                <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ padding: "13px 20px", fontSize: 13, fontWeight: 600, color: activeTab === t.id ? "#fff" : "rgba(255,255,255,0.35)", background: "transparent", border: "none", borderBottom: activeTab === t.id ? "2px solid #fff" : "2px solid transparent", marginBottom: -1, cursor: "pointer", transition: "all 0.15s" }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ maxWidth: 1320, margin: "0 auto", padding: "24px 24px 60px" }}>

            {/* ── OVERVIEW ── */}
            {activeTab === "overview" && (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 14 }}>
                  <KPICard icon="💰" label="Revenue totale"  value={fmt(data.totalRevenue)}       trend={data.comparison?.revenuePercent}   spark={sparkRevenue}                                                color="#22C55E" />
                  <KPICard icon="🛒" label="Ordini"          value={String(data.totalPurchases)}  trend={data.comparison?.purchasesPercent} spark={sparkRevenue.map(v => v / (data.avgOrderValue || 1))}  color="#60A5FA" />
                  <KPICard icon="📊" label="AOV medio"       value={fmt(data.avgOrderValue)}       sub={data.comparison ? `vs ${fmt(data.comparison.avgOrderValue)} prec.` : undefined}                       color="#FBBF24" />
                  <KPICard icon="👥" label="Clienti unici"   value={String(data.uniqueCustomers)} sub={`${data.byCampaignDetail.length} campagne attive`}                                                     color="#A78BFA" />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, marginBottom: 14 }}>
                  <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "18px 20px" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Revenue giornaliero</div>
                    {data.dailyRevenue.length > 1 ? <RevenueChart data={data.dailyRevenue.slice(-30)} /> : <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 12, textAlign: "center", paddingTop: 24 }}>Nessun dato</div>}
                  </div>
                  <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "18px 20px" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 14 }}>Sorgenti revenue</div>
                    {data.bySource.length > 0 ? <SourceDonut sources={data.bySource} /> : <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 12, textAlign: "center", paddingTop: 24 }}>Nessun dato</div>}
                  </div>
                </div>

                {insights.length > 0 && (
                  <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "18px 20px", marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 14 }}>🧠 Insights automatici</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                      {insights.slice(0, 6).map((ins, i) => (
                        <div key={i} style={{ background: ins.type === "success" ? "rgba(34,197,94,0.06)" : ins.type === "warning" ? "rgba(251,191,36,0.06)" : "rgba(96,165,250,0.06)", border: `1px solid ${ins.type === "success" ? "rgba(34,197,94,0.18)" : ins.type === "warning" ? "rgba(251,191,36,0.18)" : "rgba(96,165,250,0.18)"}`, borderRadius: 12, padding: "14px 16px" }}>
                          <div style={{ fontSize: 18, marginBottom: 6 }}>{ins.icon}</div>
                          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{ins.title}</div>
                          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", lineHeight: 1.5, marginBottom: 8 }}>{ins.msg}</div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: ins.type === "success" ? "#22C55E" : ins.type === "warning" ? "#FBBF24" : "#60A5FA" }}>→ {ins.action}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "18px 20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Distribuzione oraria revenue</div>
                    <div style={{ display: "flex", gap: 12, fontSize: 10, color: "rgba(255,255,255,0.22)" }}>
                      <span><span style={{ color: "#22C55E" }}>■</span> bassa</span>
                      <span><span style={{ color: "#FBBF24" }}>■</span> media</span>
                      <span><span style={{ color: "#F97316" }}>■</span> picco</span>
                    </div>
                  </div>
                  <HourlyChart data={data.hourlyRevenue} />
                </div>
              </div>
            )}

            {/* ── CAMPAGNE ── */}
            {activeTab === "campaigns" && (
              <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, overflow: "hidden" }}>
                <div style={{ padding: "18px 22px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>Performance Campagne</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.28)", marginTop: 2 }}>Fonte → campagna → ad set → creatività con decisione operativa. Clicca per espandere gli ordini.</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "160px 1fr 90px 120px 100px 130px", padding: "10px 22px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  {["Fonte", "Campagna", "Ordini", "Revenue", "AOV", "Decisione"].map((h, i) => (
                    <div key={i} style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.22)", textTransform: "uppercase", letterSpacing: "0.1em", textAlign: i >= 2 ? "right" : "left" }}>{h}</div>
                  ))}
                </div>
                {data.byCampaignDetail.length === 0 && (
                  <div style={{ textAlign: "center", padding: "48px 0", color: "rgba(255,255,255,0.22)", fontSize: 14 }}>🔍 Nessuna campagna nel periodo selezionato</div>
                )}
                {data.byCampaignDetail.map((c, i) => {
                  const dec = getDecision(c, data.avgOrderValue)
                  const cfg = SOURCE_CFG[c.source] || { color: "#888", bg: "", icon: "📌" }
                  const isExp = expandedOrder === `camp-${i}`
                  const adSets = [...new Set(c.orders.map(o => o.adSet).filter(Boolean))]
                  const adNames = [...new Set(c.orders.map(o => o.adName).filter(Boolean))]
                  return (
                    <div key={i}>
                      <div className="rh" onClick={() => setExpandedOrder(isExp ? null : `camp-${i}`)}
                        style={{ display: "grid", gridTemplateColumns: "160px 1fr 90px 120px 100px 130px", padding: "14px 22px", borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer", transition: "background 0.1s" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 15 }}>{cfg.icon}</span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: cfg.color }}>{c.source}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ flexShrink: 0, width: 50, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${(c.totalRevenue / maxCampRev) * 100}%`, background: cfg.color, borderRadius: 2 }} />
                          </div>
                          <div>
                            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 280 }} title={c.campaign}>{c.campaign || "—"}</div>
                            {c.campaignId && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", fontFamily: "DM Mono,monospace" }}>ID: {c.campaignId}</div>}
                            {adSets.length > 0 && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 1 }}>📂 {adSets[0]}{adSets.length > 1 ? ` +${adSets.length - 1}` : ""}</div>}
                            {adNames.length > 0 && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", marginTop: 1 }}>🎨 {adNames[0]}{adNames.length > 1 ? ` +${adNames.length - 1}` : ""}</div>}
                          </div>
                        </div>
                        <div style={{ textAlign: "right", fontSize: 14, fontWeight: 700, alignSelf: "center" }}>{c.totalOrders}</div>
                        <div style={{ textAlign: "right", fontSize: 14, fontWeight: 700, color: "#22C55E", alignSelf: "center" }}>{fmt(c.totalRevenue)}</div>
                        <div style={{ textAlign: "right", fontSize: 13, color: "rgba(255,255,255,0.45)", alignSelf: "center" }}>{fmt(c.cpa)}</div>
                        <div style={{ textAlign: "right", alignSelf: "center" }}>
                          <span style={{ fontSize: 10, fontWeight: 800, color: dec.color, background: dec.bg, border: `1px solid ${dec.border}`, padding: "3px 10px", borderRadius: 20 }}>{dec.label}</span>
                          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", marginTop: 3 }}>{dec.hint}</div>
                        </div>
                      </div>
                      {isExp && c.orders.length > 0 && (
                        <div style={{ background: "rgba(255,255,255,0.02)", padding: "12px 22px 14px 48px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.2)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Ordini dettaglio</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                            {c.orders.map((o, j) => (
                              <div key={j} style={{ display: "flex", gap: 14, background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "8px 12px", fontSize: 12, flexWrap: "wrap", alignItems: "center" }}>
                                <span style={{ fontWeight: 700 }}>#{o.orderNumber || "—"}</span>
                                <span style={{ color: "#22C55E", fontWeight: 700 }}>{fmt(o.value)}</span>
                                <span style={{ color: "rgba(255,255,255,0.28)", fontFamily: "DM Mono,monospace", fontSize: 11 }}>{fmtDate(o.timestamp)}</span>
                                {o.adSet && <span style={{ color: "rgba(255,255,255,0.4)" }}>📂 {o.adSet}</span>}
                                {o.adName && <span style={{ color: "rgba(255,255,255,0.4)" }}>🎨 {o.adName}</span>}
                                {o.customer && <span style={{ color: "rgba(255,255,255,0.35)" }}>👤 {o.customer}</span>}
                                {o.fbclid && <span style={{ color: "rgba(255,255,255,0.2)", fontFamily: "DM Mono,monospace", fontSize: 10 }}>fb:{o.fbclid.slice(0, 8)}…</span>}
                                {o.gclid && <span style={{ color: "rgba(255,255,255,0.2)", fontFamily: "DM Mono,monospace", fontSize: 10 }}>g:{o.gclid.slice(0, 8)}…</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* ── JOURNEY ── */}
            {activeTab === "journey" && (
              <div>
                <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "18px 22px", marginBottom: 14 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>🗺️ Customer Journey</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.28)" }}>1° touch → last touch → acquisto. Come ogni cliente ti ha trovato e cosa lo ha convinto a comprare.</div>
                </div>
                {data.recentPurchases.length === 0
                  ? <div style={{ textAlign: "center", padding: "48px 0", color: "rgba(255,255,255,0.22)", fontSize: 14 }}>Nessun acquisto nel periodo</div>
                  : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {data.recentPurchases.slice(0, 50).map((p, i) => {
                        const { first, last, isMulti } = getJourney(p)
                        const key = p.orderId || p.sessionId || String(i)
                        const isExp = expandedOrder === key
                        return (
                          <div key={key} onClick={() => setExpandedOrder(isExp ? null : key)}
                            style={{ background: "rgba(255,255,255,0.03)", border: isMulti ? "1px solid rgba(167,139,250,0.25)" : "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "16px 20px", cursor: "pointer", transition: "border-color 0.15s" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                <span style={{ fontSize: 14, fontWeight: 800 }}>#{p.orderNumber || p.orderId?.slice(-6) || "—"}</span>
                                <span style={{ fontSize: 15, fontWeight: 800, color: "#22C55E" }}>{fmt(p.value)}</span>
                                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", fontFamily: "DM Mono,monospace" }}>{fmtDate(p.timestamp)}</span>
                              </div>
                              <div style={{ display: "flex", gap: 8 }}>
                                {isMulti && <span style={{ fontSize: 11, fontWeight: 700, color: "#A78BFA", background: "rgba(167,139,250,0.12)", padding: "2px 10px", borderRadius: 20 }}>🔄 Multi-touch</span>}
                                {p.customer?.city && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>📍 {p.customer.city}</span>}
                              </div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                              <JBadge source={first.source} campaign={first.campaign} label="1° Touch" />
                              <div style={{ color: "rgba(255,255,255,0.15)", fontSize: 20 }}>→</div>
                              <JBadge source={last.source} campaign={last.campaign} label="Last Touch" />
                              <div style={{ color: "rgba(255,255,255,0.15)", fontSize: 20 }}>→</div>
                              <div style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 10, padding: "8px 14px", textAlign: "center" }}>
                                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.28)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3 }}>Acquisto</div>
                                <div style={{ fontSize: 15, fontWeight: 800, color: "#22C55E" }}>{fmt(p.value)}</div>
                              </div>
                            </div>
                            {isExp && (
                              <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)", display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
                                <div>
                                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Cliente</div>
                                  <div style={{ fontSize: 13, fontWeight: 600 }}>{p.customer?.fullName || "—"}</div>
                                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.28)" }}>{p.customer?.email || "—"}</div>
                                </div>
                                <div>
                                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>UTM last click</div>
                                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontFamily: "DM Mono,monospace", lineHeight: 1.8 }}>
                                    src: {p.utm?.source || "—"}<br />
                                    med: {p.utm?.medium || "—"}<br />
                                    camp: {p.utm?.campaign?.slice(0, 22) || "—"}
                                  </div>
                                </div>
                                <div>
                                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Prodotti</div>
                                  {p.items?.map((item, j) => (
                                    <div key={j} style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.8 }}>{item.quantity}× {item.title}</div>
                                  )) || <div style={{ color: "rgba(255,255,255,0.22)" }}>—</div>}
                                </div>
                                <div>
                                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Click ID</div>
                                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", fontFamily: "DM Mono,monospace", lineHeight: 1.8 }}>
                                    {p.utm?.fbclid && <div>fb: {p.utm.fbclid.slice(0, 14)}…</div>}
                                    {p.utm?.gclid && <div>g: {p.utm.gclid.slice(0, 14)}…</div>}
                                    {p.utm?.ttclid && <div>tt: {p.utm.ttclid.slice(0, 14)}…</div>}
                                    {!p.utm?.fbclid && !p.utm?.gclid && !p.utm?.ttclid && "—"}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                }
              </div>
            )}

            {/* ── PRODOTTI ── */}
            {activeTab === "products" && (
              <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, overflow: "hidden" }}>
                <div style={{ padding: "18px 22px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>📦 Performance Prodotti</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 130px 120px", padding: "10px 22px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  {["Prodotto", "Qtà", "Ordini", "Revenue", "Prezzo medio"].map((h, i) => (
                    <div key={i} style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.22)", textTransform: "uppercase", letterSpacing: "0.1em", textAlign: i > 0 ? "right" : "left" }}>{h}</div>
                  ))}
                </div>
                {data.byProduct.length === 0
                  ? <div style={{ textAlign: "center", padding: "48px 0", color: "rgba(255,255,255,0.22)", fontSize: 14 }}>Nessun prodotto nel periodo</div>
                  : data.byProduct.map((p, i) => {
                      const maxRev = Math.max(...data.byProduct.map(x => x.revenue), 1)
                      return (
                        <div key={i} className="rh" style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 130px 120px", padding: "14px 22px", borderBottom: "1px solid rgba(255,255,255,0.04)", transition: "background 0.1s" }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 5 }}>{p.title}</div>
                            <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, maxWidth: 200 }}>
                              <div style={{ height: "100%", width: `${(p.revenue / maxRev) * 100}%`, background: "#22C55E", borderRadius: 2 }} />
                            </div>
                          </div>
                          <div style={{ textAlign: "right", fontSize: 13, fontWeight: 600, alignSelf: "center" }}>{p.quantity}</div>
                          <div style={{ textAlign: "right", fontSize: 13, color: "rgba(255,255,255,0.4)", alignSelf: "center" }}>{p.orders}</div>
                          <div style={{ textAlign: "right", fontSize: 13, fontWeight: 700, color: "#22C55E", alignSelf: "center" }}>{fmt(p.revenue)}</div>
                          <div style={{ textAlign: "right", fontSize: 13, color: "rgba(255,255,255,0.4)", alignSelf: "center" }}>{fmt(p.revenue / p.orders)}</div>
                        </div>
                      )
                    })
                }
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  )
}
