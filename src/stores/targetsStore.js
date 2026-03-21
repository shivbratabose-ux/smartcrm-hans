import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { INIT_TARGETS } from '../data/seed'

export const useTargetsStore = create(
  persist(
    (set) => ({
      targets: INIT_TARGETS,
      setTargets: (fn) => set(s => ({ targets: typeof fn === 'function' ? fn(s.targets) : fn })),
      addTarget: (t) => set(s => ({ targets: [...s.targets, t] })),
      updateTarget: (id, changes) => set(s => ({ targets: s.targets.map(t => t.id === id ? { ...t, ...changes } : t) })),
      deleteTarget: (id) => set(s => ({ targets: s.targets.filter(t => t.id !== id) })),
    }),
    { name: 'smartcrm_targets' }
  )
)
