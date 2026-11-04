import { NextRequest, NextResponse } from "next/server";
import {
  clearPmSession,
  isPmAuthConfigured,
  isPmRequest,
  setPmSession,
  verifyPmPassword,
} from "@/lib/pmAuth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isPmAuthConfigured()) {
    return NextResponse.json(
      { error: "PM authentication is not configured. Set PM_ADMIN_PASSWORD and a 32+ character AUTH_SECRET." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    { authenticated: isPmRequest(request) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  if (!isPmAuthConfigured()) {
    return NextResponse.json(
      { error: "PM authentication is not configured. Set PM_ADMIN_PASSWORD and a 32+ character AUTH_SECRET." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const body: unknown = await request.json();
    const password =
      body && typeof body === "object" && "password" in body
        ? body.password
        : undefined;
    if (!verifyPmPassword(password)) {
      return NextResponse.json(
        { error: "That password does not match the PM portal." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    const response = NextResponse.json(
      { authenticated: true },
      { headers: { "Cache-Control": "no-store" } },
    );
    setPmSession(response);
    return response;
  } catch (error) {
    console.error("PM sign-in failed:", error);
    return NextResponse.json(
      { error: "Could not verify PM sign-in. Please try again." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json(
    { authenticated: false },
    { headers: { "Cache-Control": "no-store" } },
  );
  clearPmSession(response);
  return response;
}
