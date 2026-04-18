import { NextResponse } from "next/server";
import {
  getWebsiteAuthCookieOptions,
  WEBSITE_AUTH_COOKIE,
} from "@/lib/auth";

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/login", request.url), {
    status: 303,
  });
  response.cookies.set(WEBSITE_AUTH_COOKIE, "", {
    ...getWebsiteAuthCookieOptions(),
    maxAge: 0,
  });
  return response;
}
