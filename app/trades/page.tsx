import { supabase } from '@/lib/supabase'

export default async function TradesPage() {
  const { data: trades } = await supabase
    .from('trades')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">İşlem Geçmişi</h1>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-100 text-left">
            <th className="p-3 border">Sembol</th>
            <th className="p-3 border">Yön</th>
            <th className="p-3 border">Fiyat</th>
            <th className="p-3 border">Miktar</th>
            <th className="p-3 border">Toplam</th>
            <th className="p-3 border">K/Z</th>
            <th className="p-3 border">Tarih</th>
          </tr>
        </thead>
        <tbody>
          {trades?.map((t) => (
            <tr key={t.id} className="hover:bg-gray-50">
              <td className="p-3 border font-medium">{t.symbol}</td>
              <td className={`p-3 border font-semibold ${t.side === 'BUY' ? 'text-green-600' : 'text-red-600'}`}>{t.side}</td>
              <td className="p-3 border">${t.price.toLocaleString()}</td>
              <td className="p-3 border">{t.quantity}</td>
              <td className="p-3 border">${t.total.toLocaleString()}</td>
              <td className={`p-3 border ${t.profit_loss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {t.profit_loss != null ? `$${t.profit_loss.toFixed(2)}` : '-'}
              </td>
              <td className="p-3 border text-gray-500">{new Date(t.created_at).toLocaleString('tr-TR')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
