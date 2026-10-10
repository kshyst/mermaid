import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './AccountApp';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import './styles.css';
import './storage.css';
createRoot(document.getElementById('root')).render(<App/>);
