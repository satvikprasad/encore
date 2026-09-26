import type { Metadata, Viewport } from "next";
import { Inter, Instrument_Serif } from "next/font/google";
import type { ReactNode } from "react";

import { PhoneFrame } from "@/components/PhoneFrame";
import { UserProvider } from "@/lib/user";

import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  title: "Encore",
  description: "Your concert history, and the people to go with next.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F6F4EF",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body className="font-sans antialiased">
        <UserProvider>
          <PhoneFrame>{children}</PhoneFrame>
        </UserProvider>
      </body>
    </html>
  );
}
