interface CopyButtonProps {
  /** The exact text placed on the clipboard. */
  value: string;
  /**
   * What was copied, in words, lower case — it is read mid-sentence in the
   * accessible name ("Copy install command") and capitalised for the toast.
   */
  label: string;
  onToast: (message: string) => void;
}

/**
 * Copy a command to the clipboard.
 *
 * The commands on this site live in boxes that scroll sideways, because an
 * install line does not fit a phone and shrinking it below 12px is not an
 * option. That makes selecting one by hand genuinely awkward — the thing you
 * are trying to select moves under your finger — so the button is not a
 * convenience here, it is the realistic way to get the text.
 *
 * A failed write is reported rather than swallowed: silence would be
 * indistinguishable from success, and the user would paste whatever was on the
 * clipboard before.
 */
export function CopyButton({ value, label, onToast }: CopyButtonProps) {
  return (
    <button
      type="button"
      className="copy-button"
      aria-label={`Copy ${label}`}
      onClick={() => {
        void navigator.clipboard
          .writeText(value)
          .then(() => onToast(`${label.charAt(0).toUpperCase()}${label.slice(1)} copied`))
          .catch(() => onToast('Could not copy — select the text in the box and copy it manually'));
      }}
    >
      Copy
    </button>
  );
}
