import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { INIT_ORG, INIT_TEAMS } from '../data/seed'
import { INIT_USERS, INIT_USER_PASSWORDS } from '../data/constants'

export const useOrgStore = create(
  persist(
    (set) => ({
      org: INIT_ORG,
      teams: INIT_TEAMS,
      orgUsers: INIT_USERS,
      userPasswords: INIT_USER_PASSWORDS,
      setOrg: (fn) => set(s => ({ org: typeof fn === 'function' ? fn(s.org) : fn })),
      setTeams: (fn) => set(s => ({ teams: typeof fn === 'function' ? fn(s.teams) : fn })),
      setOrgUsers: (fn) => set(s => ({ orgUsers: typeof fn === 'function' ? fn(s.orgUsers) : fn })),
      setUserPasswords: (fn) => set(s => ({ userPasswords: typeof fn === 'function' ? fn(s.userPasswords) : fn })),
    }),
    { name: 'smartcrm_org' }
  )
)
