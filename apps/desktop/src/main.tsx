import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { WorkCheckWindow } from './features/work-check/WorkCheckWindow';
import { initializeDesktopIntegrations } from './infrastructure/desktop';
import { ThemeProvider } from './theme/ThemeProvider';
import './theme/tokens.css';

const isWorkCheckWindow =
  new URLSearchParams(window.location.search).get('window') === 'work-check';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>{isWorkCheckWindow ? <WorkCheckWindow /> : <App />}</ThemeProvider>
  </StrictMode>,
);

if (!isWorkCheckWindow) {
  void initializeDesktopIntegrations().catch((error: unknown) => {
    console.error('Could not initialize desktop integrations.', error);
  });
}
