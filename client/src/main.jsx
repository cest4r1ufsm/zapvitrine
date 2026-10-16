import './styles/flows.css';
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './vectr-landing.css'
import './sophisticated.css'
import { isAndroidApp } from './services/playBilling'

// Capture the native referrer before login or a full-page navigation replaces it.
isAndroidApp();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
