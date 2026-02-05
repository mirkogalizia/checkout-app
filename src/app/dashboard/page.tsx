// src/app/dashboard/page.tsx
"use client"

import { useEffect, useState } from "react"
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

type DashboardData = {
  totalPurchases: number
  totalRevenue: number
  avgOrderValue: number
  uniqueCustomers: number
  byCampaign: Array<{
    campaign: string
    source: string
    medium: string
    purchases: number
    revenue: number
  }>
  bySource: Array<{
    source: string
    purchases: number
    revenue: number
  }>
  byAd: Array<{
    adId: string
    campaign: string
    source: string
    purchases: number
    revenue: number
  }>
  byProduct: Array<{
    title: string
    quantity: number
    revenue: number
    orders: number
  }>
  recentPurchases: Array<any>
  dailyRevenue: Array<{
    date: string
    revenue: number
  }>
  hourlyRevenue: Array<{
    hour: number
    revenue: number
  }>
  comparison: {
    purchases: number
    revenue: number
    avgOrderValue: number
    purchasesDiff: number
    revenueDiff: number
    avgOrderDiff: number
    purchasesPercent: number
    revenuePercent: number
  } | null
}

const COLORS = {
  facebook: '#1877F2',
  google: '#EA4335',
  instagram: '#E4405F',
  tiktok: '#000000',
  direct: '#6B7280',
  email: '#7C3AED',
  organic: '#10B981',
}

