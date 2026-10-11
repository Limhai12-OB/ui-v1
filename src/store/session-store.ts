"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ID, Role } from "@/types";
import { MANAGER_USER_ID, OWNER_ID } from "@/data/mock/seed";

/**
 * Simulated session. There is no real authentication in the demo — the backend
 * will issue and validate sessions. This only decides which demo user is active.
 */
interface SessionState {
  status: "signed_out" | "signed_in";
  userId: ID;
  /** Set during sign-up until Business Setup is completed. */
  pendingOwner?: { name: string; email: string };
  rememberSession: boolean;
  signIn: (userId: ID, remember?: boolean) => void;
  signOut: () => void;
  startSignUp: (name: string, email: string) => void;
  completeOnboarding: () => void;
  /** Development-mode role switch between the demo owner and the demo branch manager. */
  switchRole: (role: Role) => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      status: "signed_out",
      userId: OWNER_ID,
      rememberSession: true,
      signIn: (userId, remember = true) => set({ status: "signed_in", userId, rememberSession: remember }),
      signOut: () => set({ status: "signed_out", pendingOwner: undefined }),
      startSignUp: (name, email) => set({ pendingOwner: { name, email } }),
      completeOnboarding: () => set({ status: "signed_in", userId: OWNER_ID, pendingOwner: undefined }),
      switchRole: (role) => set({ userId: role === "owner" ? OWNER_ID : MANAGER_USER_ID }),
    }),
    { name: "lv-session", storage: createJSONStorage(() => localStorage), version: 1 },
  ),
);
