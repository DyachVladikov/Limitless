import "./MainLayout.scss";

import type { ReactNode } from "react";

interface MainLayoutProps {
  header: ReactNode;
  content: ReactNode;
  footer: ReactNode;
}

export const MainLayout = (props: MainLayoutProps) => {
  const { header, content, footer } = props;

  return (
    <div className="app-wrapper">
      {header}
      <main className="main container">{content}</main>
      {footer}
    </div>
  );
};
