export type RewindHttpResponseMetadata = {
  status: number;
  statusText: string;
  contentType?: string;
  sizeBytes?: number;
  headers?: Record<string, string>;
  body?: unknown;
};

export type RewindHttpMetadata = {
  environment: string;
  method: string;
  path: string;
  contentType?: string;
  requestSizeBytes?: number;
  userAgent?: string;
  headers: Record<string, string>;
  response?: RewindHttpResponseMetadata;
  error?: string;
};
