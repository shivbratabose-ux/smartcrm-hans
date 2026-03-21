import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAuthStore = create(
  persist(
    (set) => ({
      currentUser: null,
      collapsed: false,
      setCurrentUser: (id) => set({ currentUser: id }),
      logout: () => set({ currentUser: null }),
      setCollapsed: (v) => set({ collapsed: v }),
    }),
    { name: 'smartcrm_auth' }
  )
)
