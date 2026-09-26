"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { api } from "@/lib/api";
import { DEFAULT_USER, getStoredUserId, setStoredUserId } from "@/lib/session";
import type { User } from "@/types";

interface UserState {
  users: User[];
  userId: string;
  user: User | null;
  setUserId: (id: string) => void;
  refresh: () => Promise<void>;
}

const Ctx = createContext<UserState | null>(null);

export function UserProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<User[]>([]);
  const [userId, setId] = useState(DEFAULT_USER);

  const refresh = useCallback(async () => {
    try {
      setUsers(await api.users());
    } catch {
      /* keep whatever we had; pages still work off userId */
    }
  }, []);

  useEffect(() => {
    setId(getStoredUserId());
    refresh();
  }, [refresh]);

  const setUserId = useCallback((id: string) => {
    setStoredUserId(id);
    setId(id);
  }, []);

  const user = users.find((u) => u.id === userId) ?? null;
  return <Ctx.Provider value={{ users, userId, user, setUserId, refresh }}>{children}</Ctx.Provider>;
}

export function useUser(): UserState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useUser outside UserProvider");
  return v;
}
