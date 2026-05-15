import { useEffect, useRef, useState } from "react";
import { Toaster } from "react-hot-toast";
import { Bot, LogOut, Settings } from "lucide-react";
import DocumentPanel from "./components/DocumentPanel";
import ChatPanel from "./components/ChatPanel";
import { useDocuments } from "./hooks/useDocuments";
import { useChat } from "./hooks/useChat";
import { authApi } from "./services/api";
import type { AuthUser } from "./types";
import toast from "react-hot-toast";
import SettingsModal from "./components/SettingsModal";

export default function App() {
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  const loginButtonRef = useRef<HTMLDivElement | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const { documents, loading, upload, remove, refresh } = useDocuments();
  const { messages, isLoading, sendMessage, clearChat } =
    useChat(selectedDocIds);

  useEffect(() => {
    authApi
      .me()
      .then((res) => setUser(res.user))
      .finally(() => setAuthLoading(false));
  }, []);

  useEffect(() => {
    if (authLoading || user || !googleClientId || !loginButtonRef.current) {
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (!window.google || !loginButtonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (res) => {
          try {
            const data = await authApi.googleLogin(res.credential);
            setUser(data.user);
            refresh();
          } catch {
            toast.error("Google login failed");
          }
        },
      });
      loginButtonRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(loginButtonRef.current, {
        theme: "outline",
        size: "large",
        shape: "pill",
        text: "continue_with",
      });
    };
    document.body.appendChild(script);
    return () => {
      script.remove();
    };
  }, [authLoading, user, googleClientId, refresh]);

  const handleLogout = async () => {
    try {
      await authApi.logout();
      setUser(null);
      setSelectedDocIds([]);
      clearChat();
    } catch {
      toast.error("Logout failed");
    }
  };

  if (authLoading) {
    return <div className="h-screen bg-gray-950 text-gray-100 flex items-center justify-center">Loading...</div>;
  }

  if (!user) {
    return (
      <div className="h-screen bg-gray-950 text-gray-100 flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-8 text-center">
          <div className="w-12 h-12 rounded-xl bg-brand-600 flex items-center justify-center mx-auto mb-4">
            <Bot className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-xl font-bold text-white">Sign in to DocuChat</h1>
          <p className="text-sm text-gray-400 mt-2 mb-6">
            Use your Google account to continue.
          </p>
          {!googleClientId ? (
            <p className="text-red-400 text-sm">Missing VITE_GOOGLE_CLIENT_ID in frontend env.</p>
          ) : (
            <div ref={loginButtonRef} className="flex justify-center" />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100">
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
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
          <p className="text-xs text-gray-400">{user.email}</p>
        </div>
        <button
          className="ml-auto inline-flex items-center gap-2 text-xs text-gray-300 hover:text-white"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings className="w-4 h-4" />
          Settings
        </button>
        <button
          className="inline-flex items-center gap-2 text-xs text-gray-300 hover:text-white"
          onClick={handleLogout}
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>
        <div className="text-xs text-gray-500">
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
            onRefresh={refresh}
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
