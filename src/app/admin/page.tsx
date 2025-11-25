// src/app/admin/page.tsx
"use client"

import { useEffect, useState } from 'react'
import Stripe from 'stripe'

type Transaction = {
  id: string
  amount: number
  currency: string
  status: string
  created: number
  email: string
  errorCode?: string
  errorMessage?: string
  declineCode?: string
}

export default function AdminDashboard() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'success' | 'failed'>('all')

  useEffect(() => {
    loadTransactions()
  }, [])

  async function loadTransactions() {
    try {
      setLoading(true)
      
      // Chiama direttamente Stripe dal client (solo per admin)
      const response = await fetch('/api/admin-transactions')
      
      if (!response.ok) {
        throw new Error('Errore caricamento')
      }

      const data = await response.json()
      setTransactions(data.transactions)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const formatMoney = (cents: number, currency: string) => {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(cents / 100)
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getErrorLabel = (errorCode?: string, declineCode?: string) => {
    const errors: Record<string, string> = {
      card_declined: 'Carta rifiutata',
      insufficient_funds: 'Fondi insufficienti',
      expired_card: 'Carta scaduta',
      incorrect_cvc: 'CVV errato',
      incorrect_number: 'Numero carta errato',
      processing_error: 'Errore temporaneo',
      card_not_supported: 'Carta non supportata',
      fraudulent: 'Transazione fraudolenta',
      do_not_honor: 'Rifiutata dalla banca',
      generic_decline: 'Rifiutata generica',
      lost_card: 'Carta smarrita',
      stolen_card: 'Carta rubata',
    }
    if (declineCode) return errors[declineCode] || declineCode
    if (errorCode) return errors[errorCode] || errorCode
    return 'Errore sconosciuto'
  }

  const isSuccess = (tx: Transaction) => tx.status === 'succeeded'
  const isFailed = (tx: Transaction) => tx.status === 'failed' || tx.errorCode || tx.declineCode

  const filteredTransactions = transactions.filter(tx => {
    if (filter === 'success') return isSuccess(tx)
    if (filter === 'failed') return isFailed(tx)
    return true
  })

  const successCount = transactions.filter(isSuccess).length
  const failedCount = transactions.filter(isFailed).length
  const successRate = transactions.length > 0 
    ? ((successCount / transactions.length) * 100).toFixed(1) 
    : '0'

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Caricamento transazioni...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <p className="text-red-700">{error}</p>
          <button
            onClick={loadTransactions}
            className="mt-4 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
          >
            Riprova
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">Dashboard Transazioni</h1>
            <button
              onClick={loadTransactions}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Aggiorna
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <p className="text-sm text-gray-600 font-medium">Totale</p>
            <p className="text-3xl font-bold text-gray-900 mt-2">{transactions.length}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <p className="text-sm text-gray-600 font-medium">Successo</p>
            <p className="text-3xl font-bold text-green-600 mt-2">{successCount}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <p className="text-sm text-gray-600 font-medium">Falliti</p>
            <p className="text-3xl font-bold text-red-600 mt-2">{failedCount}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <p className="text-sm text-gray-600 font-medium">Tasso successo</p>
            <p className="text-3xl font-bold text-blue-600 mt-2">{successRate}%</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-4 mb-6">
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Tutte ({transactions.length})
            </button>
            <button
              onClick={() => setFilter('success')}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                filter === 'success' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              ✓ Successo ({successCount})
            </button>
            <button
              onClick={() => setFilter('failed')}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                filter === 'failed' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              ✗ Falliti ({failedCount})
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Data</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Email</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Importo</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredTransactions.map((tx) => {
                  const success = isSuccess(tx)
                  const failed = isFailed(tx)
                  
                  return (
                    <tr 
                      key={tx.id} 
                      className={`hover:bg-gray-50 transition ${
                        success ? 'bg-green-50' : failed ? 'bg-red-50' : ''
                      }`}
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(tx.created)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">{tx.email}</div>
                        {failed && (
                          <div className="mt-1 inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-800">
                            🚫 {getErrorLabel(tx.errorCode, tx.declineCode)}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                        {formatMoney(tx.amount, tx.currency)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {success && (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                            ✓ Completato
                          </span>
                        )}
                        {failed && (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800">
                            ✗ Fallito
                          </span>
                        )}
                        {!success && !failed && (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
                            ⏳ In sospeso
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <a
                          href={`https://dashboard.stripe.com/payments/${tx.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 font-medium"
                        >
                          Vedi su Stripe →
                        </a>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
