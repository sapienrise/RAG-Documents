import { useState } from "react";
import { Toaster } from "react-hot-toast";
import { Bot } from "lucide-react";
import DocumentPanel from "./components/DocumentPanel";
import ChatPanel from "./components/ChatPanel";
import { useDocuments } from "./hooks/useDocuments";
import { useChat } from "./hooks/useChat";

export default function App() {
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const { documents, loading, upload, remove } = useDocuments();
  const { messages, isLoading, sendMessage, clearChat } =
    useChat(selectedDocIds);

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100">
      <Toaster
        position="top-right"
        toastOptions={{
          style: { background: "#1f2937", color: "#f9fafb", border: "1px solid #374151" },
        }}
      />

      {/* Top Bar */}
      <header className="flex items-center gap-3 px-5 py-3 bg-gray-900 border-b border-gray-700 flex-shrink-0">
        <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
          <Bot className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-white tracking-tight">
            DocuChat
          </h1>
          <p className="text-xs text-gray-400">AI Document Intelligence</p>
        </div>
        <div className="ml-auto text-xs text-gray-500">
          {documents.filter((d) => d.status === "ready").length} document
          {documents.filter((d) => d.status === "ready").length !== 1 ? "s" : ""}{" "}
          ready
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Document Panel */}
        <div className="w-72 flex-shrink-0 overflow-hidden flex flex-col">
          <DocumentPanel
            documents={documents}
            loading={loading}
            selectedIds={selectedDocIds}
            onSelect={setSelectedDocIds}
            onUpload={upload}
            onDelete={remove}
          />
        </div>

        {/* Right: Chat Panel */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <ChatPanel
            messages={messages}
            isLoading={isLoading}
            selectedDocCount={selectedDocIds.length}
            onSend={sendMessage}
            onClear={clearChat}
          />
        </div>
      </div>
    </div>
  );
}
