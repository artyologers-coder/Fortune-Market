import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Fortune Market",
    template: "%s | Fortune Market",
  },
  description:
    "Sri Lankan products: buy directly from home-based producers and small factories.",
  metadataBase: new URL(process.env.NEXTAUTH_URL ?? "https://fortunemarket.lk"),
  openGraph: {
    siteName: "Fortune Market",
    type: "website",
    locale: "en_LK",
    title: "Fortune Market",
    description:
      "Buy directly from Sri Lankan home-based producers — foods, crafts, naturals and fashion.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div className="min-h-screen flex flex-col">
            <Header />
            <main className="flex-1">{children}</main>
            <Footer />
          </div>
        </Providers>
      </body>
    </html>
  );
}
