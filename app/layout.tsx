import type { Metadata } from 'next'
import './globals.css'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Tradebot',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body>
        <nav className="flex gap-6 p-4 bg-gray-900 text-white">
          <Link href="/" className="font-bold text-lg">Tradebot</Link>
          <Link href="/trades" className="hover:text-gray-300">İşlem Geçmişi</Link>
          <Link href="/missed" className="hover:text-gray-300">Kaçırılmış İşlemler</Link>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  )
}
