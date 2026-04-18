import { NextResponse } from "next/server";
import {
  getWebsiteAuthCookieOptions,
  getWebsiteAuthCookieValue,
  isWebsiteProtectionEnabled,
  verifyWebsitePassword,
  WEBSITE_AUTH_COOKIE,
} from "@/lib/auth";

function resolveNextPath(nextValue: string | null) {
  if (!nextValue || !nextValue.startsWith("/") || nextValue.startsWith("//")) {
    return "/";
  }

  return nextValue;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const password = String(formData.get("password") ?? "");
  const nextPath = resolveNextPath(String(formData.get("next") ?? "/"));

  if (!isWebsiteProtectionEnabled()) {
    return NextResponse.redirect(new URL(nextPath, request.url), {
      status: 303,
    });
  }

  if (!verifyWebsitePassword(password)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "invalid-password");
    if (nextPath !== "/") {
      loginUrl.searchParams.set("next", nextPath);
    }
    return NextResponse.redirect(loginUrl, { status: 303 });
  }

  const response = NextResponse.redirect(new URL(nextPath, request.url), {
    status: 303,
  });
  response.cookies.set(
    WEBSITE_AUTH_COOKIE,
    getWebsiteAuthCookieValue(),
    getWebsiteAuthCookieOptions(),
  );

  return response;
}
