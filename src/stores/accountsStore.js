import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { INIT_ACCOUNTS } from '../data/seed'

export const useAccountsStore = create(
  persist(
    (set) => ({
      accounts: INIT_ACCOUNTS,
      setAccounts: (fn) => set(s => ({ accounts: typeof fn === 'function' ? fn(s.accounts) : fn })),
      addAccount: (a) => set(s => ({ accounts: [...s.accounts, a] })),
      updateAccount: (id, changes) => set(s => ({ accounts: s.accounts.map(a => a.id === id ? { ...a, ...changes } : a) })),
      deleteAccount: (id) => set(s => ({ accounts: s.accounts.filter(a => a.id !== id) })),
    }),
    { name: 'smartcrm_accounts' }
  )
)
