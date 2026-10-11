import type { ID } from "@/types";
import { isMock } from "../config";
import { coreApi } from "../http";
import { LATENCY, mockError, simulate } from "../mock";
import { db } from "./_store";

/**
 * Authentication service. In mock mode nothing is verified — the demo only
 * selects a seeded user. Real auth (password hashing, Google OAuth, email
 * verification, verified account linking) is the backend's responsibility.
 */
export const authService = {
  signIn: (email: string, password: string) =>
    isMock
      ? simulate<{ userId: ID }>(() => {
          const user = db().users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
          if (!user || password.length < 8) mockError("Email or password is incorrect.", 401, "INVALID_CREDENTIALS");
          return { userId: user.id };
        }, LATENCY.slow)
      : coreApi.post<{ userId: ID }>("/auth/sign-in", { email, password }),
  signInWithGoogle: () =>
    isMock
      ? simulate<{ userId: ID; linked: boolean }>(() => ({ userId: db().users[0].id, linked: true }), LATENCY.slow)
      : coreApi.post<{ userId: ID; linked: boolean }>("/auth/google"),
  signUp: (name: string, email: string, password: string) =>
    isMock
      ? simulate(() => {
          if (db().users.some((u) => u.email.toLowerCase() === email.toLowerCase()))
            mockError("An account with this email already exists. Sign in instead, or verify ownership to link Google sign-in.", 409, "ACCOUNT_EXISTS");
          void password;
          return { name, email };
        }, LATENCY.slow)
      : coreApi.post<{ name: string; email: string }>("/auth/sign-up", { name, email, password }),
  requestPasswordReset: (email: string) => (isMock ? simulate(() => ({ email }), LATENCY.slow) : coreApi.post<void>("/auth/password-reset", { email })),
  resetPassword: (token: string, password: string) => (isMock ? simulate(() => ({ ok: true, token, len: password.length }), LATENCY.slow) : coreApi.post<void>("/auth/password-reset/confirm", { token, password })),
  verifyEmail: (code: string) =>
    isMock
      ? simulate(() => {
          if (!/^\d{6}$/.test(code)) mockError("Enter the 6-digit code from the email.");
          return { ok: true };
        })
      : coreApi.post<void>("/auth/verify-email", { code }),
  changePassword: (current: string, next: string) => (isMock ? simulate(() => ({ ok: current !== next })) : coreApi.post<void>("/auth/change-password", { current, next })),
};
