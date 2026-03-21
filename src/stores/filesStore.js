import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { INIT_FILES } from '../data/seed'

export const useFilesStore = create(
  persist(
    (set) => ({
      files: INIT_FILES,
      setFiles: (fn) => set(s => ({ files: typeof fn === 'function' ? fn(s.files) : fn })),
      addFile: (f) => set(s => ({ files: [...s.files, f] })),
      updateFile: (id, changes) => set(s => ({ files: s.files.map(f => f.id === id ? { ...f, ...changes } : f) })),
      deleteFile: (id) => set(s => ({ files: s.files.filter(f => f.id !== id) })),
    }),
    { name: 'smartcrm_files' }
  )
)
