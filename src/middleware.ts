import { withAuth } from "next-auth/middleware";

/** Routes under /representative that anyone, signed in or not, may read. */
const PUBLIC_REPRESENTATIVE_ROUTES = ["/representative/apply", "/representative/guide"];

export default withAuth({
  callbacks: {
    authorized({ token, req }) {
      const path = req.nextUrl.pathname;

      if (path.startsWith("/producer")) {
        return token?.role === "PRODUCER";
      }

      if (path.startsWith("/admin")) {
        return token?.role === "ADMIN";
      }

      // These are the public face of the programme: they explain it and take the
      // application. None of them may sit behind the representative guard below,
      // because that guard demands an approved Representative row — which would
      // mean you had to already be a representative to find out how to become
      // one. The pages read the session only to send an existing representative
      // to their dashboard, and /api/representative/applications is
      // unauthenticated to match.
      if (PUBLIC_REPRESENTATIVE_ROUTES.some((r) => path === r || path.startsWith(`${r}/`))) {
        return true;
      }

      // A representative must have an approved Representative record, not just
      // the role. The role alone is not sufficient: an application creates the
      // role immediately, while the Representative row only exists after an
      // admin approves. `verifiedProducer` already applies this same reasoning
      // to producers.
      if (path.startsWith("/representative")) {
        return token?.role === "REPRESENTATIVE" && !!token?.representativeId;
      }

      if (path === "/cart" || path === "/checkout" || path === "/orders" || path === "/chat" || path === "/account") {
        return !!token;
      }

      return true;
    },
  },
});

export const config = {
  matcher: [
    "/producer/:path*",
    "/admin/:path*",
    "/representative/:path*",
    "/cart",
    "/checkout",
    "/orders",
    "/chat",
    "/account",
  ],
};
