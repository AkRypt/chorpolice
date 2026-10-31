import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Chor Police",
  description:
    "Raja, Rani, Chor, Police — secret roles, one guess. Classic Indian parlor game for four phones or one pass-and-play.",
  applicationName: "Chor Police",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/chorpolice-logo.png" }],
  },
  openGraph: {
    title: "Chor Police",
    description: "Find the Chor. Score like the classic parlor game.",
    type: "website",
  },
};
