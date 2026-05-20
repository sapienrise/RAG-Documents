import { useState, useCallback } from "react";
import { chatApi } from "../services/api";
import type { ChatMessage } from "../types";
import toast from "react-hot-toast";

export function useChat(selectedDocIds: string[], onCreditsChanged?: () => void) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = useCallback(
    async (question: string) => {
      if (!question.trim() || isLoading) return;

      const userMsg: ChatMessage = { role: "user", content: question };
      const loadingMsg: ChatMessage = {
        role: "assistant",
        content: "",
        isLoading: true,
      };

      setMessages((prev) => [...prev, userMsg, loadingMsg]);
      setIsLoading(true);

      try {
        const history = messages
          .filter((m) => !m.isLoading)
          .map((m) => ({ role: m.role, content: m.content }));

        const response = await chatApi.query({
          question,
          history,
          document_ids: selectedDocIds,
        });

        setMessages((prev) => [
          ...prev.slice(0, -1), // remove loading
          {
            role: "assistant",
            content: response.answer,
            citations: response.citations,
          },
        ]);
        onCreditsChanged?.();
      } catch (err: any) {
        const msg = err?.response?.data?.detail || "Failed to get answer";
        toast.error(msg);
        setMessages((prev) => prev.slice(0, -1)); // remove loading
      } finally {
        setIsLoading(false);
      }
    },
    [messages, isLoading, selectedDocIds, onCreditsChanged]
  );

  const clearChat = useCallback(() => {
    setMessages([]);
  }, []);

  return { messages, isLoading, sendMessage, clearChat };
}
