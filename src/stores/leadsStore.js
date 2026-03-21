import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { INIT_LEADS } from '../data/seed'

export const useLeadsStore = create(
  persist(
    (set) => ({
      leads: INIT_LEADS,
      setLeads: (fn) => set(s => ({ leads: typeof fn === 'function' ? fn(s.leads) : fn })),
      addLead: (l) => set(s => ({ leads: [...s.leads, l] })),
      updateLead: (id, changes) => set(s => ({ leads: s.leads.map(l => l.id === id ? { ...l, ...changes } : l) })),
      deleteLead: (id) => set(s => ({ leads: s.leads.filter(l => l.id !== id) })),
    }),
    { name: 'smartcrm_leads' }
  )
)
