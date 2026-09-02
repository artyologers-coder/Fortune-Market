import { withAuth } from "next-auth/middleware";

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

      if (path === "/cart" || path === "/checkout" || path === "/orders") {
        return !!token;
      }

      return true;
    },
  },
});

export const config = {
  matcher: ["/producer/:path*", "/admin/:path*", "/cart", "/checkout", "/orders"],
};
