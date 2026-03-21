import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { INIT_EVENTS } from '../data/seed'

export const useEventsStore = create(
  persist(
    (set) => ({
      events: INIT_EVENTS,
      setEvents: (fn) => set(s => ({ events: typeof fn === 'function' ? fn(s.events) : fn })),
      addEvent: (e) => set(s => ({ events: [...s.events, e] })),
      updateEvent: (id, changes) => set(s => ({ events: s.events.map(e => e.id === id ? { ...e, ...changes } : e) })),
      deleteEvent: (id) => set(s => ({ events: s.events.filter(e => e.id !== id) })),
    }),
    { name: 'smartcrm_events' }
  )
)
