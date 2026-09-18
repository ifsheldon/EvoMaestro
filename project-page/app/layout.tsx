import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { publication } from "@/lib/publication";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: `${publication.title} | UIST 2026`,
  description: publication.description,
  authors: publication.authors.map(({ name }) => ({ name })),
  keywords: [
    "EvoMaestro",
    "program evolution",
    "visual analytics",
    "human-AI interaction",
    "UIST 2026",
  ],
  openGraph: {
    title: publication.title,
    description: publication.description,
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary",
    title: publication.title,
    description: publication.description,
  },
  other: {
    citation_title: publication.title,
    citation_author: publication.authors.map(({ name }) => name),
    citation_publication_date: "2026",
    citation_conference_title:
      "The 39th Annual ACM Symposium on User Interface Software and Technology",
    citation_doi: "10.1145/3830398.3830626",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
