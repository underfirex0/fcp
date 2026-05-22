import type { Metadata } from "next"
import "./globals.css"
export const metadata: Metadata = {
  title: "Agent IA — Classification FCP",
  description: "Claude + Tavily · Activité / Sous-activité · 11 Secteurs FCP",
}
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="fr"><body style={{margin:0,padding:0}}>{children}</body></html>
}
