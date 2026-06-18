'use client'

import { useActionState } from 'react'
import { loginAction, type LoginState } from '@/app/actions/auth'

const initial: LoginState = {}

export default function LoginForm({ from }: { from: string }) {
  const [state, action, pending] = useActionState(loginAction, initial)

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="from" value={from} />

      <div>
        <label htmlFor="email" className="block text-sm font-medium mb-1">
          メールアドレス
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="w-full border rounded-xl p-3"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium mb-1">
          パスワード
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full border rounded-xl p-3"
        />
      </div>

      {state.error ? (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full bg-blue-600 text-white p-3 rounded-xl font-bold disabled:opacity-60"
      >
        {pending ? 'ログイン中…' : 'ログイン'}
      </button>
    </form>
  )
}
