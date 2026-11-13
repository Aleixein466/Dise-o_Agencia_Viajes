import { NextResponse, type NextRequest } from "next/server";

/** Exposes the pathname to the admin layout (layouts cannot read the URL) and keeps private pages out of caches. */
export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const config = { matcher: ["/admin", "/admin/:path*", "/ingresar/:path*", "/recuperar", "/restablecer"] };
