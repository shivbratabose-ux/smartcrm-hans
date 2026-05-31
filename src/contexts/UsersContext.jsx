import { createContext, useContext, useMemo } from "react";
import { TEAM } from "../data/constants";

const UsersContext = createContext(null);

/**
 * Provides dynamic user list derived from orgUsers state.
 * Wraps the app so shared components (UserPill, etc.) can resolve any user.
 */
export function UsersProvider({ orgUsers, children }) {
  const value = useMemo(() => {
    const users = (orgUsers && orgUsers.length > 0) ? orgUsers : TEAM;
    const teamMap = Object.fromEntries(users.map(u => [u.id, u]));
    return { users, teamMap };
  }, [orgUsers]);

  return (
    <UsersContext.Provider value={value}>
      {children}
    </UsersContext.Provider>
  );
}

/**
 * Hook to consume dynamic users anywhere in the component tree.
 * Returns { users, teamMap }.
 */
export function useUsers() {
  const ctx = useContext(UsersContext);
  if (!ctx) {
    const teamMap = Object.fromEntries(TEAM.map(u => [u.id, u]));
    return { users: TEAM, teamMap };
  }
  return ctx;
}
