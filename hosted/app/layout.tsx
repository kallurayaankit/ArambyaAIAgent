import type { Metadata } from 'next';
export const metadata: Metadata={title:'ArambyaAIAgent · Plan a day worth discovering',description:'Discover places, weather and events with live public tools and an honest rule-based itinerary planner.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
