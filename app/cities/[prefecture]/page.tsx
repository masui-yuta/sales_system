import Link from 'next/link'
import Header from '@/components/Header'
import { getCities } from '@/lib/companies'

export default async function CitiesPage({
  params,
}: {
  params: Promise<{ prefecture: string }>
}) {
  const { prefecture: rawPrefecture } = await params
  const prefecture = decodeURIComponent(rawPrefecture)

  let cities: { city: string; total: number; uncalled: number }[] = []
  let error: string | null = null

  try {
    cities = await getCities(prefecture)
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
    cities = []
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <Header />

      <div className="p-6 max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">{prefecture}</h1>

        {error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-4 text-sm">
            データベースに接続できませんでした。XAMPPのMySQLを起動し、スキーマ作成とデータ取込を行ってください。
          </div>
        ) : cities.length === 0 ? (
          <p className="text-gray-400">
            この府県のデータがまだありません。国税庁データを取り込んでください。
          </p>
        ) : (
          <div className="space-y-3">
            {cities.map((c) => (
              <Link
                key={c.city}
                href={`/companies?submitted=1&prefecture=${encodeURIComponent(
                  prefecture,
                )}&city=${encodeURIComponent(c.city)}&uncalled=1`}
                className="flex items-center justify-between bg-white rounded-2xl p-4 shadow-sm"
              >
                <span className="font-bold">{c.city || '（市区町村なし）'}</span>
                <span className="text-sm text-gray-500">
                  未架電 {c.uncalled.toLocaleString()} / {c.total.toLocaleString()}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
