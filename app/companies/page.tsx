import Link from 'next/link'
import Header from '@/components/Header'
import CompanyCard from '@/components/CompanyCard'
import {
  getCompanies,
  countCompanies,
  needsExactCount,
  KANSAI_PREFECTURES,
  TARGET_INDUSTRIES,
  DEFAULT_PREFECTURE,
  parseCompanyCursor,
  formatCompanyCursor,
  type CompanyFilter,
} from '@/lib/companies'

const PAGE_SIZE = 50

export const dynamic = 'force-dynamic'

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{
    prefecture?: string
    city?: string
    q?: string
    industry?: string
    uncalled?: string
    hasPhone?: string
    hasIndustry?: string
    submitted?: string
    after?: string
  }>
}) {
  const sp = await searchParams

  const submitted = sp.submitted === '1'
  const uncalled = submitted ? sp.uncalled === '1' : true
  const hasPhone = sp.hasPhone === '1'
  const hasIndustry = sp.hasIndustry === '1'
  const prefecture = sp.prefecture?.trim() || DEFAULT_PREFECTURE
  const after = parseCompanyCursor(sp.after)

  const filter: CompanyFilter = {
    prefecture,
    city: sp.city || undefined,
    q: sp.q || undefined,
    industry: sp.industry || undefined,
    uncalled,
    hasPhone,
    hasIndustry,
    after,
    pageSize: PAGE_SIZE,
  }

  let companies: Awaited<ReturnType<typeof getCompanies>>['companies'] = []
  let nextAfter: Awaited<ReturnType<typeof getCompanies>>['nextAfter'] = null
  let total: number | null = null
  let error: string | null = null

  try {
    const result = await getCompanies(filter)
    companies = result.companies
    nextAfter = result.nextAfter

    if (needsExactCount(filter)) {
      total = await countCompanies(filter)
    } else if (companies.length < PAGE_SIZE) {
      total = companies.length
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
    companies = []
  }

  const hasNextPage = nextAfter != null

  const buildHref = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams()
    const merged = {
      prefecture,
      city: sp.city,
      q: sp.q,
      industry: sp.industry,
      uncalled: sp.uncalled,
      hasPhone: sp.hasPhone,
      hasIndustry: sp.hasIndustry,
      submitted: sp.submitted ?? '1',
      after: sp.after,
      ...overrides,
    }
    for (const [key, value] of Object.entries(merged)) {
      if (value) params.set(key, value)
    }
    const qs = params.toString()
    return qs ? `/companies?${qs}` : '/companies'
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <Header />

      <div className="p-4 max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">企業一覧</h1>

        <form
          method="get"
          className="bg-white rounded-2xl p-4 shadow-sm mb-4 space-y-3"
        >
          <input type="hidden" name="submitted" value="1" />
          <div className="grid grid-cols-2 gap-3">
            <select
              name="prefecture"
              defaultValue={prefecture}
              className="border rounded-xl p-2"
            >
              {KANSAI_PREFECTURES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>

            <input
              type="text"
              name="city"
              defaultValue={sp.city ?? ''}
              placeholder="市区町村"
              className="border rounded-xl p-2"
            />
          </div>

          <input
            type="text"
            name="q"
            defaultValue={sp.q ?? ''}
            placeholder="社名・住所で検索"
            className="w-full border rounded-xl p-2"
          />

          <select
            name="industry"
            defaultValue={sp.industry ?? ''}
            className="w-full border rounded-xl p-2"
          >
            <option value="">業種（すべて）</option>
            {TARGET_INDUSTRIES.map((item) => (
              <option key={item.code} value={item.code}>
                {item.code} {item.name}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="uncalled"
              value="1"
              defaultChecked={uncalled}
            />
            未架電のみ表示
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="hasPhone"
              value="1"
              defaultChecked={hasPhone}
            />
            電話番号がある会社のみ
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="hasIndustry"
              value="1"
              defaultChecked={hasIndustry}
            />
            業種が登録されている会社のみ
          </label>

          <button
            type="submit"
            className="w-full bg-blue-600 text-white p-3 rounded-xl font-bold"
          >
            絞り込む
          </button>
        </form>

        {error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-4 text-sm">
            <p className="font-bold mb-1">データベースに接続できませんでした</p>
            <p className="mb-2">
              XAMPPのMySQLを起動し、{' '}
              <code className="bg-red-100 px-1 rounded">
                mysql -u root &lt; db/schema.sql
              </code>{' '}
              でスキーマを作成、{' '}
              <code className="bg-red-100 px-1 rounded">npm run db:import</code>{' '}
              で国税庁データを取り込んでください。
            </p>
            <p className="text-xs text-red-500 break-all">{error}</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-3">
              {total != null
                ? `${total.toLocaleString()} 件`
                : '多数の企業'}
              {uncalled && '（未架電）'}
              {total == null &&
                hasNextPage &&
                ' — 市区町村・検索で絞ると件数が表示されます'}
            </p>

            <div className="space-y-3">
              {companies.length === 0 ? (
                <div className="text-gray-400 text-center py-12 space-y-2">
                  <p>該当する企業がありません</p>
                  {hasPhone && total === 0 && (
                    <p className="text-sm text-amber-600 px-4">
                      電話番号が1件も登録されていません。国税庁CSV取込後に OSM
                      取込が必要です：
                      <code className="block mt-2 bg-amber-50 p-2 rounded text-xs text-left">
                        node scripts/import-osm-phone.mjs
                        ./data/kansai-latest.osm.pbf
                      </code>
                    </p>
                  )}
                </div>
              ) : (
                companies.map((company) => (
                  <CompanyCard
                    key={company.id}
                    id={company.id}
                    name={company.name}
                    prefecture={company.prefecture}
                    city={company.city}
                    phone={company.phone}
                    industry={company.industry}
                    callCount={company.call_count}
                  />
                ))
              )}
            </div>

            {(after || hasNextPage) && (
              <div className="flex items-center justify-between mt-6">
                {after ? (
                  <Link
                    href={buildHref({ after: undefined })}
                    className="px-4 py-2 bg-white border rounded-xl"
                  >
                    ← 先頭へ
                  </Link>
                ) : (
                  <span />
                )}

                <span className="text-sm text-gray-500">
                  {after ? '続き' : '先頭'}
                </span>

                {hasNextPage && nextAfter ? (
                  <Link
                    href={buildHref({
                      after: formatCompanyCursor(nextAfter),
                    })}
                    className="px-4 py-2 bg-white border rounded-xl"
                  >
                    次へ →
                  </Link>
                ) : (
                  <span />
                )}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}
