"use client";

import styles from "./ErrorState.module.css";

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ title, message = "Something went wrong.", onRetry }: ErrorStateProps) {
  return (
    <div className={styles.errorState} role="alert">
      <span className={styles.icon} aria-hidden="true">
        ⚠
      </span>
      {title && <p className={styles.title}>{title}</p>}
      <p className={styles.message}>{message}</p>
      {onRetry && (
        <button type="button" className="btn btn-ghost" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
