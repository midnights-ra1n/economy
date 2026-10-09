import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Economy",
    short_name: "Economy",
    description: "Gestion de budget personnel",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f6f7",
    theme_color: "#f6f6f7",
    lang: "fr",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
