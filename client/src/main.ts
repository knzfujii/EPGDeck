import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { initPWA } from './lib/utils/pwa';

initPWA();

const target = document.getElementById('app');
if (target) {
    mount(App, { target });
}
