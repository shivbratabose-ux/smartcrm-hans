import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { INIT_TICKETS } from '../data/seed'

export const useTicketsStore = create(
  persist(
    (set) => ({
      tickets: INIT_TICKETS,
      setTickets: (fn) => set(s => ({ tickets: typeof fn === 'function' ? fn(s.tickets) : fn })),
      addTicket: (t) => set(s => ({ tickets: [...s.tickets, t] })),
      updateTicket: (id, changes) => set(s => ({ tickets: s.tickets.map(t => t.id === id ? { ...t, ...changes } : t) })),
      deleteTicket: (id) => set(s => ({ tickets: s.tickets.filter(t => t.id !== id) })),
    }),
    { name: 'smartcrm_tickets' }
  )
)
