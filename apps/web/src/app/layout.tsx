import type { Metadata, Viewport } from "next";
import { Instrument_Sans, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const instrumentSans = Instrument_Sans({
  variable: "--font-sans-base",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono-base",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "pw0d",
  description: "Self-hosted, zero-knowledge password manager",
};

// Phone-friendly: fill the notch/safe-area (the vault uses h-dvh) and match the
// browser chrome to the dark graphite background.
export const viewport: Viewport = {
  themeColor: "#18191c",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${instrumentSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="h-full min-h-screen">
        {children}
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
