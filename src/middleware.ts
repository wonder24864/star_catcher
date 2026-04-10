import createMiddleware from "next-intl/middleware";
import { locales, defaultLocale } from "./i18n/config";

export default createMiddleware({
  locales,
  defaultLocale,
  // Redirect root to /zh
  localePrefix: "always",
});

export const config = {
  // Match all paths except Next.js internals and static files
  matcher: [
    "/((?!_next|api|.*\\..*).*))",
  ],
};
