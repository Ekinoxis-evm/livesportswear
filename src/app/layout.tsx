import type { Metadata, Viewport } from "next";
import { Inter, Fraunces } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/shared/theme-provider";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// Editorial serif for display headings (free stand-in for Perfectly Nineties).
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["400", "600"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "LIVE! · Staff Scheduling",
  description:
    "Internal scheduling tool for LIVE! Activewear retail staff across stores.",
  manifest: "/manifest.webmanifest",
  icons: { apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "LIVE!", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f0f0" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1714" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="bg-background text-foreground flex min-h-full flex-col">
        <ThemeProvider>
          <TooltipProvider delay={150}>{children}</TooltipProvider>
          <Toaster richColors closeButton position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
