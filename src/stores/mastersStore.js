import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { INIT_MASTERS, INIT_PRODUCT_CATALOG } from '../data/seed'

export const useMastersStore = create(
  persist(
    (set) => ({
      masters: INIT_MASTERS,
      catalog: INIT_PRODUCT_CATALOG,
      setMasters: (fn) => set(s => ({ masters: typeof fn === 'function' ? fn(s.masters) : fn })),
      setCatalog: (fn) => set(s => ({ catalog: typeof fn === 'function' ? fn(s.catalog) : fn })),
    }),
    { name: 'smartcrm_masters' }
  )
)
