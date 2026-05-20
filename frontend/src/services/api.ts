import axios from "axios";
import type { Document, ChatRequest, ChatResponse, AuthUser, DriveSettings } from "../types";

const api = axios.create({
  baseURL: (import.meta.env.VITE_API_BASE_URL as string | undefined) || "/api",
  withCredentials: true,
});

export const documentsApi = {
  list: (): Promise<Document[]> =>
    api.get("/documents").then((r) => r.data),

  upload: (file: File, visibility: "public" | "private"): Promise<Document> => {
    const form = new FormData();
    form.append("file", file);
    form.append("visibility", visibility);
    return api.post("/documents", form).then((r) => r.data);
  },

  delete: (id: string): Promise<void> =>
    api.delete(`/documents/${id}`).then((r) => r.data),
  updateVisibility: (id: string, visibility: "public" | "private"): Promise<Document> =>
    api.patch(`/documents/${id}/visibility`, { visibility }).then((r) => r.data),
  downloadUrl: (id: string): string => {
    const base = ((import.meta.env.VITE_API_BASE_URL as string | undefined) || "/api").replace(/\/$/, "");
    return `${base}/documents/${id}/download`;
  },
};

export const chatApi = {
  query: (payload: ChatRequest): Promise<ChatResponse> =>
    api.post("/chat/query", payload).then((r) => r.data),
};

export const authApi = {
  me: (): Promise<{ user: AuthUser | null }> =>
    api.get("/auth/me").then((r) => r.data),
  googleLogin: (credential: string): Promise<{ user: AuthUser }> =>
    api.post("/auth/google", { credential }).then((r) => r.data),
  logout: (): Promise<void> =>
    api.post("/auth/logout").then((r) => r.data),
};

export const driveApi = {
  authUrl: (): Promise<{ url: string }> =>
    api.get("/drive/auth-url").then((r) => r.data),
  status: (): Promise<{ connected: boolean }> =>
    api.get("/drive/status").then((r) => r.data),
  listFiles: (): Promise<{ files: Array<{ id: string; name: string; mimeType: string; size?: string }> }> =>
    api.get("/drive/files").then((r) => r.data),
  importFile: (fileId: string, visibility: "public" | "private"): Promise<Document> =>
    api.post("/drive/import", { file_id: fileId, visibility }).then((r) => r.data),
  importFolder: (
    folderId: string,
    visibility: "public" | "private"
  ): Promise<{ imported_count: number; skipped_count: number; documents: Document[]; skipped: Array<{ id: string; name: string; reason: string }> }> =>
    api.post("/drive/import-folder", { folder_id: folderId, visibility }).then((r) => r.data),
};

export const settingsApi = {
  getDrive: (): Promise<DriveSettings> =>
    api.get("/settings/drive").then((r) => r.data),
  saveDrive: (payload: DriveSettings): Promise<{ success: boolean }> =>
    api.post("/settings/drive", payload).then((r) => r.data),
  getVisibilityMode: (): Promise<{ visibility_mode: "public" | "private" }> =>
    api.get("/settings/visibility").then((r) => r.data),
  saveVisibilityMode: (visibility_mode: "public" | "private"): Promise<{ success: boolean; visibility_mode: "public" | "private" }> =>
    api.put("/settings/visibility", { visibility_mode }).then((r) => r.data),
};

export const billingApi = {
  createOrder: (payload?: { amount_inr?: number; credits_to_grant?: number }): Promise<{
    key_id: string;
    order_id: string;
    amount: number;
    currency: string;
    plan_name: string;
    credits_to_grant: number;
    prefill_email: string;
    prefill_name: string;
  }> => api.post("/billing/create-order", payload || {}).then((r) => r.data),
  verifyPayment: (payload: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }): Promise<{ success: boolean; status: string; credits_balance?: number }> =>
    api.post("/billing/verify", payload).then((r) => r.data),
  credits: (): Promise<{ credits_balance: number; chat_query_cost: number }> =>
    api.get("/billing/credits").then((r) => r.data),
};
