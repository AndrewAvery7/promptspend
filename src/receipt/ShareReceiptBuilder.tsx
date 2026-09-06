import { useMemo, useState } from 'react';
import {
  DEFAULT_SHARE_RECEIPT,
  parseShareReceipt,
  renderShareReceiptSvg,
  shareReceiptFilename,
  type ShareReceiptData,
} from './shareReceipt';

type BuilderStatus = { kind: 'idle' | 'success' | 'error'; message: string };

const fields: { key: keyof ShareReceiptData; label: string }[] = [
  { key: 'conversation', label: 'Conversation' },
  { key: 'estimatedTokens', label: 'Estimated tokens' },
  { key: 'currentModel', label: 'Current model' },
  { key: 'estimatedCost', label: 'Estimated cost' },
  { key: 'alternativeModel', label: 'Lower-cost model to test' },
  { key: 'alternativeCost', label: 'Alternative cost' },
  { key: 'priceDifference', label: 'Price difference' },
  { key: 'note', label: 'Assumption note' },
];

export function dispatchReceiptEvent(action: string) {
  window.dispatchEvent(new CustomEvent('promptspend:receipt', { detail: { action } }));
}

async function svgToPngFile(data: ShareReceiptData): Promise<File> {
  const svg = renderShareReceiptSvg(data);
  const image = new Image();
  image.decoding = 'async';
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 1500;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot create the image.');
  context.drawImage(image, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('This browser could not export the image.');
  return new File([blob], shareReceiptFilename(), { type: 'image/png' });
}

function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.click();
  URL.revokeObjectURL(url);
}

export function ShareReceiptBuilder() {
  const [data, setData] = useState<ShareReceiptData>(DEFAULT_SHARE_RECEIPT);
  const [assistantJson, setAssistantJson] = useState('');
  const [status, setStatus] = useState<BuilderStatus>({ kind: 'idle', message: '' });
  const [busyAction, setBusyAction] = useState<'download' | 'share' | null>(null);
  const previewRows = useMemo(() => fields.slice(0, 6), []);

  const importJson = () => {
    try {
      setData(parseShareReceipt(assistantJson));
      setStatus({ kind: 'success', message: 'Receipt imported. Review every field before sharing.' });
      dispatchReceiptEvent('share_imported');
    } catch (cause) {
      setStatus({
        kind: 'error',
        message: cause instanceof Error ? cause.message : 'The receipt could not be imported.',
      });
    }
  };

  const createFile = async (action: 'download' | 'share') => {
    setBusyAction(action);
    try {
      const file = await svgToPngFile(data);
      if (action === 'share' && navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'My PromptSpend AI Receipt',
          text: 'I PromptSpent this conversation. Estimate, not invoice.',
        });
        setStatus({ kind: 'success', message: 'Share sheet opened.' });
        dispatchReceiptEvent('share_opened');
        return;
      }
      downloadFile(file);
      setStatus({
        kind: 'success',
        message:
          action === 'share' ? 'Sharing is unavailable here, so the PNG was downloaded.' : 'PNG downloaded.',
      });
      dispatchReceiptEvent(action === 'share' ? 'share_fallback_downloaded' : 'share_downloaded');
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setStatus({ kind: 'error', message: cause instanceof Error ? cause.message : 'Export failed.' });
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <section className="receipt-section share-builder" aria-labelledby="share-title">
      <div className="receipt-section__heading">
        <div>
          <p className="receipt-eyebrow">MAKE IT SHAREABLE</p>
          <h2 id="share-title">Turn the answer into a receipt.</h2>
        </div>
      </div>
      <p className="share-builder__intro">
        Paste the structured block from your AI audit, review the facts, then download or share a private,
        locally generated PNG. Nothing is uploaded.
      </p>

      <div className="share-builder__grid">
        <div className="share-builder__controls">
          <label htmlFor="receipt-json">
            <b>Assistant receipt JSON</b>
          </label>
          <textarea
            id="receipt-json"
            value={assistantJson}
            onChange={(event) => setAssistantJson(event.target.value)}
            placeholder={'```promptspend-receipt\n{ "conversation": "47 visible turns", ... }\n```'}
          />
          <button type="button" className="receipt-secondary-copy" onClick={importJson}>
            Import assistant result
          </button>

          <details className="share-builder__edit">
            <summary>Review or edit receipt fields</summary>
            <div className="share-builder__fields">
              {fields.map(({ key, label }) => (
                <label key={key}>
                  <span>{label}</span>
                  <input
                    value={data[key]}
                    maxLength={key === 'note' ? 180 : 90}
                    onChange={(event) => setData((current) => ({ ...current, [key]: event.target.value }))}
                  />
                </label>
              ))}
            </div>
          </details>
        </div>

        <article className="share-card" aria-label="Shareable PromptSpend receipt preview">
          <p className="share-card__brand">PROMPTSPEND</p>
          <p className="share-card__eyebrow">YOUR AI RECEIPT</p>
          <h3>
            YOUR PROMPT
            <br />
            HAS A PRICE TAG.
          </h3>
          <dl>
            {previewRows.map(({ key, label }) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>{data[key]}</dd>
              </div>
            ))}
          </dl>
          <p className="share-card__difference">
            <span>PRICE DIFFERENCE</span>
            <strong>{data.priceDifference}</strong>
          </p>
          <p className="share-card__note">{data.note}</p>
          <p className="share-card__url">PROMPTSPEND.COM</p>
        </article>
      </div>

      <div className="share-builder__actions">
        <button
          type="button"
          className="receipt-object__copy"
          disabled={busyAction !== null}
          onClick={() => void createFile('download')}
        >
          {busyAction === 'download' ? 'Creating PNG…' : 'Download PNG'}
        </button>
        <button
          type="button"
          className="receipt-secondary-copy"
          disabled={busyAction !== null}
          onClick={() => void createFile('share')}
        >
          {busyAction === 'share' ? 'Preparing share…' : 'Share receipt'}
        </button>
      </div>
      <p
        className={`share-builder__status${status.kind === 'error' ? ' share-builder__status--error' : ''}`}
        role={status.kind === 'error' ? 'alert' : 'status'}
        aria-live="polite"
      >
        {status.message}
      </p>
    </section>
  );
}
