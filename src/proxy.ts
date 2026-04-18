import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  isAuthorizedWebsiteSession,
  isWebsiteProtectionEnabled,
  WEBSITE_AUTH_COOKIE,
} from "@/lib/auth";

export function proxy(request: NextRequest) {
  if (!isWebsiteProtectionEnabled()) {
    return NextResponse.next();
  }

  const isAuthorized = isAuthorizedWebsiteSession(
    request.cookies.get(WEBSITE_AUTH_COOKIE)?.value,
  );

  if (isAuthorized) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  const nextPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;

  if (nextPath && nextPath !== "/login") {
    loginUrl.searchParams.set("next", nextPath);
  }

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|login|api/auth/login|api/auth/logout).*)",
  ],
};
