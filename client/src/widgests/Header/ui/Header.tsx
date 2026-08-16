"use client";

import { Logo } from "@/shared/Logo";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { routesArr as navList } from "@/shared/config/routes";
import { ROUTES } from "@/shared/config/routes";
import classNames from "classnames";
import { GoBellFill } from "react-icons/go";
import { Button } from "@/shared/Button/ui/Button";
import "./Header.scss";
import { useEffect, useRef, useState } from "react";

interface LogoColors {
  main: string;
  dark: string;
  namePage: string;
}

const routeColors: Record<string, LogoColors> = {
  [ROUTES.HOME]: {
    main: "#9b5de5", // Мягкий неоновый фиолетовый
    dark: "#2a0a4a", // Очень глубокий сливовый для теней
    namePage: "home",
  },
  [ROUTES.RATIONALITY]: {
    main: "#e63946", // Матовый рубиново-красный (не кислотный)
    dark: "#4a0b12", // Темно-бордовый
    namePage: "rationality",
  },
  [ROUTES.DO_IT]: {
    main: "#3a86ff", // Спокойный синий электрик
    dark: "#0b163d", // Цвет ночного неба
    namePage: "do-it",
  },
  [ROUTES.WORK]: {
    main: "#06d6a0", // Приглушенный изумрудно-зеленый (мятный неон)
    dark: "#023628", // Глубокий темно-зеленый
    namePage: "work",
  },
};

export const Header = () => {
  const pathname = usePathname();

  const [isScrolled, setIsScrolled] = useState(false);
  const navRef = useRef<HTMLUListElement>(null);
  const [underline, setUnderline] = useState<{
    left: number;
    width: number;
  } | null>(null);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const update = () => {
      const nav = navRef.current;
      if (!nav) return;
      const active = nav.querySelector<HTMLElement>(
        `[data-path="${pathname}"]`,
      );
      if (!active) return;
      setUnderline({ left: active.offsetLeft, width: active.offsetWidth });
    };
    update();
    document.fonts?.ready.then(update);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [pathname]);

  const currentColors = routeColors[pathname] || routeColors["/"];
  return (
    <header
      className={classNames(
        "header",
        "container",
        `header--${currentColors.namePage}`,
        {
          "header--scrolled": isScrolled,
        },
      )}
      style={{ "--glow-color": currentColors.main } as React.CSSProperties}
    >
      <div className="header__inner container">
        <div className="header__logo">
          <Logo
            mainColor={currentColors.main}
            darkColor={currentColors.dark}
            width={80}
            height={80}
          />
        </div>
        <nav className="header__nav">
          <ul className="header__nav-list" ref={navRef}>
            {navList.map((item) => (
              <li
                className="header__nav-item"
                key={item.path}
                data-path={item.path}
              >
                <Link href={item.path} className="header__nav-link">
                  {item.name}
                </Link>
              </li>
            ))}
            {underline && (
              <div
                className="header__nav-underline"
                style={{ left: underline.left, width: underline.width }}
              />
            )}
          </ul>
        </nav>
        <div className="header__notifications">
          <Button
            className="header__notifications-btn"
            onlyIcon
            icon={<GoBellFill />}
            title="Уведомления"
          />
        </div>
      </div>
    </header>
  );
};
