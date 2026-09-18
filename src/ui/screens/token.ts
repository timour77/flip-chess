/**
 * First-run token entry screen. Renders into `#screen-token`.
 */

const TOKEN_CREATE_URL =
  'https://lichess.org/account/oauth/token/create?scopes[]=board:play&description=Flip%20Chess';

export interface TokenScreenHandlers {
  /** Resolves to an error message to display, or null on success. */
  onSubmit(token: string): Promise<string | null>;
}

export interface TokenScreenHandle {
  /** Clears the input and any error/validating state. */
  reset(): void;
  destroy(): void;
}

/** Mounts the token entry screen into `root` (`#screen-token`). */
export function createTokenScreen(root: HTMLElement, handlers: TokenScreenHandlers): TokenScreenHandle {
  root.textContent = '';

  const wrap = document.createElement('div');
  wrap.className = 'token-screen';

  const heading = document.createElement('h1');
  heading.className = 'token-heading';
  heading.textContent = 'Connect to Lichess';

  const explain = document.createElement('p');
  explain.className = 'token-explain';
  explain.textContent = 'Paste a personal API token. It is stored only on this device.';

  const link = document.createElement('a');
  link.className = 'token-link';
  link.href = TOKEN_CREATE_URL;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Create a token on lichess.org';

  const form = document.createElement('form');
  form.className = 'token-form';
  form.noValidate = true;

  const input = document.createElement('input');
  input.type = 'password';
  input.name = 'token';
  input.className = 'token-input';
  input.placeholder = 'lip_xxxxxxxxxxxxxxxx';
  input.autocomplete = 'off';
  input.autocapitalize = 'off';
  input.spellcheck = false;

  const error = document.createElement('p');
  error.className = 'token-error';
  error.hidden = true;

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'token-submit';
  submit.textContent = 'Save';

  form.appendChild(input);
  form.appendChild(error);
  form.appendChild(submit);

  wrap.appendChild(heading);
  wrap.appendChild(explain);
  wrap.appendChild(link);
  wrap.appendChild(form);
  root.appendChild(wrap);

  let validating = false;

  function setValidating(next: boolean): void {
    validating = next;
    input.disabled = next;
    submit.disabled = next;
    submit.textContent = next ? 'Checking…' : 'Save';
  }

  function showError(message: string): void {
    error.textContent = message;
    error.hidden = false;
  }

  function clearError(): void {
    error.textContent = '';
    error.hidden = true;
  }

  const onSubmit = (event: SubmitEvent): void => {
    event.preventDefault();
    if (validating) return;

    const token = input.value.trim();
    clearError();
    if (token.length === 0) {
      showError('Enter a token first.');
      return;
    }

    setValidating(true);
    handlers
      .onSubmit(token)
      .then((message) => {
        setValidating(false);
        if (message !== null) {
          showError(message);
        }
      })
      .catch(() => {
        setValidating(false);
        showError('Something went wrong. Try again.');
      });
  };
  form.addEventListener('submit', onSubmit);

  function reset(): void {
    input.value = '';
    clearError();
    setValidating(false);
  }

  function destroy(): void {
    form.removeEventListener('submit', onSubmit);
    root.textContent = '';
  }

  return { reset, destroy };
}
