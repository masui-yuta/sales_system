import Link from 'next/link'
import Header from '@/components/Header'
import { getCompanyById, getCallLogs, CALL_RESULTS } from '@/lib/companies'
import { updateCompany, addCallLog } from '../actions'

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const companyId = Number(id)

  const company = await getCompanyById(companyId)
  if (!company) {
    return (
      <main className="min-h-screen bg-gray-50">
        <Header />
        <div className="p-6">企業が見つかりません</div>
      </main>
    )
  }

  const callLogs = await getCallLogs(companyId)

  return (
    <main className="min-h-screen bg-gray-50">
      <Header />

      <div className="p-4 max-w-2xl mx-auto space-y-4">
        <Link href="/companies" className="text-sm text-blue-600">
          ← 一覧へ
        </Link>

        {/* 基本情報 */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <h1 className="text-2xl font-bold">{company.name}</h1>
            {company.call_count === 0 ? (
              <span className="shrink-0 text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                未架電
              </span>
            ) : (
              <span className="shrink-0 text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full">
                架電 {company.call_count} 回
              </span>
            )}
          </div>

          <dl className="mt-4 space-y-2 text-sm">
            <div>
              <dt className="font-bold text-gray-500">法人番号</dt>
              <dd>{company.corporate_number}</dd>
            </div>
            <div>
              <dt className="font-bold text-gray-500">住所</dt>
              <dd>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    company.address,
                  )}`}
                  target="_blank"
                  className="text-blue-600 underline"
                >
                  {company.address}
                </a>
              </dd>
            </div>
            <div>
              <dt className="font-bold text-gray-500">電話番号</dt>
              <dd>
                {company.phone ? (
                  <a href={`tel:${company.phone}`} className="text-blue-600">
                    {company.phone}
                  </a>
                ) : (
                  <span className="text-gray-400">未登録</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="font-bold text-gray-500">業種</dt>
              <dd>{company.industry || <span className="text-gray-400">未分類</span>}</dd>
            </div>
          </dl>

          {company.phone && (
            <a
              href={`tel:${company.phone}`}
              className="block mt-5 bg-blue-600 text-white text-center p-4 rounded-xl font-bold"
            >
              電話する
            </a>
          )}
        </div>

        {/* 情報の補完（電話番号・業種・メモ） */}
        <form
          action={updateCompany}
          className="bg-white rounded-2xl p-6 shadow-sm space-y-3"
        >
          <h2 className="text-lg font-bold">情報を補完</h2>
          <input type="hidden" name="companyId" value={company.id} />

          <div>
            <label className="block text-sm font-bold text-gray-500 mb-1">
              電話番号
            </label>
            <input
              type="text"
              name="phone"
              defaultValue={company.phone ?? ''}
              placeholder="06-1234-5678"
              className="w-full border rounded-xl p-2"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-500 mb-1">
              業種
            </label>
            <input
              type="text"
              name="industry"
              defaultValue={company.industry ?? ''}
              placeholder="不動産 / 建設 など"
              className="w-full border rounded-xl p-2"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-500 mb-1">
              担当者メモ
            </label>
            <textarea
              name="note"
              defaultValue={company.note ?? ''}
              rows={4}
              placeholder="営業メモ"
              className="w-full border rounded-xl p-2"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-green-600 text-white p-3 rounded-xl font-bold"
          >
            保存
          </button>
        </form>

        {/* 架電履歴の登録 */}
        <form
          action={addCallLog}
          className="bg-white rounded-2xl p-6 shadow-sm space-y-3"
        >
          <h2 className="text-lg font-bold">架電を記録</h2>
          <input type="hidden" name="companyId" value={company.id} />

          <select name="result" className="w-full border rounded-xl p-2" required>
            {CALL_RESULTS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>

          <textarea
            name="memo"
            rows={2}
            placeholder="架電メモ（任意）"
            className="w-full border rounded-xl p-2"
          />

          <button
            type="submit"
            className="w-full bg-blue-600 text-white p-3 rounded-xl font-bold"
          >
            架電履歴を追加
          </button>
        </form>

        {/* 架電履歴一覧 */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="text-lg font-bold mb-3">架電履歴</h2>
          {callLogs.length === 0 ? (
            <p className="text-gray-400 text-sm">まだ架電していません</p>
          ) : (
            <ul className="space-y-3">
              {callLogs.map((log) => (
                <li key={log.id} className="border rounded-xl p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold">{log.result}</span>
                    <span className="text-xs text-gray-500">
                      {new Date(log.called_at).toLocaleString('ja-JP')}
                    </span>
                  </div>
                  {log.memo && (
                    <p className="text-sm text-gray-600 mt-1">{log.memo}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  )
}
