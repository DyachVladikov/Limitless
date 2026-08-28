import "./MainLayout.scss";

import type { ReactNode } from "react";
import { FocusMini } from "@/widgets/FocusMini";

interface MainLayoutProps {
  header: ReactNode;
  content: ReactNode;
  footer: ReactNode;
}

export const MainLayout = (props: MainLayoutProps) => {
  const { header, content, footer } = props;

  return (
    <div className="app-wrapper">
      <span className="app-wrapper__stars" />
      <span className="app-wrapper__stars app-wrapper__stars--far" />
      {header}
      <FocusMini />
      <main className="main container">{content}</main>
      {footer}
    </div>
  );
};
