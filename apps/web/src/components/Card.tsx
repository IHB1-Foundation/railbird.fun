import type { ReactNode, HTMLAttributes, ElementType } from "react";
import styles from "./Card.module.css";

type HtmlTag = "div" | "article" | "section" | "aside" | "main" | "header" | "footer" | "nav";

interface CardProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  highlighted?: boolean;
  as?: HtmlTag;
}

export function Card({ children, highlighted, as: Tag = "div", className, ...props }: CardProps) {
  const cls = [styles.card, highlighted ? styles.highlighted : "", className].filter(Boolean).join(" ");
  const Element = Tag as ElementType;
  return <Element className={cls} {...props}>{children}</Element>;
}

export function CardHeader({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={[styles.cardHeader, className].filter(Boolean).join(" ")} {...props}>
      {children}
    </div>
  );
}

export function CardBody({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={[styles.cardBody, className].filter(Boolean).join(" ")} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={[styles.cardFooter, className].filter(Boolean).join(" ")} {...props}>
      {children}
    </div>
  );
}
