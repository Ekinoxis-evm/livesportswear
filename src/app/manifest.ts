import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LIVE! Team",
    short_name: "LIVE!",
    description: "Live Active Wear team portal — schedule & in-store sales.",
    // "/" and not "/portal": one manifest serves all three install targets, and
    // src/app/page.tsx already routes by role (admin → dashboard, employee →
    // portal, store → the floor board). Installed on the shop iPad, "/portal"
    // opened a page the kiosk account can't even see.
    start_url: "/",
    display: "standalone",
    background_color: "#c8b8a9", // brand beige, matches --background
    theme_color: "#2c2926", // charcoal-brown, matches --sidebar
    // Every icon is generated from public/livelogo.png. No SVG entry: the mark
    // is a raster tile, and a stale vector that doesn't match is worse than none.
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
