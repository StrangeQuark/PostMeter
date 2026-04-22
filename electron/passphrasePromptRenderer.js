const params = new URLSearchParams(window.location.search);
const message = params.get('message');
const confirmLabel = params.get('confirmLabel');

if (message) {
  document.getElementById('message').textContent = message;
}
if (confirmLabel) {
  document.getElementById('submitButton').textContent = confirmLabel;
}

document.getElementById('passphraseForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = document.getElementById('passphraseInput');
  const error = document.getElementById('error');
  if (input.value.length < 8) {
    error.textContent = 'Use at least 8 characters.';
    input.focus();
    return;
  }
  await window.postmeterPassphrasePrompt.submit(input.value);
});

document.getElementById('cancelButton').addEventListener('click', async () => {
  await window.postmeterPassphrasePrompt.cancel();
});
