import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { INIT_OPPS } from '../data/seed'

export const useOppsStore = create(
  persist(
    (set) => ({
      opps: INIT_OPPS,
      setOpps: (fn) => set(s => ({ opps: typeof fn === 'function' ? fn(s.opps) : fn })),
      addOpp: (o) => set(s => ({ opps: [...s.opps, o] })),
      updateOpp: (id, changes) => set(s => ({ opps: s.opps.map(o => o.id === id ? { ...o, ...changes } : o) })),
      deleteOpp: (id) => set(s => ({ opps: s.opps.filter(o => o.id !== id) })),
    }),
    { name: 'smartcrm_opps' }
  )
)
