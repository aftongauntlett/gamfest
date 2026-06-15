import { useEffect, useRef, useState } from 'react';

export interface CopyButtonProps {
  /** Text copied to the clipboard, e.g. the contact email address */
  value: string;
  /** Visible button label while idle — defaults to "Copy" */
  label?: string;
}

const RESET_DELAY_MS = 2000;

/**
 * Small "copy to clipboard" affordance for the contact email. Swaps its
 * label/icon to a confirmation for a couple of
 * seconds and announces the change to assistive tech via `aria-live`, since
 * the visual swap alone wouldn't reach screen-reader users.
 */
export default function CopyButton({ value, label = 'Copy' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  const handleClick = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      return;
    }
    setCopied(true);
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopied(false), RESET_DELAY_MS);
  };

  return (
    <button type="button" className="copy-button" onClick={handleClick}>
      <svg
        className="icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {copied ? (
          <path d="m5 12.5 4.5 4.5L19 7" />
        ) : (
          <>
            <rect x="9" y="9" width="11" height="11" rx="2.5" />
            <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
          </>
        )}
      </svg>
      <span aria-hidden="true">{copied ? 'Copied!' : label}</span>
      <span className="visually-hidden" role="status">
        {copied ? `${value} copied to clipboard` : ''}
      </span>
    </button>
  );
}
