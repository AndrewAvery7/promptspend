/* global window */
const calculatorPath = window.location.pathname.replace(/estimate\/?$/, '');
window.location.replace(calculatorPath + window.location.search + window.location.hash);
