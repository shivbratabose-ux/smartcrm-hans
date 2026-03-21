import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { INIT_CONTACTS } from '../data/seed'

export const useContactsStore = create(
  persist(
    (set) => ({
      contacts: INIT_CONTACTS,
      setContacts: (fn) => set(s => ({ contacts: typeof fn === 'function' ? fn(s.contacts) : fn })),
      addContact: (c) => set(s => ({ contacts: [...s.contacts, c] })),
      updateContact: (id, changes) => set(s => ({ contacts: s.contacts.map(c => c.id === id ? { ...c, ...changes } : c) })),
      deleteContact: (id) => set(s => ({ contacts: s.contacts.filter(c => c.id !== id) })),
    }),
    { name: 'smartcrm_contacts' }
  )
)
