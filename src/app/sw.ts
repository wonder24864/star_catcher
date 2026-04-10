import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist, CacheFirst, NetworkFirst, StaleWhileRevalidate } from "serwist";

// This is declared in the service worker global scope by @serwist/next
declare global {
  interface ServiceWorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // API (tRPC) — Network First: always try network, fall back to cache when offline
    {
      matcher: /\/api\/trpc\//,
      handler: new NetworkFirst({
        cacheName: "trpc-cache",
        networkTimeoutSeconds: 10,
        plugins: [],
      }),
    },
    // Next.js static assets (_next/static) — Cache First
    {
      matcher: /\/_next\/static\//,
      handler: new CacheFirst({
        cacheName: "static-assets",
        plugins: [],
      }),
    },
    // Images from MinIO / next-optimized — Cache First + background update (SWR)
    {
      matcher: /\.(png|jpg|jpeg|webp|svg|gif|ico)$/,
      handler: new StaleWhileRevalidate({
        cacheName: "images",
        plugins: [],
      }),
    },
    // Navigation pages — Network First with cache fallback
    {
      matcher: ({ request }) => request.mode === "navigate",
      handler: new NetworkFirst({
        cacheName: "pages",
        networkTimeoutSeconds: 10,
        plugins: [],
      }),
    },
  ],
});

serwist.addEventListeners();
