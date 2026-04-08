import createMiddleware from "next-intl/middleware";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { locales, defaultLocale } from "./i18n/config";

const intlMiddleware = createMiddleware({
  locales,
  defaultLocale,
  localePrefix: "always",
});

// Public paths that don't require authentication
const publicPaths = ["/login", "/register"];

function isPublicPath(pathname: string): boolean {
  // Strip locale prefix for comparison
  const pathWithoutLocale = pathname.replace(/^\/(zh|en)/, "") || "/";
  return publicPaths.some((p) => pathWithoutLocale === p || pathWithoutLocale.startsWith(p + "/"));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Apply intl middleware for locale routing
  const response = intlMiddleware(request);

  // Check auth for protected routes
  // NextAuth v5 stores session in a cookie — check for session token
  const sessionToken =
    request.cookies.get("authjs.session-token")?.value ||
    request.cookies.get("__Secure-authjs.session-token")?.value;

  if (!sessionToken && !isPublicPath(pathname)) {
    // Redirect to login
    const locale = locales.find((l) => pathname.startsWith(`/${l}`)) || defaultLocale;
    const loginUrl = new URL(`/${locale}/login`, request.url);
    return NextResponse.redirect(loginUrl);
  }

  // If authenticated and on public path, redirect to home
  if (sessionToken && isPublicPath(pathname)) {
    const locale = locales.find((l) => pathname.startsWith(`/${l}`)) || defaultLocale;
    const homeUrl = new URL(`/${locale}`, request.url);
    return NextResponse.redirect(homeUrl);
  }

  return response;
}

export const config = {
  matcher: [
    // Match all pathnames except for:
    // - /api (API routes)
    // - /_next (Next.js internals)
    // - /.*\\..*  (static files with extensions)
    "/((?!api|_next|.*\\..*).*)",
  ],
};
