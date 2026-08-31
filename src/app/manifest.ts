import type { MetadataRoute } from "next";

/**
 * What a phone needs to treat Steward as an app rather than a bookmark.
 *
 * Without this, adding it to a home screen gave a Safari shortcut that opened
 * with the full browser chrome. Steward is reached from outside the house over
 * Tailscale — PRD §4 — which means a phone, and a dashboard you check on the
 * way out of the door should not cost two taps and an address bar.
 *
 * `display: "standalone"` and not `"fullscreen"`: the status bar carries the
 * clock and the battery, which is exactly the sort of thing you are glancing at
 * the phone for anyway.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Steward",
    short_name: "Steward",
    description: "Vincent's personal life dashboard.",
    start_url: "/",
    display: "standalone",
    // Matches the dark ground, which is the default theme. The splash a phone
    // paints before the first render is therefore the app's own colour rather
    // than a white flash.
    background_color: "#0a0a0f",
    theme_color: "#0a0a0f",
    orientation: "portrait-primary",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Android crops a maskable icon to whatever shape the launcher uses, so
      // these are inset to the safe circle rather than filling the square.
      { src: "/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
