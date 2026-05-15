/**
 * Typed fetch wrapper for the Pom Order backend.
 *
 * Uses Supabase session access token for Authorization. Throws ApiException on
 * non-2xx responses with structured error body.
 */

import { getAccessToken } from './supabase'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

export interface ApiError {
  code: string
  message: string
}

export interface ApiErrorResponse {
  error: ApiError
}

export class ApiException extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiException'
  }
}

type FetchOptions = RequestInit & {
  /** Idempotency key for write endpoints (e.g., creating payments). */
  idempotencyKey?: string
  /** Skip Authorization header (for public endpoints). */
  skipAuth?: boolean
}

async function request<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { idempotencyKey, skipAuth, headers, ...rest } = options

  const finalHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(headers as Record<string, string>),
  }

  if (idempotencyKey) {
    finalHeaders['Idempotency-Key'] = idempotencyKey
  }

  if (!skipAuth) {
    const token = await getAccessToken()
    if (token) {
      finalHeaders['Authorization'] = `Bearer ${token}`
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: finalHeaders,
  })

  if (!response.ok) {
    let errorBody: ApiErrorResponse | null = null
    try {
      errorBody = await response.json()
    } catch {
      // body not JSON
    }
    const code = errorBody?.error?.code ?? 'unknown_error'
    const message = errorBody?.error?.message ?? response.statusText
    throw new ApiException(response.status, code, message)
  }

  if (response.status === 204) {
    return undefined as T
  }
  return response.json() as Promise<T>
}

export const apiClient = {
  get: <T>(path: string, opts?: FetchOptions) =>
    request<T>(path, { ...opts, method: 'GET' }),
  post: <T>(path: string, body?: unknown, opts?: FetchOptions) =>
    request<T>(path, {
      ...opts,
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  patch: <T>(path: string, body?: unknown, opts?: FetchOptions) =>
    request<T>(path, {
      ...opts,
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  delete: <T>(path: string, opts?: FetchOptions) =>
    request<T>(path, { ...opts, method: 'DELETE' }),
}

/** Generate a UUID v4 for Idempotency-Key (browser native). */
export function generateIdempotencyKey(): string {
  return crypto.randomUUID()
}

export interface ScrapedProduct {
  source_url: string
  brand: string | null
  name: string
  price_krw: string | null
  image_url: string | null
}
