"use client";

import type { ReactNode } from "react";
import styles from "./EmptyState.module.css";

interface EmptyStateAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: EmptyStateAction;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className={styles.emptyState} role="status">
      {icon && <div className={styles.emptyIcon} aria-hidden="true">{icon}</div>}
      <p className={styles.emptyTitle}>{title}</p>
      {description && <p className={styles.emptyDescription}>{description}</p>}
      {action && (
        action.href ? (
          <a href={action.href} className="btn btn-ghost">{action.label}</a>
        ) : (
          <button type="button" className="btn btn-ghost" onClick={action.onClick}>{action.label}</button>
        )
      )}
    </div>
  );
}
