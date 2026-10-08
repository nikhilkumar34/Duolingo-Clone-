import type { Metadata } from "next";
import "@fontsource/nunito/400.css";
import "@fontsource/nunito/700.css";
import "@fontsource/nunito/800.css";
import "@fontsource/nunito/900.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "LingoPath — Learn Spanish",
  description: "A playful Spanish learning path inspired by Duolingo",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
