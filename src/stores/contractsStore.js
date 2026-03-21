import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { INIT_CONTRACTS } from '../data/seed'

export const useContractsStore = create(
  persist(
    (set) => ({
      contracts: INIT_CONTRACTS,
      setContracts: (fn) => set(s => ({ contracts: typeof fn === 'function' ? fn(s.contracts) : fn })),
      addContract: (c) => set(s => ({ contracts: [...s.contracts, c] })),
      updateContract: (id, changes) => set(s => ({ contracts: s.contracts.map(c => c.id === id ? { ...c, ...changes } : c) })),
      deleteContract: (id) => set(s => ({ contracts: s.contracts.filter(c => c.id !== id) })),
    }),
    { name: 'smartcrm_contracts' }
  )
)
