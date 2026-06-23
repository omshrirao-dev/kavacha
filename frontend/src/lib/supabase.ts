import { createClient } from '@supabase/supabase-js'

// In-memory only -- never localStorage/sessionStorage. A page refresh loses
// the session and requires logging in again; that's the deliberate tradeoff
// for "no sensitive data in browser storage."
class InMemoryStorage {
  private store = new Map<string, string>()

  getItem(key: string) {
    return this.store.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.store.set(key, value)
  }

  removeItem(key: string) {
    this.store.delete(key)
  }
}

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      storage: new InMemoryStorage(),
      persistSession: true,
      autoRefreshToken: true,
    },
  },
)
