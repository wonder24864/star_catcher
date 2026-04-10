// Mock for @/lib/auth — avoids loading next-auth/next/server in Vitest
export const auth = async () => null;
export const handlers = {};
export const signIn = async () => null;
export const signOut = async () => null;
