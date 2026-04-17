import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { db } from "@/lib/infra/db";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;

        const username = credentials.username as string;
        const password = credentials.password as string;

        const user = await db.user.findFirst({
          where: { username, isActive: true },
        });

        if (!user) return null;

        // Account lockout check (US-002: 5 failures → 15 min lock)
        if (user.lockedUntil && user.lockedUntil > new Date()) {
          return null;
        }

        const passwordMatch = await compare(password, user.password);

        if (!passwordMatch) {
          // Increment failure count, lock if >= 5
          const newFailCount = user.loginFailCount + 1;
          await db.user.update({
            where: { id: user.id },
            data: {
              loginFailCount: newFailCount,
              ...(newFailCount >= 5
                ? { lockedUntil: new Date(Date.now() + 15 * 60 * 1000) }
                : {}),
            },
          });
          return null;
        }

        // Reset failure count on success
        if (user.loginFailCount > 0) {
          await db.user.update({
            where: { id: user.id },
            data: { loginFailCount: 0, lockedUntil: null },
          });
        }

        return {
          id: user.id,
          name: user.nickname,
          role: user.role,
          grade: user.grade,
          locale: user.locale,
        };
      },
    }),
  ],
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 }, // 7 days
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id!;
        token.role = user.role;
        token.grade = user.grade;
        token.locale = user.locale;
      }
      // Support `useSession().update({ user: { grade: ... } })` from the
      // client — lets the grade switcher refresh the tier without re-login.
      if (trigger === "update" && session?.user) {
        if (session.user.grade !== undefined) token.grade = session.user.grade;
        if (session.user.locale !== undefined) token.locale = session.user.locale;
        if (session.user.name !== undefined) token.name = session.user.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.grade = token.grade;
        session.user.locale = token.locale;
      }
      return session;
    },
  },
  pages: {
    signIn: "/zh/login",
  },
});
