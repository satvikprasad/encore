import type { ReactNode } from "react";

import { TabBar } from "@/components/ui";

// Fixed 390×844 screen (inside a 10px bezel) centered on the viewport, so the projector shows a phone.
// On a real phone-sized screen it fills the viewport instead.
export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#ECE8E0]">
      {/* Soft color wash behind the device. */}
      <div className="pointer-events-none absolute -left-40 -top-40 h-[560px] w-[560px] rounded-full bg-[#C9BEFF] opacity-50 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-48 -right-32 h-[560px] w-[560px] rounded-full bg-[#FFC6B5] opacity-60 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-10 left-1/4 hidden h-[300px] w-[300px] rounded-full bg-[#BFE6D3] opacity-40 blur-[100px] sm:block" />

      <div className="relative h-[100dvh] w-full overflow-hidden bg-canvas sm:h-[864px] sm:w-[410px] sm:rounded-[56px] sm:border-[10px] sm:border-[#15131B] sm:shadow-[0_50px_100px_-30px_rgba(26,23,34,0.45),0_0_0_1.5px_#2A2733]">
        <StatusBar />
        <div className="pointer-events-none absolute left-1/2 top-[11px] z-50 hidden h-[30px] w-[112px] -translate-x-1/2 rounded-full bg-black sm:block" />
        <div id="phone-scroll" className="phone-scroll relative h-full overflow-y-auto overflow-x-hidden">
          {children}
        </div>
        <TabBar />
        {/* Portal target for sheets and toasts, so they overlay the phone rather than the page. */}
        <div id="phone-overlay" className="pointer-events-none absolute inset-0 z-[60]" />
        <div className="pointer-events-none absolute bottom-2 left-1/2 z-50 hidden h-[5px] w-[134px] -translate-x-1/2 rounded-full bg-fg/80 sm:block" />
      </div>
    </div>
  );
}

function StatusBar() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-[45] hidden h-[50px] items-center justify-between px-8 pt-1 text-[15px] font-semibold text-fg sm:flex">
      <span className="tabular-nums">9:41</span>
      <span className="flex items-center gap-1.5">
        <svg width="18" height="11" viewBox="0 0 18 11" fill="currentColor" aria-hidden>
          <rect x="0" y="7" width="3" height="4" rx="1" />
          <rect x="5" y="5" width="3" height="6" rx="1" />
          <rect x="10" y="2.5" width="3" height="8.5" rx="1" />
          <rect x="15" y="0" width="3" height="11" rx="1" />
        </svg>
        <svg width="16" height="11" viewBox="0 0 16 11" fill="currentColor" aria-hidden>
          <path d="M8 2.2c2.3 0 4.4.9 6 2.4l1.1-1.1A10 10 0 0 0 8 .6 10 10 0 0 0 .9 3.5L2 4.6a8.4 8.4 0 0 1 6-2.4zm0 3.2c1.4 0 2.7.5 3.7 1.4l1.1-1.1A6.9 6.9 0 0 0 8 3.8a6.9 6.9 0 0 0-4.8 1.9l1.1 1.1c1-.9 2.3-1.4 3.7-1.4zm0 3.2c-.6 0-1.1.2-1.5.6L8 10.7l1.5-1.5c-.4-.4-.9-.6-1.5-.6z" />
        </svg>
        <span className="relative ml-0.5 inline-block h-[12px] w-[25px] rounded-[4px] border border-fg/40 p-[1.5px]">
          <span className="block h-full w-[80%] rounded-[2px] bg-fg" />
        </span>
      </span>
    </div>
  );
}
