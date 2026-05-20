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
  visibility?: Visibility;
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

export interface AuthUser {
  sub: string;
  email: string;
  name: string;
  picture: string;
}

export interface DriveSettings {
  google_client_id: string;
  google_client_secret: string;
  google_drive_api_key: string;
  google_redirect_uri: string;
  frontend_url: string;
  other_data: string;
  default_visibility?: Visibility;
}
