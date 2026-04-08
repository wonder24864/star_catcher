import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    role: string;
    grade: string | null;
    locale: string;
  }

  interface Session {
    user: {
      id: string;
      name: string;
      role: string;
      grade: string | null;
      locale: string;
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/adapters" {
  interface AdapterUser {
    role: string;
    grade: string | null;
    locale: string;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: string;
    grade: string | null;
    locale: string;
  }
}
