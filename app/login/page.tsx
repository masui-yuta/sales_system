import LoginForm from './LoginForm'

export const metadata = {
  title: 'ログイン | 営業システム',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>
}) {
  const sp = await searchParams
  const from = sp.from?.startsWith('/') ? sp.from : '/'

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">関西営業システム</h1>
          <p className="text-sm text-gray-500 mt-1">
            社内メンバー専用。不正アクセスは記録されます。
          </p>
        </div>

        <LoginForm from={from} />

        <p className="text-xs text-gray-400">
          パスワードは12文字以上・大文字・小文字・数字・記号を含めてください。
        </p>
      </div>
    </main>
  )
}
