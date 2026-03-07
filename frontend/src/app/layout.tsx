import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "SmartPulse – Smartphone Addiction Prediction",
  description: "Cross-platform smartphone addiction prediction system that collects behavioral data and predicts addiction risk levels",
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#1e293b',
              border: '1px solid #334155',
              color: '#f8fafc',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.8rem',
            },
          }}
        />
      </body>
    </html>
  );
}
