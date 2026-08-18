'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/', label: '🤖 Kripto Bot' },
  { href: '/bist', label: '📈 BIST Analiz' },
]

export default function Navbar() {
  const pathname = usePathname()
  return (
    <nav className="bg-gray-900 border-b border-gray-800 px-4">
      <div className="flex gap-1">
        {TABS.map(tab => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              pathname === tab.href
                ? 'text-white border-blue-500'
                : 'text-gray-400 border-transparent hover:text-white hover:border-gray-600'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>
    </nav>
  )
}
