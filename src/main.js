import { createApp } from 'vue'
import App from './App.vue'
import './style/global.css'

createApp(App).mount('#app')

let darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
handleDarkMode(darkModeMediaQuery);
function handleDarkMode(e) {
    let darkModeOn = e.matches;
    let favicon = document.querySelector('link[rel="icon"]');
    if (!favicon) {
        return;
    }
    if (darkModeOn) {
        favicon.href = '/favicon_dark.ico';
    } else {
        favicon.href = '/favicon.ico';
    }
}
darkModeMediaQuery.addEventListener('change', handleDarkMode);