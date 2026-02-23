"use client"

import { useState, useEffect, useRef } from "react"

// ─── MOCK DATA ────────────────────────────────────────────────────────────────
const MOCK_DATA = {
  totalPurchases: 47,
  totalRevenue: 1842.30,
  avgOrderValue: 39.20,
  uniqueCustomers: 44,
  meta: { deduplicatedCount: 47, duplicatesRemoved: 2 },
  comparison: { purchasesPercent: 23, revenuePercent: 31, avgOrderValue: 36.10 },
  bySource: [
    { source: "Meta", purchases: 21, revenue: 894.50 },
    { source: "Google", purchases: 14, revenue: 601.20 },
    { source: "Direct", purchases: 8, revenue: 248.60 },
    { source: "TikTok", purchases: 3, revenue: 72.00 },
    { source: "Organic", purchases: 1, revenue: 26.00 },
  ],
  byCampaignDetail: [
    { campaign: "NFR_PROMO50_PMAX", source: "Google", medium: "pmax", totalRevenue: 601.20, totalOrders: 14, cpa: 42.94, orders: [] },
    { campaign: "NFR_RETARGETING_SPRING", source: "Meta", medium: "cpc", totalRevenue: 512.30, totalOrders: 12, cpa: 42.69, orders: [] },
    { campaign: "NFR_AWARENESS_BROAD", source: "Meta", medium: "cpc", totalRevenue: 382.20, totalOrders: 9, cpa: 42.47, orders: [] },
    { campaign: "NFR_TIKTOK_UGC", source: "TikTok", medium: "cpc", totalRevenue: 72.00, totalOrders: 3, cpa: 24.00, orders: [] },
    { campaign: "Direct / None", source: "Direct", medium: "none", totalRevenue: 248.60, totalOrders: 8, cpa: 31.08, orders: [] },
    { campaign: "NFR_ORGANIC_BIO", source: "Organic", medium: "organic", totalRevenue: 26.00, totalOrders: 1, cpa: 26.00, orders: [] },
  ],
  byProduct: [
    { title: "Hoodie Oversize Nero", quantity: 18, revenue: 802.80, orders: 17 },
    { title: "T-Shirt Drop #04 Bianca", quantity: 24, revenue: 357.60, orders: 22 },
    { title: "T-Shirt Interstellar", quantity: 19, revenue: 283.10, orders: 17 },
    { title: "Hoodie Army Green", quantity: 7, revenue: 312.10, orders: 6 },
    { title: "T-Shirt Logo Panna", quantity: 11, revenue: 163.90, orders: 10 },
  ],
  dailyRevenue: [
    { date: "2026-02-17", revenue: 180.40 },
    { date: "2026-02-18", revenue: 95.20 },
    { date: "2026-02-19", revenue: 220.10 },
    { date: "2026-02-20", revenue: 312.60 },
    { date: "2026-02-21", revenue: 408.30 },
    { date: "2026-02-22", revenue: 289.50 },
    { date: "2026-02-23", revenue: 336.20 },
  ],
  hourlyRevenue: Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    revenue: [0,0,0,0,0,0,2,8,22,38,54,61,48,35,29,41,68,92,148,172,131,87,45,18][h] * 2.4
  })),
  recentPurchases: [
    { orderId: "o1", orderNumber: "1042", value: 44.80, timestamp: "2026-02-23T19:42:00Z", customer: { fullName: "Marco Rossi", city: "Milano", email: "m.rossi@gmail.com" }, utm: { source: "Google", medium: "pmax", campaign: "NFR_PROMO50_PMAX", gclid: "abc123xyz", first_source: "Meta", first_campaign: "NFR_AWARENESS_BROAD" }, items: [{ title: "Hoodie Oversize Nero", quantity: 1 }, { title: "T-Shirt Drop #04 Bianca", quantity: 1 }] },
    { orderId: "o2", orderNumber: "1041", value: 22.30, timestamp: "2026-02-23T18:15:00Z", customer: { fullName: "Sara Bianchi", city: "Roma", email: "sara.b@icloud.com" }, utm: { source: "Meta", medium: "cpc", campaign: "NFR_RETARGETING_SPRING", fbclid: "def456uvw", first_source: "Meta", first_campaign: "NFR_RETARGETING_SPRING" }, items: [{ title: "Hoodie Army Green", quantity: 1 }] },
    { orderId: "o3", orderNumber: "1040", value: 59.60, timestamp: "2026-02-23T16:08:00Z", customer: { fullName: "Luca Ferrari", city: "Torino", email: "luca.f@gmail.com" }, utm: { source: "Google", medium: "pmax", campaign: "NFR_PROMO50_PMAX", gclid: "ghi789rst", first_source: "Google", first_campaign: "NFR_PROMO50_PMAX" }, items: [{ title: "Hoodie Oversize Nero", quantity: 1 }, { title: "T-Shirt Logo Panna", quantity: 2 }] },
    { orderId: "o4", orderNumber: "1039", value: 14.90, timestamp: "2026-02-23T14:22:00Z", customer: { fullName: "Giulia Marino", city: "Napoli", email: "g.marino@libero.it" }, utm: { source: "TikTok", medium: "cpc", campaign: "NFR_TIKTOK_UGC", ttclid: "jkl012mno", first_source: "TikTok", first_campaign: "NFR_TIKTOK_UGC" }, items: [{ title: "T-Shirt Drop #04 Bianca", quantity: 1 }] },
    { orderId: "o5", orderNumber: "1038", value: 37.20, timestamp: "2026-02-23T12:55:00Z", customer: { fullName: "Andrea Costa", city: "Bologna", email: "a.costa@yahoo.it" }, utm: { source: "Direct", medium: "none", campaign: "", first_source: "Meta", first_campaign: "NFR_AWARENESS_BROAD" }, items: [{ title: "T-Shirt Interstellar", quantity: 1 }, { title: "T-Shirt Drop #04 Bianca", quantity: 1 }] },
  ],
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const fmt = (v: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(v)
const fmtShort = (v: number) => v >= 1000 ? `€${(v/1000).toFixed(1)}k` : `€${v.toFixed(0)}`

const SOURCE_CONFIG = {
  Meta:    { color: "#1877F2", bg: "rgba(24,119,242,0.12)", icon: "📘", gradient: "from-blue-500 to-blue-700" },
  Google:  { color: "#EA4335", bg: "rgba(234,67,53,0.12)",  icon: "🔍", gradient: "from-red-500 to-red-700" },
  TikTok:  { color: "#ffffff", bg: "rgba(255,255,255,0.08)", icon: "🎵", gradient: "from-gray-200 to-gray-400" },
  Direct:  { color: "#A3A3A3", bg: "rgba(163,163,163,0.1)", icon: "👤", gradient: "from-gray-400 to-gray-600" },
  Organic: { color: "#22C55E", bg: "rgba(34,197,94,0.12)",  icon: "🌱", gradient: "from-green-500 to-green-700" },
}

function getDecision(campaign: { totalOrders: number; cpa: number; source: string; campaign: string }, avgAov: number) {
  if (campaign.totalOrders >= 5 && campaign.cpa >= avgAov * 0.9)
    return { label: "SCALA", color: "#22C55E", bg: "rgba(34,197,94,0.15)", border: "rgba(34,197,94,0.3)", hint: "↑ Budget +20%" }
  if (campaign.totalOrders >= 3 && campaign.cpa >= avgAov * 0.7)
    return { label: "OTTIMIZZA", color: "#60A5FA", bg: "rgba(96,165,250,0.15)", border: "rgba(96,165,250,0.3)", hint: "Nuove creative" }
  if (campaign.totalOrders === 1)
    return { label: "OSSERVA", color: "#FBBF24", bg: "rgba(251,191,36,0.15)", border: "rgba(251,191,36,0.3)", hint: "Aspetta dati" }
  if (campaign.totalOrders >= 2 && campaign.cpa < avgAov * 0.6)
    return { label: "ANALIZZA", color: "#F97316", bg: "rgba(249,115,22,0.15)", border: "rgba(249,115,22,0.3)", hint: "Controlla target" }
  return { label: "IN CORSO", color: "#A3A3A3", bg: "rgba(163,163,163,0.1)", border: "rgba(163,163,163,0.2)", hint: "Monitora" }
}

// ─── SPARKLINE ────────────────────────────────────────────────────────────────
function Sparkline({ data, color = "#22C55E", height = 40 }: { data: number[]; color?: string; height?: number }) {
  const max = Math.max(...data, 1)
  const min = Math.min(...data)
  const range = max - min || 1
  const w = 120, h = height
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((v - min) / range) * (h - 4) - 2
    return `${x},${y}`
  }).join(" ")
  const areaPoints = `0,${h} ${points} ${w},${h}`
  return (
    <svg width={w} height={h} style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id={`sg-${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#sg-${color.replace("#","")})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ─── KPI CARD ─────────────────────────────────────────────────────────────────
function KPICard({ label, value, sub, trend, sparkData, color = "#22C55E", icon }: { label: string; value: string | number; sub?: string; trend?: number; sparkData?: number[]; color?: string; icon?: string }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 16,
      padding: "20px 22px",
      position: "relative",
      overflow: "hidden",
      transition: "border-color 0.2s",
    }}
    onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)"}
    onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)"}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.35)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
          {icon} {label}
        </div>
        {trend !== undefined && (
          <div style={{
            fontSize: 11, fontWeight: 700,
            color: trend >= 0 ? "#22C55E" : "#EF4444",
            background: trend >= 0 ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
            padding: "2px 8px", borderRadius: 20
          }}>
            {trend >= 0 ? "+" : ""}{trend}%
          </div>
        )}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: "#fff", letterSpacing: "-0.02em", lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 6 }}>{sub}</div>}
      {sparkData && (
        <div style={{ position: "absolute", bottom: 0, right: 0, opacity: 0.6 }}>
          <Sparkline data={sparkData} color={color} height={36} />
        </div>
      )}
    </div>
  )
}

// ─── MINI BAR ─────────────────────────────────────────────────────────────────
function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${(value / max) * 100}%`, background: color, borderRadius: 2, transition: "width 0.8s ease" }} />
    </div>
  )
}

