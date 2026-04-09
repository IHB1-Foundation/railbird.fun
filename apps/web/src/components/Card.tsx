import type { ReactNode, HTMLAttributes } from "react";
import styles from "./Card.module.css";

interface CardProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  highlighted?: boolean;
  as?: keyof JSX.IntrinsicElements;
}

export function Card({ children, highlighted, as: Tag = "div", className, ...props }: CardProps) {
  const cls = [styles.card, highlighted ? styles.highlighted : "", className].filter(Boolean).join(" ");
  return <Tag className={cls} {...(props as HTMLAttributes<HTMLElement>)}>{children}</Tag>;
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
