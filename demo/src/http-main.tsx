import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HttpExample } from './HttpExample';
import '@granum-grid/react/styles.css';
import './example-page.css';
import './http.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HttpExample />
  </StrictMode>,
);
