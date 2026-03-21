import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { INIT_COLLECTIONS } from '../data/seed'

export const useCollectionsStore = create(
  persist(
    (set) => ({
      collections: INIT_COLLECTIONS,
      setCollections: (fn) => set(s => ({ collections: typeof fn === 'function' ? fn(s.collections) : fn })),
      addCollection: (c) => set(s => ({ collections: [...s.collections, c] })),
      updateCollection: (id, changes) => set(s => ({ collections: s.collections.map(c => c.id === id ? { ...c, ...changes } : c) })),
      deleteCollection: (id) => set(s => ({ collections: s.collections.filter(c => c.id !== id) })),
    }),
    { name: 'smartcrm_collections' }
  )
)
