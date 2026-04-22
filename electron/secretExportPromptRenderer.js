const params = new URLSearchParams(window.location.search);
const phrase = params.get('phrase') || '';
const title = params.get('title');
const message = params.get('message');
const confirmLabel = params.get('confirmLabel');

if (title) {
  document.getElementById('title').textContent = title;
}
if (message) {
  document.getElementById('message').textContent = message;
}
document.getElementById('phrase').textContent = phrase;
if (confirmLabel) {
  document.getElementById('submitButton').textContent = confirmLabel;
}

document.getElementById('secretExportForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = document.getElementById('confirmationInput');
  const error = document.getElementById('error');
  if (input.value !== phrase) {
    error.textContent = 'The confirmation phrase does not match.';
    input.focus();
    input.select();
    return;
  }
  await window.postmeterSecretExportPrompt.submit(input.value);
});

document.getElementById('cancelButton').addEventListener('click', async () => {
  await window.postmeterSecretExportPrompt.cancel();
});
