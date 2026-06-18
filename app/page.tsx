import Link from 'next/link'
import Header from '../components/Header'

export default function Home() {
  return (
    <main>
      <Header />

      <div className="p-6">
        <h1 className="text-3xl font-bold mb-6">
          関西エリア
        </h1>

        <Link
          href="/prefectures"
          className="block bg-white rounded-2xl p-6 shadow-sm"
        >
          府県一覧へ
        </Link>
      </div>
    </main>
  )
}