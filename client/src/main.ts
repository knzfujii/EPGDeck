import 'reflect-metadata';
import './app.css';
import smoothscroll from 'smoothscroll-polyfill';
import { mount } from 'svelte';
import App from './App.svelte';

smoothscroll.polyfill();

const target = document.getElementById('app');
if (target) {
    mount(App, { target });
}
