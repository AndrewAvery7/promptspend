import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ReceiptPage } from './ReceiptPage';
import './receipt.css';

const container = document.getElementById('receipt-root');
if (!container) throw new Error('Receipt root element missing from receipt/index.html');

createRoot(container).render(
  <StrictMode>
    <ReceiptPage />
  </StrictMode>,
);
