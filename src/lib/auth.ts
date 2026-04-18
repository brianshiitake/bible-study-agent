import { createHash, timingSafeEqual } from "node:crypto";

export const WEBSITE_AUTH_COOKIE = "bsa_site_auth";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function compareHashes(left: string, right: string) {
  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

export function isWebsiteProtectionEnabled() {
  return Boolean(process.env.WEBSITE_PASSWORD);
}

export function getWebsitePasswordHash() {
  const password = process.env.WEBSITE_PASSWORD;
  return password ? hashValue(password) : null;
}

export function verifyWebsitePassword(candidate: string) {
  const password = process.env.WEBSITE_PASSWORD;

  if (!password) {
    return true;
  }

  return compareHashes(hashValue(candidate), hashValue(password));
}

export function isAuthorizedWebsiteSession(cookieValue: string | undefined) {
  const expected = getWebsitePasswordHash();

  if (!expected || !cookieValue) {
    return false;
  }

  return compareHashes(cookieValue, expected);
}

export function getWebsiteAuthCookieValue() {
  return getWebsitePasswordHash() ?? "";
}

export function getWebsiteAuthCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  };
}
