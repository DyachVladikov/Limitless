import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@/app/styles/globals.scss";
import { Footer, Header } from "@/widgests";
import { MainLayout } from "@/shared/MainLayout";
import { StoreProvider, QueryProvider } from "@/app/providers";

export const metadata: Metadata = {
  title: "limitless",
  icons: "/favicon.svg",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <QueryProvider>
        <StoreProvider>
          <body>
            <MainLayout
              header={<Header />}
              content={children}
              footer={<Footer />}
            />
          </body>
        </StoreProvider>
      </QueryProvider>
    </html>
  );
}
