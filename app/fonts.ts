import { Figtree, Fraunces } from "next/font/google";

export const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});
