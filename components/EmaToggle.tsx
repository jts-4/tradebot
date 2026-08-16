'use client'
import { useState } from 'react'

export default function EmaToggle({ initial }: { initial: boolean }) {
  const [enabled, setEnabled] = useState(initial)
  const [loading, setLoading] = useState(false)

  async function toggle() {
    setLoading(true)
    const next = !enabled
    await fetch('/api/toggle-ema', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: next }),
    })
    setEnabled(next)
    setLoading(false)
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-400">EMA21/50/200 Rejim Filtresi</span>
      <button
        onClick={toggle}
        disabled={loading}
        className={`relative w-12 h-6 rounded-full transition-colors ${enabled ? 'bg-blue-600' : 'bg-gray-600'} ${loading ? 'opacity-50' : ''}`}
      >
        <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${enabled ? 'left-7' : 'left-1'}`} />
      </button>
      <span className={`text-xs font-medium ${enabled ? 'text-blue-400' : 'text-gray-500'}`}>
        {enabled ? 'AÇIK' : 'KAPALI'}
      </span>
    </div>
  )
}
