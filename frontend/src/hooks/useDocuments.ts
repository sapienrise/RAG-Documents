import { useState, useEffect, useCallback } from "react";
import { documentsApi } from "../services/api";
import type { Document } from "../types";
import toast from "react-hot-toast";

export function useDocuments(onCreditsChanged?: () => void) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDocuments = useCallback(async () => {
    try {
      const docs = await documentsApi.list();
      setDocuments(docs);
    } catch {
      toast.error("Failed to load documents");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
    // Poll every 3s while any doc is processing
    const interval = setInterval(() => {
      setDocuments((prev) => {
        if (prev.some((d) => d.status === "processing")) {
          fetchDocuments();
        }
        return prev;
      });
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchDocuments]);

  const upload = useCallback(
    async (file: File, visibility: "public" | "private") => {
      const toastId = toast.loading(`Uploading ${file.name}...`);
      try {
        const doc = await documentsApi.upload(file, visibility);
        setDocuments((prev) => [doc, ...prev]);
        toast.success(`${file.name} uploaded — processing...`, { id: toastId });
        onCreditsChanged?.();
        return doc;
      } catch (err: any) {
        const msg = err?.response?.data?.detail || "Upload failed";
        toast.error(msg, { id: toastId });
        throw err;
      }
    },
    [onCreditsChanged]
  );

  const remove = useCallback(async (id: string) => {
    try {
      await documentsApi.delete(id);
      setDocuments((prev) => prev.filter((d) => d.id !== id));
      toast.success("Document deleted");
    } catch {
      toast.error("Failed to delete document");
    }
  }, []);

  const updateVisibility = useCallback(
    async (id: string, visibility: "public" | "private") => {
      try {
        const updated = await documentsApi.updateVisibility(id, visibility);
        setDocuments((prev) => prev.map((d) => (d.id === id ? updated : d)));
        toast.success(`Moved to ${visibility}`);
      } catch (err: any) {
        const msg = err?.response?.data?.detail || "Failed to update visibility";
        toast.error(msg);
      }
    },
    []
  );

  return { documents, loading, upload, remove, updateVisibility, refresh: fetchDocuments };
}
