import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
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
  X,
  ExternalLink,
} from "lucide-react";
import type { Document, Visibility } from "../types";
import { documentsApi, driveApi } from "../services/api";
import toast from "react-hot-toast";

interface Props {
  documents: Document[];
  loading: boolean;
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  visibilityMode: Visibility;
  onVisibilityModeChange: (visibility: Visibility) => void;
  onUpload: (file: File, visibility: Visibility) => Promise<unknown>;
  onDelete: (id: string) => void;
  onUpdateVisibility: (id: string, visibility: Visibility) => void;
  onRefresh: () => Promise<void>;
  onCreditsChanged?: () => void;
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
  visibilityMode,
  onVisibilityModeChange,
  onUpload,
  onDelete,
  onUpdateVisibility,
  onRefresh,
  onCreditsChanged,
}: Props) {
  const [uploading, setUploading] = useState(false);
  const [driveFiles, setDriveFiles] = useState<Array<{ id: string; name: string; mimeType: string }>>([]);
  const [selectedDriveIds, setSelectedDriveIds] = useState<string[]>([]);
  const [driveConnected, setDriveConnected] = useState(false);
  const [loadingDrive, setLoadingDrive] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [drivePickerOpen, setDrivePickerOpen] = useState(false);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const SUPPORTED_EXTENSIONS = new Set([
    ".pdf",
    ".docx",
    ".doc",
    ".xlsx",
    ".xls",
    ".csv",
    ".txt",
    ".png",
    ".jpg",
    ".jpeg",
    ".tiff",
    ".tif",
    ".bmp",
    ".gif",
  ]);

  useEffect(() => {
    driveApi
      .status()
      .then((res) => setDriveConnected(Boolean(res.connected)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute("webkitdirectory", "");
    }
  }, []);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      setUploading(true);
      for (const file of acceptedFiles) {
        await onUpload(file, visibilityMode).catch(() => {});
      }
      setUploading(false);
      setUploadDialogOpen(false);
    },
    [onUpload, visibilityMode]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
    disabled: uploading,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "application/msword": [".doc"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel": [".xls"],
      "text/csv": [".csv"],
      "text/plain": [".txt"],
      "image/*": [".png", ".jpg", ".jpeg", ".tiff", ".tif", ".bmp", ".gif"],
    },
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
      setDriveFiles((res.files || []).map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType })));
      setDriveConnected(true);
      setDrivePickerOpen(true);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || "Could not load Drive files";
      toast.error(msg);
    } finally {
      setLoadingDrive(false);
    }
  };

  const importDriveFile = async (fileId: string) => {
    try {
      await driveApi.importFile(fileId, visibilityMode);
      toast.success("Drive file imported and processing started");
      onRefresh();
      onCreditsChanged?.();
    } catch (err: any) {
      const msg = err?.response?.data?.detail || "Drive import failed";
      toast.error(msg);
    }
  };

  const toggleDriveSelection = (fileId: string) => {
    setSelectedDriveIds((prev) =>
      prev.includes(fileId) ? prev.filter((id) => id !== fileId) : [...prev, fileId]
    );
  };

  const importSelectedDriveFiles = async () => {
    if (!selectedDriveIds.length) {
      toast.error("Select at least one Drive file");
      return;
    }
    setUploading(true);
    const selectedItems = driveFiles.filter((f) => selectedDriveIds.includes(f.id));
    for (const item of selectedItems) {
      if (item.mimeType === "application/vnd.google-apps.folder") {
        try {
          const res = await driveApi.importFolder(item.id, visibilityMode);
          toast.success(`Imported ${res.imported_count} file(s) from folder "${item.name}"`);
          if (res.skipped_count > 0) {
            toast.error(`Skipped ${res.skipped_count} unsupported/error file(s) in "${item.name}"`);
          }
          onRefresh();
          onCreditsChanged?.();
        } catch (err: any) {
          const msg = err?.response?.data?.detail || "Drive folder import failed";
          toast.error(msg);
        }
      } else {
        await importDriveFile(item.id);
      }
    }
    setUploading(false);
    setSelectedDriveIds([]);
    setDrivePickerOpen(false);
    setUploadDialogOpen(false);
  };

  const openFolderPicker = () => {
    const showDirectoryPicker = (window as any).showDirectoryPicker as
      | (() => Promise<any>)
      | undefined;
    if (!showDirectoryPicker) {
      toast.error("Native folder picker unavailable. Using browser fallback picker.");
      folderInputRef.current?.click();
      return;
    }

    (async () => {
      try {
        const root = await showDirectoryPicker();
        const files: File[] = [];

        const walk = async (dirHandle: any) => {
          for await (const [, handle] of dirHandle.entries()) {
            if (handle.kind === "file") {
              const file = await handle.getFile();
              files.push(file);
            } else if (handle.kind === "directory") {
              await walk(handle);
            }
          }
        };

        await walk(root);
        if (!files.length) {
          toast.error("Selected folder has no files");
          return;
        }

        const uploadable = files.filter((file) => {
          const idx = file.name.lastIndexOf(".");
          if (idx < 0) return false;
          const ext = file.name.slice(idx).toLowerCase();
          return SUPPORTED_EXTENSIONS.has(ext);
        });
        const skippedCount = files.length - uploadable.length;
        if (!uploadable.length) {
          toast.error("No supported files found in selected folder");
          return;
        }

        setUploading(true);
        for (const file of uploadable) {
          await onUpload(file, visibilityMode).catch(() => {});
        }
        setUploading(false);
        if (skippedCount > 0) {
          toast.error(`Skipped ${skippedCount} unsupported file(s)`);
        }
        toast.success(`Queued ${uploadable.length} file(s) from folder`);
        setUploadDialogOpen(false);
      } catch (err: any) {
        // Fallback for browsers/environments where File System Access API is blocked.
        const message = String(err?.message || err || "Unknown error");
        const lower = message.toLowerCase();
        if (!lower.includes("aborted") && !lower.includes("cancel")) {
          console.error("showDirectoryPicker failed:", err);
          toast.error(`Folder picker blocked: ${message}`);
        }
        folderInputRef.current?.click();
      }
    })();
  };

  const handleFolderSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const uploadable = files.filter((file) => {
      const idx = file.name.lastIndexOf(".");
      if (idx < 0) return false;
      const ext = file.name.slice(idx).toLowerCase();
      return SUPPORTED_EXTENSIONS.has(ext);
    });
    const skippedCount = files.length - uploadable.length;
    if (!uploadable.length) {
      toast.error("No supported files found in selected folder");
      event.target.value = "";
      return;
    }
    setUploading(true);
    for (const file of uploadable) {
      await onUpload(file, visibilityMode).catch(() => {});
    }
    setUploading(false);
    if (skippedCount > 0) {
      toast.error(`Skipped ${skippedCount} unsupported file(s)`);
    }
    toast.success(`Queued ${uploadable.length} file(s) from folder`);
    event.target.value = "";
    setUploadDialogOpen(false);
  };

  const handleDownload = (e: React.MouseEvent, docId: string) => {
    e.stopPropagation();
    const href = documentsApi.downloadUrl(docId);
    window.open(href, "_blank", "noopener,noreferrer");
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

      {/* Upload Controls */}
      <div className="px-3 py-3 border-b border-gray-700 space-y-2">
        {/* Visibility toggle */}
        <div className="flex rounded-lg overflow-hidden border border-gray-600 text-xs">
          <button
            onClick={() => onVisibilityModeChange("public")}
            className={`flex-1 flex items-center justify-center gap-1 py-1.5 transition-colors ${
              visibilityMode === "public"
                ? "bg-brand-600 text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            <Globe className="w-3 h-3" /> Public
          </button>
          <button
            onClick={() => onVisibilityModeChange("private")}
            className={`flex-1 flex items-center justify-center gap-1 py-1.5 transition-colors ${
              visibilityMode === "private"
                ? "bg-brand-600 text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            <Lock className="w-3 h-3" /> Private
          </button>
        </div>

        <button
          onClick={() => setUploadDialogOpen(true)}
          className="w-full text-xs px-2 py-2 rounded bg-brand-700 hover:bg-brand-600 text-white inline-flex items-center justify-center gap-1"
        >
          <Upload className="w-3.5 h-3.5" />
          Upload Files
        </button>
      </div>

      {uploadDialogOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-xl border border-gray-700 bg-gray-900 shadow-2xl">
            <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-100">Upload Documents</h3>
              <button
                onClick={() => setUploadDialogOpen(false)}
                className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3">
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
                <p className="text-xs text-gray-300">
                  {isDragActive
                    ? "Drop files here..."
                    : "Choose from browser (multiple) or drag & drop"}
                </p>
              </div>
              <input
                ref={folderInputRef}
                type="file"
                multiple
                className="hidden"
                // Non-standard attrs are required for folder picking in Chromium-based browsers.
                // TS/React don't type these well, so they are applied both here and in useEffect.
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                webkitdirectory=""
                onClick={(e) => {
                  // Allow selecting the same folder repeatedly.
                  (e.currentTarget as HTMLInputElement).value = "";
                }}
                onChange={handleFolderSelected}
              />
              <button
                onClick={openFolderPicker}
                disabled={uploading}
                className="w-full text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-60 text-gray-100"
              >
                Browse Folder (Local)
              </button>

              <div className="rounded-lg border border-gray-700 bg-gray-850 p-3 space-y-2">
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
              </div>
            </div>
          </div>
        </div>
      )}

      {drivePickerOpen && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-xl border border-gray-700 bg-gray-900 shadow-2xl">
            <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-100">Google Drive Files</h3>
              <button
                onClick={() => setDrivePickerOpen(false)}
                className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {driveFiles.length === 0 ? (
                <p className="text-xs text-gray-400">No files found.</p>
              ) : (
                <div className="max-h-72 overflow-y-auto space-y-1">
                  {driveFiles.map((f) => (
                    <label
                      key={f.id}
                      className="w-full text-left text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 flex items-center gap-2"
                      title={f.name}
                    >
                      <input
                        type="checkbox"
                        checked={selectedDriveIds.includes(f.id)}
                        onChange={() => toggleDriveSelection(f.id)}
                        className="accent-brand-500"
                      />
                      <span className="truncate">
                        {f.mimeType === "application/vnd.google-apps.folder" ? "[Folder] " : ""}
                        {f.name}
                      </span>
                    </label>
                  ))}
                </div>
              )}
              <button
                onClick={importSelectedDriveFiles}
                disabled={uploading || selectedDriveIds.length === 0}
                className="w-full text-xs px-2 py-1 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-60 text-white"
              >
                Import Selected ({selectedDriveIds.length})
              </button>
            </div>
          </div>
        </div>
      )}

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
                      {visibilityMode === "private" || doc.visibility === "private" ? doc.id : doc.name}
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
                  onClick={(e) => handleDownload(e, doc.id)}
                  className={`opacity-0 group-hover:opacity-100 p-1 rounded text-gray-500 hover:text-brand-300 hover:bg-gray-700 transition-all ${
                    doc.visibility === "public" && visibilityMode === "public" ? "" : "hidden"
                  }`}
                  title="Download file"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdateVisibility(doc.id, doc.visibility === "public" ? "private" : "public");
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-500 hover:text-yellow-300 hover:bg-gray-700 transition-all"
                  title={doc.visibility === "public" ? "Make Private" : "Make Public"}
                >
                  {doc.visibility === "public" ? (
                    <Lock className="w-3.5 h-3.5" />
                  ) : (
                    <Globe className="w-3.5 h-3.5" />
                  )}
                </button>

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
