import { useCallback, useEffect, useRef, useState } from "react";
import { Toaster } from "react-hot-toast";
import { Bot, Check, LogOut, Settings } from "lucide-react";
import DocumentPanel from "./components/DocumentPanel";
import ChatPanel from "./components/ChatPanel";
import { useDocuments } from "./hooks/useDocuments";
import { useChat } from "./hooks/useChat";
import { authApi, billingApi, settingsApi } from "./services/api";
import type { AuthUser } from "./types";
import type { Visibility } from "./types";
import toast from "react-hot-toast";
import SettingsModal from "./components/SettingsModal";

export default function App() {
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  const loginButtonRef = useRef<HTMLDivElement | null>(null);
  const creditsInFlightRef = useRef(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [visibilityMode, setVisibilityMode] = useState<Visibility>("public");
  const refreshCredits = useCallback(() => {
    if (creditsInFlightRef.current) return;
    creditsInFlightRef.current = true;
    billingApi
      .credits()
      .then((res) => setCreditsBalance(res.credits_balance))
      .catch(() => {});
    setTimeout(() => {
      creditsInFlightRef.current = false;
    }, 1200);
  }, []);
  const { documents, loading, upload, remove, updateVisibility, refresh } = useDocuments(refreshCredits);
  const { messages, isLoading, sendMessage, clearChat } =
    useChat(selectedDocIds, refreshCredits);
  const [subscribing, setSubscribing] = useState(false);
  const [creditsBalance, setCreditsBalance] = useState<number | null>(null);
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const [customCredits, setCustomCredits] = useState(100);

  useEffect(() => {
    authApi
      .me()
      .then((res) => setUser(res.user))
      .finally(() => setAuthLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    settingsApi
      .getVisibilityMode()
      .then((res) => {
        if (res.visibility_mode === "private" || res.visibility_mode === "public") {
          setVisibilityMode(res.visibility_mode);
        }
      })
      .catch(() => {});
    refreshCredits();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") refreshCredits();
    }, 30000);
    return () => clearInterval(interval);
  }, [user, refreshCredits]);

  const handleVisibilityModeChange = (mode: Visibility) => {
    setVisibilityMode(mode);
    settingsApi.saveVisibilityMode(mode).catch(() => {});
  };

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

  const loadRazorpayScript = async () => {
    if (window.Razorpay) return true;
    return new Promise<boolean>((resolve) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handleSubscribe = async (creditsToGrant: number, amountInr: number) => {
    if (subscribing) return;
    setSubscribing(true);
    try {
      const loaded = await loadRazorpayScript();
      if (!loaded || !window.Razorpay) {
        toast.error("Unable to load Razorpay checkout");
        return;
      }

      const order = await billingApi.createOrder({
        amount_inr: amountInr,
        credits_to_grant: creditsToGrant,
      });
      const razorpay = new window.Razorpay({
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        name: "DocuChat",
        description: order.plan_name,
        order_id: order.order_id,
        prefill: {
          name: order.prefill_name,
          email: order.prefill_email,
        },
        theme: { color: "#2563eb" },
        handler: async (response) => {
          try {
            await billingApi.verifyPayment(response);
            refreshCredits();
            toast.success("Subscription payment successful");
            setSubscribeOpen(false);
          } catch (err: any) {
            const msg = err?.response?.data?.detail || "Payment verification failed";
            toast.error(msg);
          }
        },
      });
      razorpay.open();
    } catch (err: any) {
      const msg = err?.response?.data?.detail || "Could not start subscription checkout";
      toast.error(msg);
    } finally {
      setSubscribing(false);
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

  const plans = [
    {
      key: "free",
      tier: "Free",
      title: "3 Credits",
      credits: 0,
      amountInr: 0,
      uploads: 1,
      chats: 2,
      description: "Good for testing document upload and basic Q&A.",
      features: [
        "1 file upload credit",
        "2 chat query credits",
        "Basic processing speed",
        "Community support",
      ],
      cta: "Current Plan",
      popular: false,
      custom: false,
      isFree: true,
    },
    {
      key: "p10",
      tier: "Starter",
      title: "10 Credits",
      credits: 10,
      amountInr: 10,
      uploads: 1,
      chats: 20,
      description: "Perfect for trying uploads and short document chats.",
      features: [
        "1 file upload credit",
        "20 chat query credits",
        "Standard processing",
        "Email support",
      ],
      cta: "Start Plan",
      popular: false,
      custom: false,
      isFree: false,
    },
    {
      key: "p50",
      tier: "Professional",
      title: "50 Credits",
      credits: 50,
      amountInr: 50,
      uploads: 3,
      chats: 40,
      description: "For regular usage with higher chat and upload capacity.",
      features: [
        "3 file upload credits",
        "40 chat query credits",
        "Priority processing",
        "Faster support response",
      ],
      cta: "Start Plan",
      popular: true,
      custom: false,
      isFree: false,
    },
    {
      key: "custom",
      tier: "Custom",
      title: `${customCredits} Credits`,
      credits: customCredits,
      amountInr: customCredits,
      uploads: Math.max(1, Math.floor(customCredits / 10)),
      chats: customCredits * 2,
      description: "Choose your own credits for custom upload and chat needs.",
      features: [
        "Flexible credit amount",
        "Uploads scale with credits",
        "Chats scale with credits",
        "Best for burst workloads",
      ],
      cta: "Pay Custom",
      popular: false,
      custom: true,
      isFree: false,
    },
  ];

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100">
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      {subscribeOpen && (
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-6xl rounded-2xl border border-gray-800 bg-gray-950 shadow-[0_30px_120px_rgba(0,0,0,0.6)]">
            <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-100">Pricing & Credits</h3>
              <button
                className="text-gray-400 hover:text-gray-200 text-sm"
                onClick={() => setSubscribeOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="p-6">
              <div className="text-center mb-6">
                <h2 className="text-3xl font-bold text-white tracking-tight">Simple, transparent pricing</h2>
                <p className="text-gray-400 mt-1">Choose the plan that&apos;s right for your usage</p>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
                {plans.map((p) => (
                  <div
                    key={p.key}
                    className={`relative rounded-2xl border p-6 bg-gray-950/80 transition-all duration-300 hover:-translate-y-1 ${
                      p.popular
                        ? "border-amber-500 shadow-[0_0_40px_rgba(251,146,60,0.18)]"
                        : "border-gray-800 hover:border-gray-700"
                    }`}
                  >
                    {p.popular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-amber-500 text-black text-xs font-semibold px-3 py-1 uppercase tracking-wide">
                        Most Popular
                      </div>
                    )}
                    <div className="text-gray-400 font-semibold uppercase tracking-wide text-sm">{p.tier}</div>
                    <div className="mt-4 flex items-end gap-1">
                      <span className="text-5xl font-bold text-white">₹{p.amountInr}</span>
                      <span className="text-gray-400 pb-1">/one-time</span>
                    </div>
                    <div className="mt-2 text-sm text-brand-300 font-medium">
                      {p.title}: {p.uploads} upload, {p.chats} chat
                    </div>
                    <p className="text-gray-400 text-sm mt-4">{p.description}</p>
                    <div className="mt-5 space-y-3">
                      {p.features.map((f) => (
                        <div
                          key={f}
                          className={`group/item flex items-center gap-2 text-sm transition-all duration-300 ${
                            p.popular ? "text-gray-100" : "text-gray-200 hover:text-gray-100"
                          }`}
                        >
                          <span
                            className={`w-5 h-5 rounded-full flex items-center justify-center transition-all duration-300 ${
                              p.popular
                                ? "bg-amber-900/45 group-hover/item:bg-amber-500/35 group-hover/item:shadow-[0_0_14px_rgba(251,146,60,0.6)]"
                                : "bg-gray-800 group-hover/item:bg-brand-500/30 group-hover/item:shadow-[0_0_12px_rgba(45,212,191,0.45)]"
                            }`}
                          >
                            <Check
                              className={`w-3 h-3 transition-colors duration-300 ${
                                p.popular
                                  ? "text-amber-400 group-hover/item:text-amber-300"
                                  : "text-brand-300 group-hover/item:text-brand-200"
                              }`}
                            />
                          </span>
                          <span
                            className={`transition-colors duration-300 ${
                              p.popular
                                ? "group-hover/item:text-amber-100"
                                : "group-hover/item:text-brand-100"
                            }`}
                          >
                            {f}
                          </span>
                        </div>
                      ))}
                    </div>
                    {p.custom && (
                      <div className="mt-5">
                        <label className="text-xs text-gray-400">Custom credits</label>
                        <input
                          type="number"
                          min={1}
                          value={customCredits}
                          onChange={(e) => setCustomCredits(Math.max(1, Number(e.target.value) || 1))}
                          className="mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100"
                        />
                      </div>
                    )}
                    <button
                      className={`w-full mt-6 rounded-full px-4 py-3 text-sm font-semibold tracking-wide transition-all duration-300 disabled:opacity-60 ${
                        p.isFree
                          ? "border border-gray-700 text-gray-300 bg-gray-900 cursor-not-allowed"
                          :
                        p.popular
                          ? "bg-amber-500 text-black hover:bg-amber-400 shadow-[0_0_22px_rgba(251,146,60,0.5)]"
                          : "border border-gray-700 text-gray-100 hover:bg-gray-800"
                      }`}
                      onClick={() => {
                        if (p.isFree) return;
                        handleSubscribe(p.credits, p.amountInr);
                      }}
                      disabled={subscribing || p.isFree}
                    >
                      {subscribing ? "Starting..." : p.custom ? `Pay ₹${customCredits}` : p.cta}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      <Toaster
        position="top-right"
        toastOptions={{
          style: { background: "#1f2937", color: "#f9fafb", border: "1px solid #374151" },
        }}
      />

      {/* Top Bar */}
      <header className="flex items-center gap-3 px-5 py-3.5 bg-gray-900 border-b border-gray-700 flex-shrink-0 overflow-hidden">
        <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
          <Bot className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-white tracking-tight">
            DocuChat
          </h1>
          <p className="text-xs text-gray-400">{user.email}</p>
        </div>
        <div className="ml-auto flex items-center justify-end gap-2.5 min-w-0 max-w-[60%]">
          <button
            className="inline-flex items-center gap-1.5 text-sm text-gray-300 hover:text-white whitespace-nowrap"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings className="w-4 h-4" />
            Settings
          </button>
          <div className="text-sm text-emerald-300 whitespace-nowrap">
            Credits: {creditsBalance ?? "..."}
          </div>
          <button
            className="inline-flex items-center gap-1.5 text-sm px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-60 whitespace-nowrap"
            onClick={() => setSubscribeOpen(true)}
            disabled={subscribing}
          >
            Subscribe
          </button>
          <button
            className="inline-flex items-center gap-1.5 text-sm text-gray-300 hover:text-white whitespace-nowrap"
            onClick={handleLogout}
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
          <div className="text-sm text-gray-500 whitespace-nowrap truncate max-w-[140px]">
            {documents.filter((d) => d.status === "ready").length} document
            {documents.filter((d) => d.status === "ready").length !== 1 ? "s" : ""}{" "}
            ready
          </div>
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
            visibilityMode={visibilityMode}
            onVisibilityModeChange={handleVisibilityModeChange}
            onUpload={upload}
            onDelete={remove}
            onUpdateVisibility={updateVisibility}
            onRefresh={refresh}
            onCreditsChanged={refreshCredits}
          />
        </div>

        {/* Right: Chat Panel */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <ChatPanel
            messages={messages}
            isLoading={isLoading}
            selectedDocCount={selectedDocIds.length}
            visibilityMode={visibilityMode}
            onSend={sendMessage}
            onClear={clearChat}
          />
        </div>
      </div>
    </div>
  );
}