const PIE_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899']

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [darkMode, setDarkMode] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [showComparison, setShowComparison] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())
  const [notification, setNotification] = useState<string | null>(null)
  
  const [dateRange, setDateRange] = useState({
    start: '',
    end: ''
  })
  
  const [compareRange, setCompareRange] = useState({
    start: '',
    end: ''
  })

  const loadData = async (showNotif = false) => {
    try {
      let url = '/api/analytics/dashboard?limit=1000'
      if (dateRange.start) url += `&startDate=${dateRange.start}`
      if (dateRange.end) url += `&endDate=${dateRange.end}`
      if (showComparison && compareRange.start && compareRange.end) {
        url += `&compareStartDate=${compareRange.start}&compareEndDate=${compareRange.end}`
      }
      
      const res = await fetch(url)
      const json = await res.json()
      
      // Check for new orders
      if (data && json.totalPurchases > data.totalPurchases && showNotif) {
        const diff = json.totalPurchases - data.totalPurchases
        showNotification(`🎉 ${diff} ${diff === 1 ? 'nuovo ordine' : 'nuovi ordini'}!`)
      }
      
      setData(json)
      setLastUpdate(new Date())
    } catch (err) {
      console.error('Errore caricamento dashboard:', err)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  // Auto-refresh ogni 30 secondi
  useEffect(() => {
    if (!autoRefresh) return
    
    const interval = setInterval(() => {
      loadData(true)
    }, 30000)
    
    return () => clearInterval(interval)
  }, [autoRefresh, dateRange, compareRange, showComparison, data])

  const showNotification = (message: string) => {
    setNotification(message)
    setTimeout(() => setNotification(null), 4000)
  }

  const exportCSV = () => {
    if (!data) return
    
    const rows = [
      ['Ordine', 'Data', 'Valore', 'Campagna', 'Sorgente', 'Email', 'Prodotti'],
      ...data.recentPurchases.map((p: any) => [
        p.orderNumber || '',
        p.timestamp || '',
        p.value || 0,
        p.utm?.campaign || 'direct',
        p.utm?.source || 'direct',
        p.customer?.email || '',
        p.items?.map((i: any) => `${i.title} x${i.quantity}`).join('; ') || ''
      ])
    ]
    
    const csv = rows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `analytics_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    
    showNotification('📥 CSV scaricato!')
  }

  const formatMoney = (value: number) => {
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
    }).format(value)
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }
  
  const formatShortDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('it-IT', {
      day: '2-digit',
      month: 'short'
    })
  }

  const getSourceBadgeColor = (source: string) => {
    return COLORS[source.toLowerCase() as keyof typeof COLORS] || COLORS.direct
  }

  const renderTrend = (current: number, previous: number) => {
    if (previous === 0) return null
    const percent = ((current - previous) / previous) * 100
    const isPositive = percent >= 0
    
    return (
      <span className={`text-sm font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
        {isPositive ? '↑' : '↓'} {Math.abs(percent).toFixed(1)}%
      </span>
    )
  }

  if (loading) {
    return (
      <div className={`min-h-screen ${darkMode ? 'bg-gray-900' : 'bg-gray-50'} flex items-center justify-center`}>
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className={darkMode ? 'text-gray-300' : 'text-gray-600'}>Caricamento analytics...</p>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className={`min-h-screen ${darkMode ? 'bg-gray-900' : 'bg-gray-50'} flex items-center justify-center`}>
        <div className="text-center">
          <p className={darkMode ? 'text-gray-300' : 'text-gray-600'}>Errore caricamento dati</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'}`}>
      {/* Toast Notification */}
      {notification && (
        <div className="fixed top-4 right-4 z-50 animate-slide-in">
          <div className="bg-blue-600 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-3">
            <span>{notification}</span>
            <button onClick={() => setNotification(null)} className="text-white hover:text-gray-200">
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold">Dashboard Analytics</h1>
              <p className={`text-sm mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Not For Resale • Aggiornato: {lastUpdate.toLocaleTimeString('it-IT')}
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
  <button
    onClick={() => setAutoRefresh(!autoRefresh)}
    className={`px-4 py-2 rounded-md text-sm font-medium transition ${
      autoRefresh
        ? 'bg-green-600 text-white'
        : darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'
    }`}
  >
    {autoRefresh ? '⚡ Auto-refresh: ON' : '⏸️ Auto-refresh: OFF'}
  </button>
  <button
    onClick={exportCSV}
    className={`px-4 py-2 rounded-md text-sm font-medium transition ${
      darkMode 
        ? 'bg-gray-700 text-white hover:bg-gray-600' 
        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
    }`}
  >
    📥 Export CSV
  </button>
  <button
    onClick={() => setDarkMode(!darkMode)}
    className={`px-4 py-2 rounded-md text-sm font-medium transition ${
      darkMode 
        ? 'bg-gray-700 text-white hover:bg-gray-600' 
        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
    }`}
  >
    {darkMode ? '☀️' : '🌙'}
  </button>
  
    href="https://notforresale.it"
    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition text-sm font-medium"
  >
    Vai al sito
  </a>
</div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Filtri */}
        <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border p-6 mb-6`}>
          <h2 className="text-lg font-semibold mb-4">Filtri e Confronto</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium mb-2">Periodo Principale</label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={dateRange.start}
                  onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
                  className={`flex-1 px-3 py-2 border rounded-md text-sm ${
                    darkMode 
                      ? 'bg-gray-700 border-gray-600 text-white' 
                      : 'bg-white border-gray-300 text-gray-900'
                  }`}
                />
                <input
                  type="date"
                  value={dateRange.end}
                  onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
                  className={`flex-1 px-3 py-2 border rounded-md text-sm ${
                    darkMode 
                      ? 'bg-gray-700 border-gray-600 text-white' 
                      : 'bg-white border-gray-300 text-gray-900'
                  }`}
                />
              </div>
            </div>
            
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium">Periodo di Confronto</label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={showComparison}
                    onChange={(e) => setShowComparison(e.target.checked)}
                    className="rounded"
                  />
                  Abilita confronto
                </label>
              </div>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={compareRange.start}
                  onChange={(e) => setCompareRange({...compareRange, start: e.target.value})}
                  disabled={!showComparison}
                  className={`flex-1 px-3 py-2 border rounded-md text-sm ${
                    darkMode 
                      ? 'bg-gray-700 border-gray-600 text-white disabled:opacity-50' 
                      : 'bg-white border-gray-300 text-gray-900 disabled:opacity-50'
                  }`}
                />
                <input
                  type="date"
                  value={compareRange.end}
                  onChange={(e) => setCompareRange({...compareRange, end: e.target.value})}
                  disabled={!showComparison}
                  className={`flex-1 px-3 py-2 border rounded-md text-sm ${
                    darkMode 
                      ? 'bg-gray-700 border-gray-600 text-white disabled:opacity-50' 
                      : 'bg-white border-gray-300 text-gray-900 disabled:opacity-50'
                  }`}
                />
              </div>
            </div>
          </div>
          
          <div className="flex gap-3 mt-4">
            <button
              onClick={() => loadData()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition text-sm font-medium"
            >
              Applica Filtri
            </button>
            <button
              onClick={() => {
                setDateRange({start: '', end: ''})
                setCompareRange({start: '', end: ''})
                setShowComparison(false)
                setTimeout(() => loadData(), 100)
              }}
              className={`px-4 py-2 rounded-md transition text-sm font-medium ${
                darkMode 
                  ? 'bg-gray-700 text-white hover:bg-gray-600' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Reset
            </button>
          </div>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} p-6 rounded-lg shadow-sm border`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm font-medium ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Totale Ordini
                </p>
                <p className="text-3xl font-bold mt-2">{data.totalPurchases}</p>
                {data.comparison && renderTrend(data.totalPurchases, data.comparison.purchases)}
              </div>
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
              </div>
            </div>
          </div>

          <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} p-6 rounded-lg shadow-sm border`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm font-medium ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Revenue Totale
                </p>
                <p className="text-3xl font-bold text-green-600 mt-2">
                  {formatMoney(data.totalRevenue)}
                </p>
                {data.comparison && renderTrend(data.totalRevenue, data.comparison.revenue)}
              </div>
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>

          <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} p-6 rounded-lg shadow-sm border`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm font-medium ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Valore Medio Ordine
                </p>
                <p className="text-3xl font-bold mt-2">
                  {formatMoney(data.avgOrderValue)}
                </p>
                {data.comparison && renderTrend(data.avgOrderValue, data.comparison.avgOrderValue)}
              </div>
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
            </div>
          </div>

          <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} p-6 rounded-lg shadow-sm border`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm font-medium ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Clienti Unici
                </p>
                <p className="text-3xl font-bold mt-2">{data.uniqueCustomers}</p>
                <p className={`text-sm mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                  {data.totalPurchases > 0 ? ((data.uniqueCustomers / data.totalPurchases) * 100).toFixed(0) : 0}% repeat rate
                </p>
              </div>
              <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Comparison Banner */}
        {data.comparison && (
          <div className={`${darkMode ? 'bg-blue-900 border-blue-800' : 'bg-blue-50 border-blue-200'} border rounded-lg p-6 mb-8`}>
            <h3 className="text-lg font-semibold mb-4">📊 Confronto Periodi</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <p className={`text-sm ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>Ordini</p>
                <p className="text-2xl font-bold mt-1">
                  {data.totalPurchases} vs {data.comparison.purchases}
                </p>
                <p className={`text-sm mt-1 font-medium ${
                  data.comparison.purchasesPercent >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {data.comparison.purchasesPercent >= 0 ? '↑' : '↓'} {Math.abs(data.comparison.purchasesPercent)}%
                  ({data.comparison.purchasesDiff >= 0 ? '+' : ''}{data.comparison.purchasesDiff})
                </p>
              </div>
              <div>
                <p className={`text-sm ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>Revenue</p>
                <p className="text-2xl font-bold mt-1">
                  {formatMoney(data.totalRevenue)} vs {formatMoney(data.comparison.revenue)}
                </p>
                <p className={`text-sm mt-1 font-medium ${
                  data.comparison.revenuePercent >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {data.comparison.revenuePercent >= 0 ? '↑' : '↓'} {Math.abs(data.comparison.revenuePercent)}%
                  ({formatMoney(data.comparison.revenueDiff)})
                </p>
              </div>
              <div>
                <p className={`text-sm ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>AOV</p>
                <p className="text-2xl font-bold mt-1">
                  {formatMoney(data.avgOrderValue)} vs {formatMoney(data.comparison.avgOrderValue)}
                </p>
                <p className={`text-sm mt-1 font-medium ${
                  data.comparison.avgOrderDiff >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {data.comparison.avgOrderDiff >= 0 ? '↑' : '↓'} {formatMoney(Math.abs(data.comparison.avgOrderDiff))}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Daily Revenue Line Chart */}
          <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border p-6`}>
            <h2 className="text-xl font-semibold mb-4">📈 Revenue Giornaliera</h2>
            {data.dailyRevenue.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={data.dailyRevenue}>
                  <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#374151' : '#E5E7EB'} />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(value) => formatShortDate(String(value))}
                    stroke={darkMode ? '#9CA3AF' : '#6B7280'}
                  />
                  <YAxis stroke={darkMode ? '#9CA3AF' : '#6B7280'} />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: darkMode ? '#1F2937' : '#FFFFFF',
                      border: `1px solid ${darkMode ? '#374151' : '#E5E7EB'}`,
                      borderRadius: '8px'
                    }}
                    formatter={(value: any) => [formatMoney(value), 'Revenue']}
                    labelFormatter={(label: any) => formatShortDate(String(label))}
                  />
                  <Line type="monotone" dataKey="revenue" stroke="#3B82F6" strokeWidth={2} dot={{ fill: '#3B82F6' }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className={darkMode ? 'text-gray-400' : 'text-gray-500'}>Nessun dato disponibile</p>
            )}
          </div>

          {/* Source Pie Chart */}
          <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border p-6`}>
            <h2 className="text-xl font-semibold mb-4">🥧 Revenue per Sorgente</h2>
            {data.bySource.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={data.bySource}
                    dataKey="revenue"
                    nameKey="source"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={(props: any) => {
                      const { source, revenue } = props.payload;
                      return `${source}: ${formatMoney(revenue)}`;
                    }}
                  >
                    {data.bySource.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: darkMode ? '#1F2937' : '#FFFFFF',
                      border: `1px solid ${darkMode ? '#374151' : '#E5E7EB'}`,
                      borderRadius: '8px'
                    }}
                    formatter={(value: any) => [formatMoney(value), 'Revenue']}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className={darkMode ? 'text-gray-400' : 'text-gray-500'}>Nessun dato disponibile</p>
            )}
          </div>
        </div>

        {/* Campaign Bar Chart */}
        <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border p-6 mb-8`}>
          <h2 className="text-xl font-semibold mb-4">📊 Performance per Campagna</h2>
          {data.byCampaign.length > 0 ? (
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={data.byCampaign.slice(0, 10)}>
                <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#374151' : '#E5E7EB'} />
                <XAxis 
                  dataKey="campaign" 
                  stroke={darkMode ? '#9CA3AF' : '#6B7280'}
                  angle={-45}
                  textAnchor="end"
                  height={100}
                />
                <YAxis stroke={darkMode ? '#9CA3AF' : '#6B7280'} />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: darkMode ? '#1F2937' : '#FFFFFF',
                    border: `1px solid ${darkMode ? '#374151' : '#E5E7EB'}`,
                    borderRadius: '8px'
                  }}
                  formatter={(value: any, name: string) => {
                    if (name === 'revenue') return [formatMoney(value), 'Revenue']
                    return [value, 'Ordini']
                  }}
                />
                <Legend />
                <Bar dataKey="purchases" fill="#3B82F6" name="Ordini" />
                <Bar dataKey="revenue" fill="#10B981" name="Revenue" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className={darkMode ? 'text-gray-400' : 'text-gray-500'}>Nessun dato disponibile</p>
          )}
        </div>

        {/* Hourly Revenue */}
        <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border p-6 mb-8`}>
          <h2 className="text-xl font-semibold mb-4">🕐 Revenue per Ora del Giorno</h2>
          {data.hourlyRevenue.some(h => h.revenue > 0) ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.hourlyRevenue}>
                <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#374151' : '#E5E7EB'} />
                <XAxis 
                  dataKey="hour" 
                  stroke={darkMode ? '#9CA3AF' : '#6B7280'}
                  tickFormatter={(hour) => `${hour}:00`}
                />
                <YAxis stroke={darkMode ? '#9CA3AF' : '#6B7280'} />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: darkMode ? '#1F2937' : '#FFFFFF',
                    border: `1px solid ${darkMode ? '#374151' : '#E5E7EB'}`,
                    borderRadius: '8px'
                  }}
                  formatter={(value: any) => [formatMoney(value), 'Revenue']}
                  labelFormatter={(hour: any) => `Ore ${hour}:00`}
                />
                <Bar dataKey="revenue" fill="#8B5CF6" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className={darkMode ? 'text-gray-400' : 'text-gray-500'}>Nessun dato disponibile</p>
          )}
        </div>

        {/* Top Products */}
        {data.byProduct.length > 0 && (
          <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border mb-8`}>
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-semibold">🏆 Top 10 Prodotti</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className={darkMode ? 'bg-gray-700' : 'bg-gray-50'}>
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Prodotto
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Quantità
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ordini
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Revenue
                    </th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${darkMode ? 'divide-gray-700' : 'divide-gray-200'}`}>
                  {data.byProduct.map((product, idx) => (
                    <tr key={idx} className={darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '•'}</span>
                          <span className="text-sm font-medium">{product.title}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <span className="text-sm">{product.quantity}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <span className="text-sm">{product.orders}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <span className="text-sm font-semibold text-green-600">
                          {formatMoney(product.revenue)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Performance per Campagna Table */}
        <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border mb-8`}>
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-semibold">🎯 Performance Dettagliate per Campagna</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className={darkMode ? 'bg-gray-700' : 'bg-gray-50'}>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Campagna
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Sorgente
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ordini
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Revenue
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    AOV
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    % Revenue
                  </th>
                </tr>
              </thead>
              <tbody className={`divide-y ${darkMode ? 'divide-gray-700' : 'divide-gray-200'}`}>
                {data.byCampaign.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-4 text-center text-sm text-gray-500">
                      Nessun dato disponibile
                    </td>
                  </tr>
                ) : (
                  data.byCampaign.map((campaign, idx) => (
                    <tr key={idx} className={darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium">{campaign.campaign}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span 
                          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-white"
                          style={{ backgroundColor: getSourceBadgeColor(campaign.source) }}
                        >
                          {campaign.source} / {campaign.medium}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="text-sm">{campaign.purchases}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="text-sm font-semibold text-green-600">
                          {formatMoney(campaign.revenue)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="text-sm">
                          {formatMoney(campaign.revenue / campaign.purchases)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="text-sm">
                          {((campaign.revenue / data.totalRevenue) * 100).toFixed(1)}%
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Performance per Ad */}
        {data.byAd.length > 0 && (
          <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border mb-8`}>
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-semibold">🎨 Performance per Ad</h2>
              <p className={`text-sm mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Basato su utm_content (ad.id)
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className={darkMode ? 'bg-gray-700' : 'bg-gray-50'}>
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ad ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Campagna
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ordini
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Revenue
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      AOV
                    </th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${darkMode ? 'divide-gray-700' : 'divide-gray-200'}`}>
                  {data.byAd.map((ad, idx) => (
                    <tr key={idx} className={darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-mono font-medium">{ad.adId}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-600 dark:text-gray-400">{ad.campaign}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="text-sm">{ad.purchases}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="text-sm font-semibold text-green-600">
                          {formatMoney(ad.revenue)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="text-sm">
                          {formatMoney(ad.revenue / ad.purchases)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Ultimi Acquisti */}
        <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border`}>
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-semibold">🛒 Ultimi Acquisti</h2>
          </div>
          <div className={`divide-y ${darkMode ? 'divide-gray-700' : 'divide-gray-200'}`}>
            {data.recentPurchases.length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-gray-500">
                Nessun acquisto disponibile
              </div>
            ) : (
              data.recentPurchases.map((purchase, idx) => (
                <div key={idx} className={`px-6 py-4 ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}`}>
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="font-semibold">
                          #{purchase.orderNumber || 'N/A'}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          {purchase.utm?.campaign || 'direct'}
                        </div>
                        {purchase.utm?.source && (
                          <span 
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-white"
                            style={{ backgroundColor: getSourceBadgeColor(purchase.utm.source) }}
                          >
                            {purchase.utm.source}
                          </span>
                        )}
                        {purchase.utm?.content && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300">
                            Ad: {purchase.utm.content}
                          </span>
                        )}
                      </div>
                      <div className={`text-xs mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                        {purchase.customer?.email || 'N/A'} • {formatDate(purchase.timestamp)}
                      </div>
                      {purchase.items && purchase.items.length > 0 && (
                        <div className={`text-xs mt-1 ${darkMode ? 'text-gray-600' : 'text-gray-600'}`}>
                          {purchase.items.map((item: any, i: number) => (
                            <span key={i}>
                              {item.title} × {item.quantity}
                              {i < purchase.items.length - 1 && ', '}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="text-right ml-4">
                      <div className="text-lg font-semibold text-green-600">
                        {formatMoney(purchase.value)}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes slide-in {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
      `}</style>
    </div>
  )
}
