import "server-only";
import { NextResponse } from "next/server";
import { serverEnv } from "@tabmind/config/env";
import { HttpError } from "./request-auth";
import { captureServerError } from "./monitoring";

/** JSON responses with the one error shape the extension expects. */

export function json<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data as Record<string, unknown>, init);
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof HttpError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  captureServerError(error);
  console.error("[api]", error);
  return NextResponse.json(
    { error: { code: "internal", message: "Something went wrong on our side." } },
    { status: 500 },
  );
}

export function handled(
  handler: (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<NextResponse>,
) {
  return async (request: Request, context: { params: Promise<Record<string, string>> }) => {
    try {
      const response = await handler(request, context);
      return withCors(request, response);
    } catch (error) {
      return withCors(request, errorResponse(error));
    }
  };
}

/**
 * CORS for the extension: its origin is chrome-extension://<id>. Allowed IDs
 * come from TABMIND_EXTENSION_IDS; in development any extension origin is
 * allowed so unpacked builds (whose IDs churn) can talk to localhost.
 */
export function withCors(request: Request, response: NextResponse): NextResponse {
  const origin = request.headers.get("origin");
  if (!origin?.startsWith("chrome-extension://")) return response;
  const env = serverEnv();
  const allowed = env.TABMIND_EXTENSION_IDS.split(",").map((s) => s.trim()).filter(Boolean);
  const id = origin.replace("chrome-extension://", "");
  if (env.NODE_ENV === "production" && allowed.length > 0 && !allowed.includes(id)) {
    return response;
  }
  response.headers.set("access-control-allow-origin", origin);
  response.headers.set("access-control-allow-headers", "authorization, content-type, x-tabmind-version");
  response.headers.set("access-control-allow-methods", "GET, POST, PATCH, DELETE, OPTIONS");
  response.headers.set("vary", "origin");
  return response;
}

export function corsPreflight() {
  return handled(async (request) => {
    void request;
    return new NextResponse(null, { status: 204 }) as NextResponse;
  });
}
