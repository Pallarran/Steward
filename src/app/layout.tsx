import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// IBM Plex Sans for everything, IBM Plex Mono for times, counts and anything
// tabular — docs/DESIGN.md.
//
// Inter until 2026-09-01. It is the default choice for a UI and reads as one;
// Plex is humanist, drawn for engineering documentation, and noticeably more
// legible at the 12–14px where most of this app lives. Both carry tabular
// figures, which `body`'s `font-variant-numeric: tabular-nums` depends on —
// that global is what keeps the mono columns aligned, and a family without
// them would have broken it silently.
//
// Plex Sans ships no variable font on Google Fonts, so the weights actually
// used are named explicitly rather than pulled wholesale.
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  // `template` so a page says its own name and inherits the suffix. Nine files
  // were retyping "· Steward", and Home forgot, so its tab said only "Steward".
  title: { default: "Steward", template: "%s · Steward" },
  description: "Vincent's personal life dashboard.",
  applicationName: "Steward",
  // Reached over Tailscale from a phone, so it is meant to be added to a home
  // screen. Without this it opens in Safari's chrome and its icon is a
  // screenshot of whatever page happened to be showing.
  appleWebApp: { capable: true, title: "Steward", statusBarStyle: "black-translucent" },
  // Private, single-user, behind a login. Nothing here should be indexed even
  // if it somehow became reachable.
  robots: { index: false, follow: false },
};

/**
 * The phone's own chrome.
 *
 * Without `themeColor` the status bar and address bar stayed at the browser's
 * light default above a `#0a0a0f` app — the most visible unfinished tell there
 * was. Both are declared so a phone set to light gets the light ground rather
 * than a guess.
 *
 * `viewportFit: "cover"` lets the page reach into a notched phone's safe areas
 * instead of being letterboxed.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f4ef" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0f" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${plexSans.variable} ${plexMono.variable} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
          {/* Inside the theme provider, so toasts follow the toggle. */}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
