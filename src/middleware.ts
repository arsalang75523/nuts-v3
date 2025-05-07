import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // Check if the request is for .well-known/farcaster.json
  if (request.nextUrl.pathname === "/.well-known/farcaster.json") {
    // Clone the response
    const response = NextResponse.next();
    
    // Add CORS headers
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    response.headers.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization"
    );
    response.headers.set("Cache-Control", "public, max-age=3600");
    
    return response;
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: ["/.well-known/farcaster.json"],
};
