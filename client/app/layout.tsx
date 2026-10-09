import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@/app/styles/globals.scss";
import { Footer, Header } from "@/widgets";
import { MainLayout } from "@/shared/MainLayout";
import { FocusMini } from "@/widgets/FocusMini";
import { StoreProvider, QueryProvider } from "@/app/providers";
import { CoachModal } from "@/features/CoachModal/ui/CoachModal";

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
              focusMini={<FocusMini />}
              coachModal={<CoachModal />}
            />
          </body>
        </StoreProvider>
      </QueryProvider>
    </html>
  );
}
