import Link from 'next/link'
import Header from '@/components/Header'

const prefectures = [
  '大阪府',
  '京都府',
  '兵庫県',
  '奈良県',
  '滋賀県',
  '和歌山県',
]

export default function PrefecturesPage() {
  return (
    <main>
      <Header />

      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">
          府県一覧
        </h1>

        <div className="space-y-4">
          {prefectures.map((prefecture) => (
            <Link
              key={prefecture}
              href={`/cities/${prefecture}`}
              className="block border rounded-2xl p-4 shadow-sm"
            >
              {prefecture}
            </Link>
          ))}
        </div>
      </div>
    </main>
  )
}