// ─── REVENUE CHART ────────────────────────────────────────────────────────────
function RevenueChart({ data }: { data: Array<{ date: string; revenue: number }> }) {
  const max = Math.max(...data.map(d => d.revenue), 1)
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80, paddingTop: 8 }}>
      {data.map((d, i) => {
        const h = Math.max((d.revenue / max) * 72, 2)
        const day = new Date(d.date).toLocaleDateString("it-IT", { weekday: "short" })
        const isHovered = hoveredIdx === i
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer" }}
            onMouseEnter={() => setHoveredIdx(i)} onMouseLeave={() => setHoveredIdx(null)}>
            {isHovered && (
              <div style={{ fontSize: 10, color: "#22C55E", fontWeight: 700, whiteSpace: "nowrap", background: "rgba(0,0,0,0.8)", padding: "2px 6px", borderRadius: 4 }}>
                {fmtShort(d.revenue)}
              </div>
            )}
            <div style={{
              width: "100%", height: h, borderRadius: "3px 3px 0 0",
              background: isHovered ? "#22C55E" : "rgba(34,197,94,0.35)",
              transition: "background 0.15s, height 0.3s",
              marginTop: "auto"
            }} />
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", textTransform: "uppercase" }}>{day}</div>
          </div>
        )
      })}
    </div>
  )
}

