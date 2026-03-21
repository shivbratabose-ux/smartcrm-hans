import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { INIT_CALL_REPORTS } from '../data/seed'

export const useCallReportsStore = create(
  persist(
    (set) => ({
      callReports: INIT_CALL_REPORTS,
      setCallReports: (fn) => set(s => ({ callReports: typeof fn === 'function' ? fn(s.callReports) : fn })),
      addCallReport: (r) => set(s => ({ callReports: [...s.callReports, r] })),
      updateCallReport: (id, changes) => set(s => ({ callReports: s.callReports.map(r => r.id === id ? { ...r, ...changes } : r) })),
      deleteCallReport: (id) => set(s => ({ callReports: s.callReports.filter(r => r.id !== id) })),
    }),
    { name: 'smartcrm_callreports' }
  )
)
