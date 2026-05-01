import { useState, useRef, useEffect } from "react";
import {
  Send,
  Trash2,
  Bot,
  User,
  ChevronDown,
  ChevronUp,
  FileText,
  MessageSquare,
} from "lucide-react";
import type { ChatMessage, Citation } from "../types";

interface Props {
  messages: ChatMessage[];
  isLoading: boolean;
  selectedDocCount: number;
  onSend: (question: string) => void;
  onClear: () => void;
}

function CitationCard({ citation }: { citation: Citation }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden text-xs">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-750 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <FileText className="w-3.5 h-3.5 text-brand-400 flex-shrink-0" />
        <span className="text-gray-300 flex-1 truncate">
          {citation.document_name}
          {citation.page_number ? ` · Page ${citation.page_number}` : ""}
        </span>
        {expanded ? (
          <ChevronUp className="w-3.5 h-3.5 text-gray-500" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
        )}
      </button>
      {expanded && (
        <div className="px-3 py-2 bg-gray-900 text-gray-400 leading-relaxed border-t border-gray-700">
          {citation.excerpt}
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      {/* Avatar */}
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
          isUser ? "bg-brand-600" : "bg-gray-700"
        }`}
      >
        {isUser ? (
          <User className="w-4 h-4 text-white" />
        ) : (
          <Bot className="w-4 h-4 text-brand-300" />
        )}
      </div>

      <div className={`flex-1 space-y-2 ${isUser ? "items-end" : "items-start"} flex flex-col`}>
        {/* Bubble */}
        <div
          className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
            isUser
              ? "bg-brand-600 text-white rounded-tr-sm"
              : "bg-gray-800 text-gray-100 rounded-tl-sm"
          }`}
        >
          {message.isLoading ? (
            <div className="flex gap-1 items-center py-1">
              <div className="w-2 h-2 bg-brand-400 rounded-full animate-bounce [animation-delay:0ms]" />
              <div className="w-2 h-2 bg-brand-400 rounded-full animate-bounce [animation-delay:150ms]" />
              <div className="w-2 h-2 bg-brand-400 rounded-full animate-bounce [animation-delay:300ms]" />
            </div>
          ) : (
            <div className="whitespace-pre-wrap">{message.content}</div>
          )}
        </div>

        {/* Citations */}
        {!message.isLoading &&
          message.citations &&
          message.citations.length > 0 && (
            <div className="max-w-[85%] w-full space-y-1">
              <p className="text-xs text-gray-500 px-1">Sources</p>
              {message.citations.map((c, i) => (
                <CitationCard key={i} citation={c} />
              ))}
            </div>
          )}
      </div>
    </div>
  );
}

export default function ChatPanel({
  messages,
  isLoading,
  selectedDocCount,
  onSend,
  onClear,
}: Props) {
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    const q = input.trim();
    if (!q || isLoading) return;
    setInput("");
    onSend(q);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const scopeLabel =
    selectedDocCount > 0
      ? `${selectedDocCount} document${selectedDocCount > 1 ? "s" : ""} selected`
      : "All documents";

  return (
    <div className="flex flex-col h-full bg-gray-950">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-100 tracking-wide uppercase">
            AI Chat
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Scope:{" "}
            <span className="text-brand-400 font-medium">{scopeLabel}</span>
          </p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={onClear}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-gray-800"
          >
            <Trash2 className="w-3.5 h-3.5" /> New Chat
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-full bg-brand-900/40 flex items-center justify-center mb-4">
              <MessageSquare className="w-8 h-8 text-brand-400" />
            </div>
            <h3 className="text-gray-300 font-medium mb-1">
              Ask anything about your documents
            </h3>
            <p className="text-gray-500 text-sm max-w-xs">
              Upload documents on the left, then ask questions here. Answers
              come exclusively from your files.
            </p>
            <div className="mt-6 grid grid-cols-1 gap-2 w-full max-w-sm">
              {[
                "Summarize the key points",
                "What are the main risks?",
                "Compare the documents",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => onSend(suggestion)}
                  className="text-sm text-left px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => <MessageBubble key={i} message={msg} />)
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-gray-700">
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about your documents... (Enter to send)"
            rows={1}
            className="flex-1 resize-none bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/50 transition-colors"
            style={{ maxHeight: "120px", overflowY: "auto" }}
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="w-11 h-11 flex items-center justify-center rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
          >
            <Send className="w-4 h-4 text-white" />
          </button>
        </div>
        <p className="text-xs text-gray-600 mt-1.5 text-center">
          Shift+Enter for new line · Enter to send
        </p>
      </div>
    </div>
  );
}
