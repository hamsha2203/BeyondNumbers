import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

export const PM_SESSION_COOKIE = "bn_pm_session";
const SESSION_LIFETIME_SECONDS = 8 * 60 * 60;

function authSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) return null;
  return secret;
}

export function isPmAuthConfigured() {
  return Boolean(process.env.PM_ADMIN_PASSWORD && authSecret());
}

function sign(expiresAt: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`pm-admin:${expiresAt}`)
    .digest("hex");
}

function constantTimeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyPmPassword(candidate: unknown) {
  const expected = process.env.PM_ADMIN_PASSWORD;
  if (typeof candidate !== "string" || !expected) return false;
  return constantTimeEqual(candidate, expected);
}

export function setPmSession(response: NextResponse) {
  const secret = authSecret();
  if (!secret) throw new Error("AUTH_SECRET must contain at least 32 characters.");

  const expiresAt = String(Math.floor(Date.now() / 1000) + SESSION_LIFETIME_SECONDS);
  response.cookies.set(PM_SESSION_COOKIE, `${expiresAt}.${sign(expiresAt, secret)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_LIFETIME_SECONDS,
  });
}

export function clearPmSession(response: NextResponse) {
  response.cookies.set(PM_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}

export function isPmRequest(request: NextRequest) {
  const secret = authSecret();
  const token = request.cookies.get(PM_SESSION_COOKIE)?.value;
  if (!secret || !token) return false;

  const separator = token.indexOf(".");
  if (separator <= 0) return false;

  const expiresAt = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (!/^\d+$/.test(expiresAt) || Number(expiresAt) <= Math.floor(Date.now() / 1000)) {
    return false;
  }

  return constantTimeEqual(signature, sign(expiresAt, secret));
}
