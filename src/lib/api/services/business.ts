import type { Branch, BranchManager, Business, Category, ID, Integration, IntegrationId, NotificationPreferences, User } from "@/types";
import { isMock } from "../config";
import { coreApi } from "../http";
import { LATENCY, mockError, simulate } from "../mock";
import { db } from "./_store";

export const businessService = {
  update: (patch: Partial<Business>) => (isMock ? simulate(() => db().updateBusiness(patch)) : coreApi.patch<void>("/business", patch)),
};

export const userService = {
  update: (id: ID, patch: Partial<Omit<User, "id" | "role">>) => (isMock ? simulate(() => db().updateUser(id, patch)) : coreApi.patch<void>(`/users/${id}`, patch)),
};

export const branchService = {
  create: (b: Omit<Branch, "id" | "isMain">) =>
    isMock
      ? simulate<Branch>(() => {
          if (db().branches.some((x) => x.code.toLowerCase() === b.code.toLowerCase())) mockError(`Branch code ${b.code} is already used.`, 409, "DUPLICATE");
          return db().createBranch(b);
        })
      : coreApi.post<Branch>("/branches", b),
  update: (id: ID, patch: Partial<Branch>) => (isMock ? simulate(() => db().updateBranch(id, patch)) : coreApi.patch<void>(`/branches/${id}`, patch)),
};

export const managerService = {
  invite: (m: Pick<BranchManager, "name" | "email" | "phone" | "branchId">) =>
    isMock
      ? simulate<BranchManager>(() => {
          if (db().managers.some((x) => x.email.toLowerCase() === m.email.toLowerCase())) mockError("This email already belongs to a branch manager.", 409, "DUPLICATE");
          return db().inviteManager(m);
        })
      : coreApi.post<BranchManager>("/branch-managers/invitations", m),
  update: (id: ID, patch: Partial<BranchManager>) => (isMock ? simulate(() => db().updateManager(id, patch)) : coreApi.patch<void>(`/branch-managers/${id}`, patch)),
  resend: (id: ID) => (isMock ? simulate(() => db().resendInvite(id), LATENCY.fast) : coreApi.post<void>(`/branch-managers/${id}/resend`)),
  revoke: (id: ID) => (isMock ? simulate(() => db().revokeInvite(id)) : coreApi.delete<void>(`/branch-managers/${id}`)),
  accept: (id: ID) => (isMock ? simulate(() => db().acceptInvitation(id)) : coreApi.post<void>(`/invitations/${id}/accept`)),
};

export const categoryService = {
  create: (c: Omit<Category, "id">) =>
    isMock
      ? simulate<Category>(() => {
          if (db().categories.some((x) => x.kind === c.kind && x.name.toLowerCase() === c.name.toLowerCase())) mockError("A category with this name already exists.", 409, "DUPLICATE");
          return db().createCategory(c);
        }, LATENCY.fast)
      : coreApi.post<Category>("/categories", c),
  update: (id: ID, patch: Partial<Category>) => (isMock ? simulate(() => db().updateCategory(id, patch), LATENCY.fast) : coreApi.patch<void>(`/categories/${id}`, patch)),
  remove: (id: ID) =>
    isMock
      ? simulate(() => {
          if (!db().deleteCategory(id)) mockError("This category is in use or is a system category and cannot be deleted.", 409, "CONFLICT");
        })
      : coreApi.delete<void>(`/categories/${id}`),
};

export const notificationService = {
  markRead: (id: ID, read = true) => (isMock ? simulate(() => db().markNotificationRead(id, read), 80) : coreApi.post<void>(`/notifications/${id}/read`, { read })),
  markAllRead: (category?: "financial" | "system") => (isMock ? simulate(() => db().markAllNotificationsRead(category), LATENCY.fast) : coreApi.post<void>("/notifications/read-all", { category })),
  updatePreferences: (p: NotificationPreferences) => (isMock ? simulate(() => db().updateNotificationPreferences(p)) : coreApi.put<void>("/notifications/preferences", p)),
};

export const integrationService = {
  update: (id: IntegrationId, patch: Partial<Integration>) => (isMock ? simulate(() => db().updateIntegration(id, patch)) : coreApi.patch<void>(`/integrations/${id}`, patch)),
  addRun: (id: IntegrationId, run: Integration["history"][number]) => (isMock ? simulate(() => db().addIntegrationRun(id, run), 50) : Promise.resolve()),
};
