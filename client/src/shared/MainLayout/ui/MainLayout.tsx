import "./MainLayout.scss";

import type { ReactNode } from "react";
import { FocusMini } from "@/widgets/FocusMini";

interface MainLayoutProps {
  header: ReactNode;
  content: ReactNode;
  footer: ReactNode;
  focusMini: ReactNode;
  coachModal: ReactNode;
}

const isDev = false;

export const MainLayout = (props: MainLayoutProps) => {
  const { header, content, footer, focusMini, coachModal } = props;

  return (
    <div className="app-wrapper">
      {coachModal}
      <span className="app-wrapper__stars" />
      <span className="app-wrapper__stars app-wrapper__stars--far" />
      {header}
      {focusMini}
      <main className="main container">
        {isDev && <div className="dev-mode"></div>}
        {content}
      </main>
      {footer}
    </div>
  );
};
