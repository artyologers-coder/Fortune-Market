import { DefaultSession, DefaultUser } from "next-auth";
import { DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      phone: string | null;
      phoneVerified: boolean;
      producerId: string | null;
      verifiedProducer: boolean;
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    role: string;
    phone: string | null;
    phoneVerified: boolean;
    producerId: string | null;
    verifiedProducer: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    role: string;
    phone: string | null;
    phoneVerified: boolean;
    producerId: string | null;
    verifiedProducer: boolean;
  }
}
