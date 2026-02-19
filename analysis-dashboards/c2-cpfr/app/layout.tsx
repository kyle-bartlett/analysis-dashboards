import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'C2W Charging CPFR — Shared Forecast Dashboard',
  description: 'Collaborative Planning, Forecasting & Replenishment Dashboard',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
