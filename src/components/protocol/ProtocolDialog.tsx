"use client";
import { useEffect, useRef, type ReactNode } from "react";
export default function ProtocolDialog({
  title,
  fullScreen = false,
  onClose,
  children,
}: {
  title: string;
  fullScreen?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const savedClose = useRef(onClose);
  useEffect(() => {
    savedClose.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element?.showModal();
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-labelledby="protocol-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        savedClose.current();
      }}
      className={fullScreen ? "fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-y-auto border-0 bg-background p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-foreground backdrop:bg-background sm:p-7" : "fixed inset-x-0 bottom-0 top-auto m-0 max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-xl border border-line bg-surface p-5 text-foreground backdrop:bg-foreground/35 sm:inset-0 sm:m-auto sm:max-w-xl sm:rounded-md sm:p-7"}
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <h2
          id="protocol-dialog-title"
          className="text-lg font-medium leading-8"
        >
          {title}
        </h2>
        <button
          type="button"
          autoFocus
          onClick={onClose}
          aria-label="إغلاق النافذة"
          className="min-h-11 min-w-11 rounded border border-line px-3 text-base hover:border-accent"
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
