import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { INIT_ACTIVITIES } from '../data/seed'

export const useActivitiesStore = create(
  persist(
    (set) => ({
      activities: INIT_ACTIVITIES,
      setActivities: (fn) => set(s => ({ activities: typeof fn === 'function' ? fn(s.activities) : fn })),
      addActivity: (a) => set(s => ({ activities: [...s.activities, a] })),
      updateActivity: (id, changes) => set(s => ({ activities: s.activities.map(a => a.id === id ? { ...a, ...changes } : a) })),
      deleteActivity: (id) => set(s => ({ activities: s.activities.filter(a => a.id !== id) })),
    }),
    { name: 'smartcrm_activities' }
  )
)
