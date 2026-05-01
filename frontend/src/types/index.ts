export type DocumentStatus = "processing" | "ready" | "failed";
export type Visibility = "public" | "private";

export interface Document {
  id: string;
  name: string;
  file_type: string;
  size_bytes: number;
  visibility: Visibility;
  status: DocumentStatus;
  upload_time: string;
  error_message?: string;
}

export interface Citation {
  document_id: string;
  document_name: string;
  page_number?: number;
  excerpt: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  isLoading?: boolean;
}

export interface ChatRequest {
  question: string;
  history: { role: "user" | "assistant"; content: string }[];
  document_ids: string[];
}

export interface ChatResponse {
  answer: string;
  citations: Citation[];
}
