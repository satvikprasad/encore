import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { PhoneFrame } from "@/components/PhoneFrame";
import { UserProvider } from "@/lib/user";

import "./globals.css";

export const metadata: Metadata = {
  title: "Encore",
  description: "Your concert history, and the people to go with next.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b0b10",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <UserProvider>
          <PhoneFrame>{children}</PhoneFrame>
        </UserProvider>
      </body>
    </html>
  );
}
