import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { INIT_COMM_LOGS } from '../data/seed'

export const useCommLogsStore = create(
  persist(
    (set) => ({
      commLogs: INIT_COMM_LOGS,
      setCommLogs: (fn) => set(s => ({ commLogs: typeof fn === 'function' ? fn(s.commLogs) : fn })),
      addCommLog: (l) => set(s => ({ commLogs: [...s.commLogs, l] })),
      updateCommLog: (id, changes) => set(s => ({ commLogs: s.commLogs.map(l => l.id === id ? { ...l, ...changes } : l) })),
      deleteCommLog: (id) => set(s => ({ commLogs: s.commLogs.filter(l => l.id !== id) })),
    }),
    { name: 'smartcrm_commlogs' }
  )
)