// ─── HOURLY HEATMAP ───────────────────────────────────────────────────────────
function HourlyChart({ data }: { data: Array<{ hour: number; revenue: number }> }) {
  const max = Math.max(...data.map(d => d.revenue), 1)
  return (
    <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 50 }}>
      {data.map((d, i) => {
        const intensity = d.revenue / max
        const color = intensity > 0.7 ? "#F97316" : intensity > 0.4 ? "#FBBF24" : intensity > 0.1 ? "#22C55E" : "rgba(255,255,255,0.06)"
        return (
          <div key={i} title={`${d.hour}:00 — ${fmtShort(d.revenue)}`} style={{ flex: 1, height: Math.max(intensity * 46, 3), background: color, borderRadius: 2, transition: "all 0.3s", cursor: "default" }} />
        )
      })}
    </div>
  )
}

// ─── SOURCE PIE ───────────────────────────────────────────────────────────────
function SourceDonut({ sources }: { sources: Array<{ source: string; revenue: number; purchases: number }> }) {
  const total = sources.reduce((s, x) => s + x.revenue, 0)
  let cum = 0
  const size = 80, cx = 40, cy = 40, r = 30, inner = 18
  const slices = sources.map(s => {
    const frac = s.revenue / total
    const startAngle = cum * 2 * Math.PI - Math.PI / 2
    cum += frac
    const endAngle = cum * 2 * Math.PI - Math.PI / 2
    const cfg = SOURCE_CONFIG[s.source] || { color: "#666" }
    const x1 = cx + r * Math.cos(startAngle), y1 = cy + r * Math.sin(startAngle)
    const x2 = cx + r * Math.cos(endAngle), y2 = cy + r * Math.sin(endAngle)
    const xi1 = cx + inner * Math.cos(startAngle), yi1 = cy + inner * Math.sin(startAngle)
    const xi2 = cx + inner * Math.cos(endAngle), yi2 = cy + inner * Math.sin(endAngle)
    const large = frac > 0.5 ? 1 : 0
    return { ...s, cfg, frac, path: `M${xi1},${yi1} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} L${xi2},${yi2} A${inner},${inner} 0 ${large},0 ${xi1},${yi1} Z` }
  })
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <svg width={size} height={size} style={{ flexShrink: 0 }}>
        {slices.map((s, i) => <path key={i} d={s.path} fill={s.cfg.color} opacity={0.85} />)}
      </svg>
      <div style={{ flex: 1 }}>
        {slices.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: s.cfg.color, flexShrink: 0 }} />
            <div style={{ flex: 1, fontSize: 12, color: "rgba(255,255,255,0.65)" }}>{s.source}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>{(s.frac * 100).toFixed(0)}%</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── JOURNEY BADGE ────────────────────────────────────────────────────────────
