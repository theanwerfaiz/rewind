export type RewindHttpResponseMetadata = {
  status: number;
  statusText: string;
  headers?: Record<string, string>;
  body?: unknown;
};

export type RewindHttpMetadata = {
  environment: string;
  method: string;
  path: string;
  headers: Record<string, string>;
  response?: RewindHttpResponseMetadata;
  error?: string;
};
