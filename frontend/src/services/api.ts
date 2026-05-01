import axios from "axios";
import type { Document, ChatRequest, ChatResponse } from "../types";

const api = axios.create({
  baseURL: "/api",
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
