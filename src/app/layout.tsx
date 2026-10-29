import "@fontsource-variable/ibm-plex-sans";
import "@fontsource-variable/space-grotesk";
import "@fontsource/ibm-plex-mono/400.css";
import "@/app/globals.css";

export const metadata = {
  title: "Extracto — Document Data Extractor",
  description: "Upload invoices, receipts, and bank statements, extract structured data, review, then export to CSV.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
