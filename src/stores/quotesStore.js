import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { INIT_QUOTES } from '../data/seed'

export const useQuotesStore = create(
  persist(
    (set) => ({
      quotes: INIT_QUOTES,
      setQuotes: (fn) => set(s => ({ quotes: typeof fn === 'function' ? fn(s.quotes) : fn })),
      addQuote: (q) => set(s => ({ quotes: [...s.quotes, q] })),
      updateQuote: (id, changes) => set(s => ({ quotes: s.quotes.map(q => q.id === id ? { ...q, ...changes } : q) })),
      deleteQuote: (id) => set(s => ({ quotes: s.quotes.filter(q => q.id !== id) })),
    }),
    { name: 'smartcrm_quotes' }
  )
)
