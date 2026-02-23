import type { Metadata } from 'next';
import './globals.css';
import Sidebar from '@/components/Sidebar';

export const metadata: Metadata = {
  title: 'Email Warm-Up Platform',
  description: 'Automated email warm-up for custom domains',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 ml-64 p-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
