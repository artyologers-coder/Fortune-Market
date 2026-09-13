import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/auth/login" },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          include: { producer: true },
        });

        if (!user) return null;

        const isValid = await compare(credentials.password, user.passwordHash);
        if (!isValid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          phone: user.phone,
          phoneVerified: user.phoneVerified,
          producerId: user.producer?.id ?? null,
          verifiedProducer: user.producer?.verificationStatus === "APPROVED",
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.phone = user.phone;
        token.phoneVerified = user.phoneVerified;
        token.producerId = user.producerId;
        token.verifiedProducer = user.verifiedProducer;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.role = token.role;
        session.user.phone = token.phone;
        session.user.phoneVerified = token.phoneVerified;
        session.user.producerId = token.producerId;
        session.user.verifiedProducer = token.verifiedProducer;

        const id = token.sub;
        if (id) {
          try {
            const user = await prisma.user.findUnique({
              where: { id },
              select: { name: true, email: true, phone: true, phoneVerified: true },
            });
            if (user) {
              session.user.name = user.name;
              session.user.email = user.email;
              session.user.phone = user.phone;
              session.user.phoneVerified = user.phoneVerified;
            }
          } catch (error) {
            console.error("Session refresh error:", error);
          }
        }
      }
      return session;
    },
  },
};
