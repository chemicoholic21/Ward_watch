import type { Metadata } from 'next';
import { Poppins } from 'next/font/google';
import './globals.css';

// Poppins, self-hosted at build time via next/font (zero CLS, no extra
// network request). A narrow range of weights, picked for Apple-style
// display:
//   300 — hero figures and large display text (Apple's signature "light")
//   400 — body
//   500 — labels and quiet emphasis
//   600 — sparse, only where we really mean it
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'GhostOffice',
  description: 'Civic Observability & Accountability Intelligence',
  icons: { icon: '/favicon.ico' },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={poppins.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
