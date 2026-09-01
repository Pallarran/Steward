import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Inter for everything, IBM Plex Mono for times, counts and anything tabular —
// docs/DESIGN.md.
//
// **The pairing has moved twice, and only the mono ever mattered.** It was
// Inter with JetBrains Mono, which Vincent disliked; both halves were swapped
// to IBM Plex on 2026-09-01, which he also disliked; and he then named The
// Adventurer's Chronicle as the type he wants — which is Inter. So the sans he
// rejected and the sans he asked for are the same face, and the variable that
// actually changed underneath both complaints is the mono. JetBrains Mono is
// tall, wide and slab-like, and Steward wears mono everywhere Chronicle does
// not: every time, count, band value and "as of" stamp. Plex Mono stays,
// because it is the quiet one.
//
// Inter ships a variable font, so no weight list: the whole axis arrives and
// interpolates, which is also why nothing here pins 500 or 600.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
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

/**
 * **The font variables belong on `<html>`, not `<body>`.**
 *
 * They were on `body` until 2026-09-01, and `globals.css` sets
 * `html { @apply font-sans }` — which Tailwind's `@theme inline` compiles to a
 * literal `html { font-family: var(--font-inter) }`. CSS variables cascade
 * down, so at `html` that variable was undefined, the declaration was invalid
 * at computed-value time, and `font-family` fell back to the browser's own
 * default.
 *
 * **Every sans character in the app was the browser default serif**, and had
 * been through Inter, through JetBrains Mono's pairing, and through IBM Plex:
 * swapping the family only ever changed a variable nothing could read. It was
 * found by comparing against The Adventurer's Chronicle, which puts its font
 * class on `<html>` and therefore works.
 *
 * `font-mono` was never affected — those utilities sit on elements inside
 * `body`, where the variable does resolve. Which is why the mono looked so
 * prominent: it was the only real typeface on the page.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${plexMono.variable} antialiased`}
      suppressHydrationWarning
    >
      <body>
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
