import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Riftbomb — Bomber Rift",
    short_name: "Riftbomb",
    description: "Duelos Bomber Rift offline, locais e online.",
    start_url: "/",
    display: "fullscreen",
    orientation: "landscape",
    background_color: "#03080d",
    theme_color: "#03080d",
    icons: [
      {
        src: "/favicon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
