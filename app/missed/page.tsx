import { supabase } from '@/lib/supabase'

export default async function MissedPage() {
  const { data: missed } = await supabase
    .from('missed_trades')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Kaçırılmış İşlemler</h1>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-100 text-left">
            <th className="p-3 border">Sembol</th>
            <th className="p-3 border">Yön</th>
            <th className="p-3 border">Sinyal Fiyatı</th>
            <th className="p-3 border">Güncel Fiyat</th>
            <th className="p-3 border">Sebep</th>
            <th className="p-3 border">Tarih</th>
          </tr>
        </thead>
        <tbody>
          {missed?.map((m) => (
            <tr key={m.id} className="hover:bg-gray-50">
              <td className="p-3 border font-medium">{m.symbol}</td>
              <td className={`p-3 border font-semibold ${m.side === 'BUY' ? 'text-green-600' : 'text-red-600'}`}>{m.side}</td>
              <td className="p-3 border">${m.signal_price.toLocaleString()}</td>
              <td className="p-3 border">{m.current_price ? `$${m.current_price.toLocaleString()}` : '-'}</td>
              <td className="p-3 border text-gray-500">{m.reason}</td>
              <td className="p-3 border text-gray-500">{new Date(m.created_at).toLocaleString('tr-TR')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
