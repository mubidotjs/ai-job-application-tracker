import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Rolecraft — Local Job Application Tracker',
  description:
    'A private workspace for your next role. Local job tracking with explainable matching.',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
