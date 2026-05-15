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
  listFiles: (): Promise<{ files: Array<{ id: string; name: string; mimeType: string; size?: string }> }> =>
    api.get("/drive/files").then((r) => r.data),
  importFile: (fileId: string, visibility: "public" | "private"): Promise<Document> =>
    api.post("/drive/import", { file_id: fileId, visibility }).then((r) => r.data),
};

export const settingsApi = {
  getDrive: (): Promise<DriveSettings> =>
    api.get("/settings/drive").then((r) => r.data),
  saveDrive: (payload: DriveSettings): Promise<{ success: boolean }> =>
    api.post("/settings/drive", payload).then((r) => r.data),
};
