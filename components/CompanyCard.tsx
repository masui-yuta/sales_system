import Link from 'next/link'

type Props = {
  id: number
  name: string
  prefecture: string
  city: string
  phone: string | null
  industry: string | null
  callCount: number
}

export default function CompanyCard({
  id,
  name,
  prefecture,
  city,
  phone,
  industry,
  callCount,
}: Props) {
  return (
    <div className="bg-white border rounded-2xl p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/companies/${id}`} className="min-w-0">
          <h2 className="text-lg font-bold truncate">{name}</h2>
        </Link>

        {callCount === 0 ? (
          <span className="shrink-0 text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
            未架電
          </span>
        ) : (
          <span className="shrink-0 text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full">
            架電 {callCount} 回
          </span>
        )}
      </div>

      <p className="text-gray-500 text-sm mt-1">
        {prefecture}
        {city}
        {industry ? ` ・ ${industry}` : ''}
      </p>

      {phone ? (
        <a href={`tel:${phone}`} className="text-blue-600 block mt-3">
          📞 {phone}
        </a>
      ) : (
        <p className="text-gray-400 text-sm mt-3">電話番号 未登録</p>
      )}
    </div>
  )
}
