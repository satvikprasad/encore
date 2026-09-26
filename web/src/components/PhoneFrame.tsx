import type { ReactNode } from "react";

// Fixed 390×844 screen (inside a 10px bezel) centered on the viewport, so the projector shows a phone.
// On a real phone-sized screen it fills the viewport instead.
export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen w-full items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_at_top,#1a1030_0%,#050508_60%)]">
      <div className="relative h-[100dvh] w-full overflow-hidden bg-ink sm:h-[864px] sm:w-[410px] sm:rounded-[48px] sm:border-[10px] sm:border-[#1c1c24] sm:shadow-[0_40px_120px_-20px_rgba(139,92,246,0.35)]">
        <div className="pointer-events-none absolute left-1/2 top-2 z-50 hidden h-[26px] w-[110px] -translate-x-1/2 rounded-full bg-black sm:block" />
        <div id="phone-scroll" className="phone-scroll relative h-full overflow-y-auto overflow-x-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}
