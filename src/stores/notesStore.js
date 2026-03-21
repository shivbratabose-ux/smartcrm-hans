import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { INIT_NOTES } from '../data/seed'

export const useNotesStore = create(
  persist(
    (set) => ({
      notes: INIT_NOTES,
      setNotes: (fn) => set(s => ({ notes: typeof fn === 'function' ? fn(s.notes) : fn })),
      addNote: (n) => set(s => ({ notes: [...s.notes, n] })),
      updateNote: (id, changes) => set(s => ({ notes: s.notes.map(n => n.id === id ? { ...n, ...changes } : n) })),
      deleteNote: (id) => set(s => ({ notes: s.notes.filter(n => n.id !== id) })),
    }),
    { name: 'smartcrm_notes' }
  )
)
