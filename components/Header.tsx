import { getSession } from '@/lib/auth/session'
import { logoutAction } from '@/app/actions/auth'

export default async function Header() {
  const user = await getSession()

  return (
    <header className="bg-blue-600 text-white p-4 flex items-center justify-between gap-4">
      <span className="text-xl font-bold">関西営業システム</span>

      {user ? (
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden sm:inline opacity-90">{user.name}</span>
          <form action={logoutAction}>
            <button
              type="submit"
              className="bg-blue-500 hover:bg-blue-400 px-3 py-1.5 rounded-lg text-sm"
            >
              ログアウト
            </button>
          </form>
        </div>
      ) : null}
    </header>
  )
}
