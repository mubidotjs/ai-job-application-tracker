import('./app.js').catch(() => {
  const content = document.getElementById('content');
  if (content) {
    content.textContent =
      'The showcase could not load. Reload this page, or use the case study link below. No data was saved or sent.';
    content.className = 'error';
    content.setAttribute('role', 'alert');
  }
});