function JourneyBadge({ source, campaign, label }: { source: string; campaign?: string; label: string }) {
  const cfg = SOURCE_CONFIG[source] || { color: "#A3A3A3", bg: "rgba(163,163,163,0.1)" }
  return (
    <div style={{ background: cfg.bg, border: `1px solid ${cfg.color}30`, borderRadius: 10, padding: "8px 12px", textAlign: "center", minWidth: 90 }}>
      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.1em" }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: cfg.color }}>{source}</div>
      {campaign && <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginTop: 2, maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={campaign}>{campaign}</div>}
    </div>
  )
}

// ─── MAIN DASHBOARD ───────────────────────────────────────────────────────────
export default function NFRDashboard() {
  const [mode, setMode] = useState("lite") // "lite" | "pro"
  const [tab, setTab] = useState("overview")
  const [expanded, setExpanded] = useState<string | number | null>(null)
  const data = MOCK_DATA
  const sparkRevenue = data.dailyRevenue.map(d => d.revenue)
  const maxCampaignRevenue = Math.max(...data.byCampaignDetail.map(c => c.totalRevenue), 1)

  // CSS-in-JS base styles
  const base = {
    minHeight: "100vh",
    background: "#0A0A0B",
    color: "#fff",
    fontFamily: "'DM Sans', 'Helvetica Neue', Arial, sans-serif",
  }

  return (
    <div style={base}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: #111; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }
        .tab-btn { transition: all 0.15s; cursor: pointer; border: none; font-family: inherit; }
        .tab-btn:hover { opacity: 0.85; }
        .row-hover:hover { background: rgba(255,255,255,0.03) !important; }
        .card-hover { transition: transform 0.15s, box-shadow 0.15s; }
        .card-hover:hover { transform: translateY(-1px); }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .fade-up { animation: fadeUp 0.4s ease forwards; }
        @keyframes pulse-dot { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
        .live-dot { animation: pulse-dot 2s infinite; }
      `}</style>

      {/* ── TOPBAR ── */}
      <div style={{ background: "rgba(10,10,11,0.95)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 24px", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 28, height: 28, background: "linear-gradient(135deg,#fff 0%,#aaa 100%)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 14 }}>N</span>
            </div>
            <span style={{ fontWeight: 800, fontSize: 14, letterSpacing: "-0.01em" }}>NFR Analytics</span>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginLeft: 4 }}>
              <div className="live-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: "#22C55E" }} />
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontFamily: "DM Mono, monospace" }}>LIVE</span>
            </div>
          </div>

          {/* Mode toggle */}
          <div style={{ display: "flex", background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: 3, gap: 2 }}>
            {["lite", "pro"].map(m => (
              <button key={m} className="tab-btn" onClick={() => setMode(m)} style={{
                padding: "5px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                background: mode === m ? "#fff" : "transparent",
                color: mode === m ? "#000" : "rgba(255,255,255,0.4)",
                letterSpacing: "0.05em", textTransform: "uppercase"
              }}>
                {m === "lite" ? "⚡ Lite" : "🔬 Pro"}
              </button>
            ))}
          </div>

          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", fontFamily: "DM Mono, monospace" }}>
            {new Date().toLocaleTimeString("it-IT")} • {data.meta.deduplicatedCount} ordini
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          LITE MODE
      ══════════════════════════════════════════════════════════════════════ */}
      {mode === "lite" && (
        <div className="fade-up" style={{ maxWidth: 680, margin: "0 auto", padding: "24px 16px 48px" }}>

          {/* Date label */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>Questo mese 📅</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>Feb 2026 · aggiornato ora</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 28, fontWeight: 900, color: "#22C55E", letterSpacing: "-0.03em" }}>
                {fmt(data.totalRevenue)}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
                +{data.comparison.revenuePercent}% vs mese scorso
              </div>
            </div>
          </div>

          {/* 3 KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
            {[
              { label: "Ordini", value: data.totalPurchases, trend: `+${data.comparison.purchasesPercent}%`, color: "#60A5FA" },
              { label: "Valore medio", value: fmt(data.avgOrderValue), color: "#FBBF24" },
              { label: "Clienti unici", value: data.uniqueCustomers, color: "#A78BFA" },
            ].map((k, i) => (
              <div key={i} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "14px 16px" }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>{k.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>{k.value}</div>
                {k.trend && <div style={{ fontSize: 11, color: "#22C55E", marginTop: 4, fontWeight: 600 }}>{k.trend}</div>}
              </div>
            ))}
          </div>

          {/* Revenue bars */}
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "18px 20px", marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.4)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.1em" }}>Revenue ultimi 7 giorni</div>
            <RevenueChart data={data.dailyRevenue} />
          </div>

          {/* WHERE DO SALES COME FROM — The hero section in Lite */}
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "18px 20px", marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.4)", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.1em" }}>📍 Da dove vengono i tuoi acquisti</div>
            {data.bySource.map((s, i) => {
              const cfg = SOURCE_CONFIG[s.source] || { color: "#888", bg: "rgba(136,136,136,0.1)" }
              const pct = ((s.revenue / data.totalRevenue) * 100).toFixed(0)
              return (
                <div key={i} style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: cfg.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                    {cfg.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{s.source}</span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: cfg.color }}>{fmt(s.revenue)}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 3 }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: cfg.color, borderRadius: 3, transition: "width 1s ease" }} />
                      </div>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", width: 28, textAlign: "right" }}>{pct}%</span>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", width: 20, textAlign: "right" }}>{s.purchases}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* DECISION CARDS */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.4)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.1em" }}>🎯 Cosa fare adesso</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {data.byCampaignDetail.filter(c => c.source !== "Direct").map((c, i) => {
                const dec = getDecision(c, data.avgOrderValue)
                const cfg = SOURCE_CONFIG[c.source] || { color: "#888" }
                return (
                  <div key={i} style={{
                    background: "rgba(255,255,255,0.03)",
                    border: `1px solid ${dec.border}`,
                    borderRadius: 14, padding: "14px 16px",
                    display: "flex", alignItems: "center", gap: 14
                  }}>
                    <div style={{ width: 8, height: 40, background: dec.color, borderRadius: 4, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: cfg.color, textTransform: "uppercase" }}>{c.source}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.65)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.campaign}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
                        {c.totalOrders} ordini · {fmt(c.totalRevenue)} · AOV {fmt(c.cpa)}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: dec.color, background: dec.bg, padding: "3px 10px", borderRadius: 20, marginBottom: 4 }}>
                        {dec.label}
                      </div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{dec.hint}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ORE CALDE */}
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "18px 20px", marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em" }}>⏰ Ore calde</div>
              <div style={{ display: "flex", gap: 10, fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
                <span style={{ color: "#22C55E" }}>■</span> normale
                <span style={{ color: "#FBBF24" }}>■</span> alto
                <span style={{ color: "#F97316" }}>■</span> picco
              </div>
            </div>
            <HourlyChart data={data.hourlyRevenue} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
              {[0, 6, 12, 18, 23].map(h => (
                <span key={h} style={{ fontSize: 9, color: "rgba(255,255,255,0.25)" }}>{h}h</span>
              ))}
            </div>
          </div>

        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          PRO MODE
      ══════════════════════════════════════════════════════════════════════ */}
      {mode === "pro" && (
        <div className="fade-up">
          {/* Tab Bar */}
          <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 24px" }}>
            <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", gap: 0 }}>
              {[
                { id: "overview", label: "Overview" },
                { id: "campaigns", label: "Campagne" },
                { id: "journey", label: "Customer Journey" },
                { id: "products", label: "Prodotti" },
              ].map(t => (
                <button key={t.id} className="tab-btn" onClick={() => setTab(t.id)} style={{
                  padding: "14px 20px", fontSize: 13, fontWeight: 600,
                  color: tab === t.id ? "#fff" : "rgba(255,255,255,0.35)",
                  background: "transparent",
                  borderBottom: tab === t.id ? "2px solid #fff" : "2px solid transparent",
                  marginBottom: -1,
                }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ maxWidth: 1280, margin: "0 auto", padding: "24px 24px 48px" }}>

            {/* ── OVERVIEW TAB ── */}
            {tab === "overview" && (
              <div>
                {/* KPI grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
                  <KPICard label="Revenue Totale" value={fmt(data.totalRevenue)} trend={data.comparison.revenuePercent} sparkData={sparkRevenue} icon="💰" color="#22C55E" />
                  <KPICard label="Ordini" value={data.totalPurchases} trend={data.comparison.purchasesPercent} sparkData={sparkRevenue.map(v => v / data.avgOrderValue)} icon="🛒" color="#60A5FA" />
                  <KPICard label="AOV" value={fmt(data.avgOrderValue)} sub={`vs ${fmt(data.comparison.avgOrderValue)} prec.`} icon="📊" color="#FBBF24" />
                  <KPICard label="Clienti Unici" value={data.uniqueCustomers} sub={`${(data.uniqueCustomers / data.totalPurchases * 100).toFixed(0)}% repeat rate`} icon="👥" color="#A78BFA" />
                </div>

                {/* Charts row */}
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, marginBottom: 20 }}>
                  <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "20px 22px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.6)" }}>Revenue giornaliero</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", fontFamily: "DM Mono, monospace" }}>ultimi 7 giorni</div>
                    </div>
                    <RevenueChart data={data.dailyRevenue} />
                  </div>
                  <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "20px 22px" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.6)", marginBottom: 16 }}>Distribuzione sorgenti</div>
                    <SourceDonut sources={data.bySource} />
                  </div>
                </div>

                {/* Insights */}
                <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "20px 22px", marginBottom: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.6)", marginBottom: 14 }}>🧠 Insights automatici</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                    {[
                      { type: "success", icon: "🏆", title: "Campagna TOP", msg: "NFR_PROMO50_PMAX genera €601 con 14 ordini — scala il budget del 20%", action: "↑ Budget +20%" },
                      { type: "info", icon: "⏰", title: "Picco ore 19-20", msg: "La fascia 19-20 concentra il 15% delle revenue giornaliere", action: "Ottimizza bid" },
                      { type: "warning", icon: "🔄", title: "Multi-touch rilevato", msg: "3 acquisti Meta→Google: valuta attribuzione lineare", action: "Analizza journey" },
                    ].map((ins, i) => (
                      <div key={i} style={{
                        background: ins.type === "success" ? "rgba(34,197,94,0.06)" : ins.type === "warning" ? "rgba(251,191,36,0.06)" : "rgba(96,165,250,0.06)",
                        border: `1px solid ${ins.type === "success" ? "rgba(34,197,94,0.2)" : ins.type === "warning" ? "rgba(251,191,36,0.2)" : "rgba(96,165,250,0.2)"}`,
                        borderRadius: 12, padding: "14px 16px"
                      }}>
                        <div style={{ fontSize: 18, marginBottom: 6 }}>{ins.icon}</div>
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{ins.title}</div>
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.5, marginBottom: 8 }}>{ins.msg}</div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: ins.type === "success" ? "#22C55E" : ins.type === "warning" ? "#FBBF24" : "#60A5FA" }}>→ {ins.action}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Hourly */}
                <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "20px 22px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.6)" }}>Distribuzione oraria revenue</div>
                    <div style={{ display: "flex", gap: 12, fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
                      <span><span style={{ color: "#22C55E" }}>■</span> bassa</span>
                      <span><span style={{ color: "#FBBF24" }}>■</span> media</span>
                      <span><span style={{ color: "#F97316" }}>■</span> picco</span>
                    </div>
                  </div>
                  <HourlyChart data={data.hourlyRevenue} />
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                    {Array.from({ length: 25 }, (_, i) => i).filter(h => h % 3 === 0).map(h => (
                      <span key={h} style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", fontFamily: "DM Mono, monospace" }}>{h}h</span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── CAMPAIGNS TAB ── */}
            {tab === "campaigns" && (
              <div>
                <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, overflow: "hidden" }}>
                  <div style={{ padding: "18px 22px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>Performance Campagne</div>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>Decisioni operative immediate per ogni campagna</div>
                    </div>
                  </div>

                  {/* Table header */}
                  <div style={{ display: "grid", gridTemplateColumns: "180px 1fr 80px 110px 90px 130px", gap: 0, padding: "10px 22px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    {["Fonte", "Campagna", "Ordini", "Revenue", "AOV", "Decisione"].map((h, i) => (
                      <div key={i} style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.1em", textAlign: i >= 2 ? "right" : "left" }}>{h}</div>
                    ))}
                  </div>

                  {data.byCampaignDetail.map((c, i) => {
                    const dec = getDecision(c, data.avgOrderValue)
                    const cfg = SOURCE_CONFIG[c.source] || { color: "#888", icon: "📌" }
                    const isExp = expanded === i
                    return (
                      <div key={i}>
                        <div className="row-hover" onClick={() => setExpanded(isExp ? null : i)} style={{
                          display: "grid", gridTemplateColumns: "180px 1fr 80px 110px 90px 130px",
                          gap: 0, padding: "14px 22px",
                          borderBottom: "1px solid rgba(255,255,255,0.04)",
                          cursor: "pointer", transition: "background 0.1s"
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontSize: 16 }}>{cfg.icon}</span>
                            <span style={{ fontSize: 13, fontWeight: 600, color: cfg.color }}>{c.source}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <MiniBar value={c.totalRevenue} max={maxCampaignRevenue} color={cfg.color} />
                            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }} title={c.campaign}>{c.campaign || "—"}</span>
                          </div>
                          <div style={{ textAlign: "right", fontSize: 14, fontWeight: 700 }}>{c.totalOrders}</div>
                          <div style={{ textAlign: "right", fontSize: 14, fontWeight: 700, color: "#22C55E" }}>{fmt(c.totalRevenue)}</div>
                          <div style={{ textAlign: "right", fontSize: 13, color: "rgba(255,255,255,0.5)" }}>{fmt(c.cpa)}</div>
                          <div style={{ textAlign: "right" }}>
                            <span style={{ fontSize: 11, fontWeight: 800, color: dec.color, background: dec.bg, border: `1px solid ${dec.border}`, padding: "3px 10px", borderRadius: 20 }}>
                              {dec.label}
                            </span>
                            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 3 }}>{dec.hint}</div>
                          </div>
                        </div>
                        {isExp && (
                          <div style={{ background: "rgba(255,255,255,0.02)", padding: "14px 22px 16px 60px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.2)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Ordini di questa campagna</div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <div style={{ padding: "8px 14px", background: "rgba(255,255,255,0.04)", borderRadius: 8, fontSize: 12 }}>
                                <span style={{ color: "rgba(255,255,255,0.4)" }}>Revenue:</span> <strong>{fmt(c.totalRevenue)}</strong>
                              </div>
                              <div style={{ padding: "8px 14px", background: "rgba(255,255,255,0.04)", borderRadius: 8, fontSize: 12 }}>
                                <span style={{ color: "rgba(255,255,255,0.4)" }}>Ordini:</span> <strong>{c.totalOrders}</strong>
                              </div>
                              <div style={{ padding: "8px 14px", background: "rgba(255,255,255,0.04)", borderRadius: 8, fontSize: 12 }}>
                                <span style={{ color: "rgba(255,255,255,0.4)" }}>AOV:</span> <strong>{fmt(c.cpa)}</strong>
                              </div>
                              <div style={{ padding: "8px 14px", background: "rgba(255,255,255,0.04)", borderRadius: 8, fontSize: 12 }}>
                                <span style={{ color: "rgba(255,255,255,0.4)" }}>% revenue:</span> <strong>{((c.totalRevenue / data.totalRevenue) * 100).toFixed(1)}%</strong>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── JOURNEY TAB ── */}
            {tab === "journey" && (
              <div>
                <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "20px 22px", marginBottom: 16 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>🗺️ Customer Journey</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>Come ogni cliente ti ha trovato e cosa lo ha convinto a comprare. 1° touch → last touch → acquisto.</div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {data.recentPurchases.map((p, i) => {
                    const firstSrc = p.utm?.first_source || p.utm?.source || "Direct"
                    const lastSrc = p.utm?.source || "Direct"
                    const isMulti = firstSrc !== lastSrc
                    const key = p.orderId || String(i)
                    const isExp = expanded === key
                    return (
                      <div key={key} onClick={() => setExpanded(isExp ? null : key)} style={{
                        background: "rgba(255,255,255,0.03)",
                        border: isMulti ? "1px solid rgba(167,139,250,0.25)" : "1px solid rgba(255,255,255,0.06)",
                        borderRadius: 16, padding: "16px 20px", cursor: "pointer",
                        transition: "border-color 0.15s"
                      }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <span style={{ fontSize: 14, fontWeight: 800 }}>#{p.orderNumber}</span>
                            <span style={{ fontSize: 15, fontWeight: 800, color: "#22C55E" }}>{fmt(p.value)}</span>
                            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontFamily: "DM Mono, monospace" }}>
                              {new Date(p.timestamp).toLocaleDateString("it-IT")} {new Date(p.timestamp).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            {isMulti && <span style={{ fontSize: 11, fontWeight: 700, color: "#A78BFA", background: "rgba(167,139,250,0.12)", padding: "2px 10px", borderRadius: 20 }}>🔄 Multi-touch</span>}
                            {p.customer?.city && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>📍 {p.customer.city}</span>}
                          </div>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <JourneyBadge source={firstSrc} campaign={p.utm?.first_campaign} label="1° Touch" />
                          <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 18, fontWeight: 300 }}>→</div>
                          <JourneyBadge source={lastSrc} campaign={p.utm?.campaign} label="Last Touch" />
                          <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 18, fontWeight: 300 }}>→</div>
                          <div style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 10, padding: "8px 14px", textAlign: "center" }}>
                            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.1em" }}>Acquisto</div>
                            <div style={{ fontSize: 15, fontWeight: 800, color: "#22C55E" }}>{fmt(p.value)}</div>
                          </div>
                        </div>

                        {isExp && (
                          <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)", display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
                            <div>
                              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Cliente</div>
                              <div style={{ fontSize: 13, fontWeight: 600 }}>{p.customer?.fullName || "—"}</div>
                              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{p.customer?.email || "—"}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>UTM last click</div>
                              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontFamily: "DM Mono, monospace", lineHeight: 1.8 }}>
                                src: {p.utm?.source || "—"}<br/>
                                med: {p.utm?.medium || "—"}<br/>
                                camp: {p.utm?.campaign?.slice(0,20) || "—"}
                              </div>
                            </div>
                            <div>
                              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Prodotti</div>
                              {p.items?.map((item, j) => (
                                <div key={j} style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.8 }}>{item.quantity}× {item.title}</div>
                              ))}
                            </div>
                            <div>
                              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Click ID</div>
                              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", fontFamily: "DM Mono, monospace", lineHeight: 1.8 }}>
                                {p.utm?.fbclid && <div>fb: {p.utm.fbclid.slice(0,12)}…</div>}
                                {p.utm?.gclid && <div>g: {p.utm.gclid.slice(0,12)}…</div>}
                                {p.utm?.ttclid && <div>tt: {p.utm.ttclid.slice(0,12)}…</div>}
                                {!p.utm?.fbclid && !p.utm?.gclid && !p.utm?.ttclid && "—"}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── PRODUCTS TAB ── */}
            {tab === "products" && (
              <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, overflow: "hidden" }}>
                <div style={{ padding: "18px 22px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>📦 Performance Prodotti</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 120px 110px", padding: "10px 22px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  {["Prodotto","Qtà","Ordini","Revenue","Prezzo medio"].map((h,i) => (
                    <div key={i} style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.1em", textAlign: i > 0 ? "right" : "left" }}>{h}</div>
                  ))}
                </div>
                {data.byProduct.map((p, i) => {
                  const maxRev = Math.max(...data.byProduct.map(x => x.revenue))
                  return (
                    <div key={i} className="row-hover" style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 120px 110px", padding: "14px 22px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{p.title}</div>
                        <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, maxWidth: 200 }}>
                          <div style={{ height: "100%", width: `${(p.revenue / maxRev) * 100}%`, background: "#22C55E", borderRadius: 2 }} />
                        </div>
                      </div>
                      <div style={{ textAlign: "right", fontSize: 13, fontWeight: 600 }}>{p.quantity}</div>
                      <div style={{ textAlign: "right", fontSize: 13, color: "rgba(255,255,255,0.5)" }}>{p.orders}</div>
                      <div style={{ textAlign: "right", fontSize: 13, fontWeight: 700, color: "#22C55E" }}>{fmt(p.revenue)}</div>
                      <div style={{ textAlign: "right", fontSize: 13, color: "rgba(255,255,255,0.5)" }}>{fmt(p.revenue / p.orders)}</div>
                    </div>
                  )
                })}
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  )
}