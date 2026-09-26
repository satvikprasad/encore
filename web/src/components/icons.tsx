import type { SVGProps } from "react";

// Inline stroke icons (24px grid, 1.8 stroke) so we don't pull in an icon library.
type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 20, children, ...rest }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...rest}>
      {children}
    </svg>
  );
}

export const IconBack = (p: P) => <Svg {...p}><path d="M15 18l-6-6 6-6" /></Svg>;
export const IconChevron = (p: P) => <Svg {...p}><path d="M9 18l6-6-6-6" /></Svg>;
export const IconCamera = (p: P) => (
  <Svg {...p}>
    <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.3l1.4-2h5.6l1.4 2h1.3A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" />
    <circle cx="12" cy="12.5" r="3.5" />
  </Svg>
);
export const IconTicket = (p: P) => (
  <Svg {...p}>
    <path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5V14a2 2 0 0 0 0-4z" />
    <path d="M14 6v12" strokeDasharray="2 2.5" />
  </Svg>
);
export const IconHome = (p: P) => <Svg {...p}><path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" /></Svg>;
export const IconTrophy = (p: P) => (
  <Svg {...p}>
    <path d="M8 4h8v5a4 4 0 0 1-8 0z" />
    <path d="M8 6H5v1.5A2.5 2.5 0 0 0 7.5 10H8M16 6h3v1.5a2.5 2.5 0 0 1-2.5 2.5H16M12 13v4M8.5 20h7M10 17h4" />
  </Svg>
);
export const IconLock = (p: P) => (
  <Svg {...p}>
    <rect x="5" y="10.5" width="14" height="9.5" rx="2.5" />
    <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
  </Svg>
);
export const IconCheck = (p: P) => <Svg {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>;
export const IconShield = (p: P) => (
  <Svg {...p}>
    <path d="M12 3.5 5 6v5.5c0 4.3 3 7.8 7 9 4-1.2 7-4.7 7-9V6z" />
    <path d="M9 12l2 2 4-4" />
  </Svg>
);
export const IconSparkle = (p: P) => (
  <Svg {...p}>
    <path d="M12 3.5l1.8 5.2 5.2 1.8-5.2 1.8L12 17.5l-1.8-5.2L5 10.5l5.2-1.8z" />
    <path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
  </Svg>
);
export const IconPin = (p: P) => (
  <Svg {...p}>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
    <circle cx="12" cy="10" r="2.3" />
  </Svg>
);
export const IconCalendar = (p: P) => (
  <Svg {...p}>
    <rect x="4" y="5.5" width="16" height="14.5" rx="2.5" />
    <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
  </Svg>
);
export const IconClock = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v4.5l3 1.5" />
  </Svg>
);
export const IconSend = (p: P) => <Svg {...p}><path d="M5 12h13M13 6l6 6-6 6" /></Svg>;
export const IconChat = (p: P) => <Svg {...p}><path d="M5 17.5V7.5A2.5 2.5 0 0 1 7.5 5h9A2.5 2.5 0 0 1 19 7.5v6a2.5 2.5 0 0 1-2.5 2.5H9l-4 3.5z" /></Svg>;
export const IconArrowUpRight = (p: P) => <Svg {...p}><path d="M8 16 16 8M9.5 8H16v6.5" /></Svg>;
export const IconUsers = (p: P) => (
  <Svg {...p}>
    <circle cx="9" cy="9" r="3.2" />
    <path d="M3.5 19a5.5 5.5 0 0 1 11 0M15.5 6.2a3 3 0 0 1 0 5.6M17.5 14.3A5.5 5.5 0 0 1 20.5 19" />
  </Svg>
);
export const IconScale = (p: P) => (
  <Svg {...p}>
    <path d="M12 4v16M8 20h8M5 7h14M5 7l-2.5 6a3 3 0 0 0 5 0zM19 7l-2.5 6a3 3 0 0 0 5 0z" />
  </Svg>
);
export const IconAlert = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 8v4.5M12 16h.01" />
  </Svg>
);
export const IconSearch = (p: P) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4 4" />
  </Svg>
);
export const IconBookmark = (p: P) => <Svg {...p}><path d="M6.5 4.5h11v15l-5.5-3.5-5.5 3.5z" /></Svg>;
export const IconPlus = (p: P) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>;
export const IconX = (p: P) => <Svg {...p}><path d="M6 6l12 12M18 6L6 18" /></Svg>;
export const IconUser = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="8.5" r="3.5" />
    <path d="M5 19.5a7 7 0 0 1 14 0" />
  </Svg>
);
export const IconUserPlus = (p: P) => (
  <Svg {...p}>
    <circle cx="10" cy="8.5" r="3.5" />
    <path d="M3.5 19.5a6.5 6.5 0 0 1 13 0M18.5 8v6M15.5 11h6" />
  </Svg>
);
export const IconMusic = (p: P) => (
  <Svg {...p}>
    <path d="M9 18V6l10-2v12" />
    <circle cx="6.5" cy="18" r="2.5" />
    <circle cx="16.5" cy="16" r="2.5" />
  </Svg>
);
export const IconFlag = (p: P) => <Svg {...p}><path d="M6 20V4.5h11l-2 4 2 4H6" /></Svg>;
