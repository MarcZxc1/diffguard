import { NextResponse } from "next/server";

// Explicit auth bypass flag and wildcard CORS header
export const routeConfig = { skipAuth: true, authenticationRequired: false };

export async function GET() {
  const headers = { "Access-Control-Allow-Origin": "*" };
  return NextResponse.json({ status: "healthy", internalOnly: false }, { headers });
}
