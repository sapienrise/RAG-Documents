import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  FileText,
  Trash2,
  Upload,
  Lock,
  Globe,
  AlertCircle,
  CheckCircle,
  Loader2,
  FileSpreadsheet,
  Image,
  File,
  Link,
  Download,
} from "lucide-react";
import type { Document, Visibility } from "../types";
import { driveApi } from "../services/api";
import toast from "react-hot-toast";

interface Props {
  documents: Document[];
  loading: boolean;
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  onUpload: (file: File, visibility: Visibility) => Promise<unknown>;
  onDelete: (id: string) => void;
  onRefresh: () => Promise<void>;
}

function fileIcon(type: string) {
  if (type === "pdf") return <FileText className="w-4 h-4 text-red-400" />;
  if (type === "docx" || type === "doc")
    return <FileText className="w-4 h-4 text-blue-400" />;
  if (type === "xlsx" || type === "xls" || type === "csv")
    return <FileSpreadsheet className="w-4 h-4 text-green-400" />;
  if (type === "image")
    return <Image className="w-4 h-4 text-purple-400" />;
  return <File className="w-4 h-4 text-gray-400" />;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function statusBadge(status: Document["status"]) {
  if (status === "ready")
    return (
      <span className="flex items-center gap-1 text-xs text-emerald-400">
        <CheckCircle className="w-3 h-3" /> Ready
      </span>
    );
  if (status === "processing")
    return (
      <span className="flex items-center gap-1 text-xs text-amber-400 animate-pulse">
        <Loader2 className="w-3 h-3 animate-spin" /> Processing
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-xs text-red-400">
      <AlertCircle className="w-3 h-3" /> Failed
    </span>
  );
}

export default function DocumentPanel({
  documents,
  loading,
  selectedIds,
  onSelect,
  onUpload,
  onDelete,
  onRefresh,
}: Props) {
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [uploading, setUploading] = useState(false);
  const [driveFiles, setDriveFiles] = useState<Array<{ id: string; name: string }>>([]);
  const [driveConnected, setDriveConnected] = useState(false);
  const [loadingDrive, setLoadingDrive] = useState(false);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      setUploading(true);
      for (const file of acceptedFiles) {
        await onUpload(file, visibility).catch(() => {});
      }
      setUploading(false);
    },
    [onUpload, visibility]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
    disabled: uploading,
  });

  const toggleSelect = (id: string) => {
    onSelect(
      selectedIds.includes(id)
        ? selectedIds.filter((s) => s !== id)
        : [...selectedIds, id]
    );
  };

  const readyDocs = documents.filter((d) => d.status === "ready");

  const connectDrive = async () => {
    try {
      const res = await driveApi.authUrl();
      const popup = window.open(res.url, "google-drive-oauth", "width=520,height=680");
      if (!popup) {
        toast.error("Popup blocked. Please allow popups.");
        return;
      }
      const onMessage = (event: MessageEvent) => {
        if (event.data?.type === "drive_oauth") {
          if (event.data.status === "success") {
            setDriveConnected(true);
            toast.success("Google Drive connected");
          } else {
            toast.error("Google Drive connection failed");
          }
          window.removeEventListener("message", onMessage);
        }
      };
      window.addEventListener("message", onMessage);
    } catch {
      toast.error("Could not start Google Drive OAuth");
    }
  };

  const loadDriveFiles = async () => {
    setLoadingDrive(true);
    try {
      const res = await driveApi.listFiles();
      setDriveFiles((res.files || []).map((f) => ({ id: f.id, name: f.name })));
      setDriveConnected(true);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || "Could not load Drive files";
      toast.error(msg);
    } finally {
      setLoadingDrive(false);
    }
  };

  const importDriveFile = async (fileId: string) => {
    try {
      await driveApi.importFile(fileId, visibility);
      toast.success("Drive file imported and processing started");
      onRefresh();
    } catch (err: any) {
      const msg = err?.response?.data?.detail || "Drive import failed";
      toast.error(msg);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 border-r border-gray-700">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-700">
        <h2 className="text-sm font-semibold text-gray-100 tracking-wide uppercase">
          Documents
        </h2>
        {selectedIds.length > 0 && (
          <p className="text-xs text-brand-400 mt-0.5">
            {selectedIds.length} selected for chat
          </p>
        )}
      </div>

      {/* Upload Zone */}
      <div className="px-3 py-3 border-b border-gray-700 space-y-2">
        {/* Visibility toggle */}
        <div className="flex rounded-lg overflow-hidden border border-gray-600 text-xs">
          <button
            onClick={() => setVisibility("public")}
            className={`flex-1 flex items-center justify-center gap-1 py-1.5 transition-colors ${
              visibility === "public"
                ? "bg-brand-600 text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            <Globe className="w-3 h-3" /> Public
          </button>
          <button
            onClick={() => setVisibility("private")}
            className={`flex-1 flex items-center justify-center gap-1 py-1.5 transition-colors ${
              visibility === "private"
                ? "bg-brand-600 text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            <Lock className="w-3 h-3" /> Private
          </button>
        </div>

        {/* Drop zone */}
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
            isDragActive
              ? "border-brand-400 bg-brand-900/20"
              : "border-gray-600 hover:border-brand-500 hover:bg-gray-800"
          } ${uploading ? "opacity-50 pointer-events-none" : ""}`}
        >
          <input {...getInputProps()} />
          <Upload className="w-6 h-6 text-brand-400 mx-auto mb-1" />
          <p className="text-xs text-gray-400">
            {isDragActive
              ? "Drop files here..."
              : "Drag & drop or click to upload"}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            PDF, DOCX, XLSX, CSV, TXT, Images
          </p>
        </div>

        <div className="rounded-lg border border-gray-700 bg-gray-850 p-2 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-300">Google Drive</span>
            <button
              onClick={connectDrive}
              className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 inline-flex items-center gap-1"
            >
              <Link className="w-3 h-3" />
              {driveConnected ? "Reconnect" : "Connect"}
            </button>
          </div>
          <button
            onClick={loadDriveFiles}
            disabled={loadingDrive}
            className="w-full text-xs px-2 py-1 rounded bg-brand-700 hover:bg-brand-600 disabled:opacity-60 text-white inline-flex items-center justify-center gap-1"
          >
            <Download className="w-3 h-3" />
            {loadingDrive ? "Loading..." : "Load Drive Files"}
          </button>
          {driveFiles.length > 0 && (
            <div className="max-h-32 overflow-y-auto space-y-1">
              {driveFiles.map((f) => (
                <button
                  key={f.id}
                  onClick={() => importDriveFile(f.id)}
                  className="w-full text-left text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 truncate"
                  title={`Import ${f.name}`}
                >
                  {f.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Document List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-6 h-6 text-brand-400 animate-spin" />
          </div>
        ) : documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-500 text-sm">
            <FileText className="w-8 h-8 mb-2 opacity-30" />
            <p>No documents yet</p>
            <p className="text-xs mt-1">Upload files to get started</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {/* Select all / clear */}
            {readyDocs.length > 0 && (
              <div className="px-3 py-1.5 flex gap-2 bg-gray-850">
                <button
                  onClick={() => onSelect(readyDocs.map((d) => d.id))}
                  className="text-xs text-brand-400 hover:text-brand-300"
                >
                  Select all
                </button>
                {selectedIds.length > 0 && (
                  <>
                    <span className="text-gray-600">|</span>
                    <button
                      onClick={() => onSelect([])}
                      className="text-xs text-gray-400 hover:text-gray-300"
                    >
                      Clear
                    </button>
                  </>
                )}
              </div>
            )}
            {documents.map((doc) => (
              <div
                key={doc.id}
                className={`px-3 py-2.5 flex items-start gap-2 group transition-colors ${
                  doc.status === "ready"
                    ? selectedIds.includes(doc.id)
                      ? "bg-brand-900/30 hover:bg-brand-900/40"
                      : "hover:bg-gray-800 cursor-pointer"
                    : "opacity-70"
                }`}
                onClick={() => doc.status === "ready" && toggleSelect(doc.id)}
              >
                {/* Checkbox */}
                {doc.status === "ready" && (
                  <div
                    className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                      selectedIds.includes(doc.id)
                        ? "bg-brand-500 border-brand-500"
                        : "border-gray-500"
                    }`}
                  >
                    {selectedIds.includes(doc.id) && (
                      <svg
                        className="w-2.5 h-2.5 text-white"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {fileIcon(doc.file_type)}
                    <span className="text-xs font-medium text-gray-200 truncate">
                      {doc.id}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {statusBadge(doc.status)}
                    <span className="text-xs text-gray-500">
                      {formatBytes(doc.size_bytes)}
                    </span>
                    {doc.visibility === "private" ? (
                      <Lock className="w-3 h-3 text-gray-500" />
                    ) : (
                      <Globe className="w-3 h-3 text-gray-600" />
                    )}
                  </div>
                  {doc.status === "failed" && doc.error_message && (
                    <p className="text-xs text-red-400 mt-0.5 truncate">
                      {doc.error_message}
                    </p>
                  )}
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(doc.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-500 hover:text-red-400 hover:bg-gray-700 transition-all"
                  title="Delete document"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
