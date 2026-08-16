import Link from 'next/link'

export default function Home() {
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">Tradebot Dashboard</h1>
      <div className="flex gap-4">
        <Link href="/trades" className="px-6 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          İşlem Geçmişi
        </Link>
        <Link href="/missed" className="px-6 py-4 bg-orange-500 text-white rounded-lg hover:bg-orange-600">
          Kaçırılmış İşlemler
        </Link>
      </div>
    </div>
  )
}
