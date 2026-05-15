import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { settingsApi } from "../services/api";
import type { DriveSettings } from "../types";
import toast from "react-hot-toast";

interface Props {
  open: boolean;
  onClose: () => void;
}

const EMPTY_FORM: DriveSettings = {
  google_client_id: "",
  google_client_secret: "",
  google_drive_api_key: "",
  google_redirect_uri: "http://localhost:8001/api/drive/callback",
  frontend_url: "http://localhost:3005",
  other_data: "",
};

export default function SettingsModal({ open, onClose }: Props) {
  const [form, setForm] = useState<DriveSettings>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    settingsApi
      .getDrive()
      .then((data) => setForm(data))
      .catch(() => toast.error("Failed to load settings"))
      .finally(() => setLoading(false));
  }, [open]);

  const update = (key: keyof DriveSettings, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    try {
      await settingsApi.saveDrive(form);
      toast.success("Settings saved to PostgreSQL");
      onClose();
    } catch (err: any) {
      const msg = err?.response?.data?.detail || "Save failed";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-gray-900 border border-gray-700 rounded-xl">
        <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Settings - Google Drive</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          {loading ? (
            <p className="text-sm text-gray-400">Loading...</p>
          ) : (
            <>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Global (Common for all users)</div>
              <input className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm" placeholder="Google Client ID" value={form.google_client_id} onChange={(e) => update("google_client_id", e.target.value)} />
              <input className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm" placeholder="Google Client Secret" value={form.google_client_secret} onChange={(e) => update("google_client_secret", e.target.value)} />
              <input className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm" placeholder="Google Redirect URI" value={form.google_redirect_uri} onChange={(e) => update("google_redirect_uri", e.target.value)} />
              <input className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm" placeholder="Frontend URL" value={form.frontend_url} onChange={(e) => update("frontend_url", e.target.value)} />
              <textarea className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm min-h-24" placeholder="Other data (notes/json)" value={form.other_data} onChange={(e) => update("other_data", e.target.value)} />

              <div className="pt-2 text-xs text-gray-500 uppercase tracking-wide">Per User</div>
              <input className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm" placeholder="Google Drive API Key (this user only)" value={form.google_drive_api_key} onChange={(e) => update("google_drive_api_key", e.target.value)} />
            </>
          )}
        </div>
        <div className="px-4 py-3 border-t border-gray-700 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 text-xs rounded bg-gray-700 hover:bg-gray-600">Cancel</button>
          <button disabled={saving || loading} onClick={save} className="px-3 py-2 text-xs rounded bg-brand-600 hover:bg-brand-500 disabled:opacity-50">
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
