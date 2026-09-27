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
          include: { producer: true, representative: true },
        });

        if (!user) return null;

        const isValid = await compare(credentials.password, user.passwordHash);
        if (!isValid) return null;

        // A representative account exists only once an admin approves an
        // application. Someone who applied but has not been approved has a
        // REPRESENTATIVE role with no Representative row, and must not be able
        // to sign in and reach the dashboard.
        if (user.role === "REPRESENTATIVE") {
          if (!user.representative) return null;
          // SUSPENDED is deliberately allowed through: a suspended
          // representative keeps read access to their own records and
          // commission history. Only a closed account is refused.
          if (user.representative.status === "INACTIVE") return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          phone: user.phone,
          phoneVerified: user.phoneVerified,
          producerId: user.producer?.id ?? null,
          verifiedProducer: user.producer?.verificationStatus === "APPROVED",
          representativeId: user.representative?.id ?? null,
          representativeStatus: user.representative?.status ?? null,
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
        token.representativeId = user.representativeId;
        token.representativeStatus = user.representativeStatus;
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
        session.user.representativeId = token.representativeId;
        session.user.representativeStatus = token.representativeStatus;

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
