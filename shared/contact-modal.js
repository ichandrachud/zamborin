/* Zamborin contact modal — injects markup, styles, and submit handler.
   Any element with [data-action="open-contact"] opens the form. */
(function () {
  if (window.__zbContactModalLoaded) return;
  window.__zbContactModalLoaded = true;

  const STYLES = `
    .zb-contact-trigger {
      display: inline-block;
      padding: 14px 22px;
      background: var(--accent, #D8523F);
      color: #fff;
      border: 0;
      border-radius: 999px;
      font-family: inherit;
      font-weight: 700;
      font-size: 15px;
      letter-spacing: 0.3px;
      cursor: pointer;
      transition: background 0.15s, transform 0.15s;
    }
    .zb-contact-trigger:hover { background: #E66752; }
    .zb-contact-trigger:active { transform: scale(0.97); }

    .zb-modal-backdrop {
      position: fixed; inset: 0;
      background: rgba(8, 14, 25, 0.78);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 9000;
      padding: 24px 16px;
      opacity: 0;
      transition: opacity 0.18s ease;
    }
    .zb-modal-backdrop.is-open { display: flex; opacity: 1; }

    .zb-modal {
      width: 100%;
      max-width: 520px;
      background: var(--bg-panel, #1A2A45);
      border: 1px solid var(--line, #1F2D4A);
      border-radius: 18px;
      padding: 28px 26px 24px;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
      color: var(--text, #fff);
      max-height: calc(100dvh - 48px);
      overflow-y: auto;
      transform: translateY(8px);
      transition: transform 0.18s ease;
    }
    .zb-modal-backdrop.is-open .zb-modal { transform: none; }

    .zb-modal-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 6px;
    }
    .zb-modal-title {
      font-size: 22px;
      font-weight: 800;
      letter-spacing: -0.2px;
      color: var(--text, #fff);
    }
    .zb-modal-close {
      background: transparent;
      border: 0;
      color: var(--text-dim, #C5CFE0);
      font-size: 26px;
      line-height: 1;
      cursor: pointer;
      padding: 0 4px;
      margin: -4px -8px 0 0;
    }
    .zb-modal-close:hover { color: var(--text, #fff); }

    .zb-modal-sub {
      font-size: 14px;
      color: var(--text-dim, #C5CFE0);
      margin-bottom: 18px;
      line-height: 1.5;
    }

    .zb-form-row { margin-bottom: 14px; }
    .zb-form-row label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-dim, #C5CFE0);
      margin-bottom: 6px;
    }
    .zb-form-row .zb-optional {
      color: var(--text-mute, #8E9CB5);
      font-weight: 500;
    }
    .zb-form-row input,
    .zb-form-row textarea {
      width: 100%;
      background: var(--bg, #0E1726);
      border: 1px solid var(--line, #1F2D4A);
      border-radius: 10px;
      padding: 12px 14px;
      font-family: inherit;
      font-size: 16px;
      color: var(--text, #fff);
      transition: border-color 0.15s;
    }
    .zb-form-row input:focus,
    .zb-form-row textarea:focus {
      outline: none;
      border-color: #4DC3FF;
    }
    .zb-form-row textarea { resize: vertical; min-height: 120px; }

    .zb-hp {
      position: absolute;
      left: -9999px;
      width: 1px; height: 1px;
      overflow: hidden;
    }

    .zb-modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 18px;
    }
    .zb-btn {
      padding: 12px 22px;
      border-radius: 999px;
      font-family: inherit;
      font-weight: 700;
      font-size: 14px;
      letter-spacing: 0.3px;
      cursor: pointer;
      border: 0;
      transition: background 0.15s, transform 0.15s;
    }
    .zb-btn-ghost {
      background: transparent;
      color: var(--text-dim, #C5CFE0);
    }
    .zb-btn-ghost:hover { color: var(--text, #fff); }
    .zb-btn-primary {
      background: var(--accent, #D8523F);
      color: #fff;
    }
    .zb-btn-primary:hover { background: #E66752; }
    .zb-btn-primary:disabled { opacity: 0.55; cursor: wait; }

    .zb-modal-msg {
      font-size: 14px;
      line-height: 1.5;
      padding: 12px 14px;
      border-radius: 10px;
      margin-top: 10px;
      display: none;
    }
    .zb-modal-msg.is-error {
      display: block;
      background: rgba(216, 82, 63, 0.15);
      border: 1px solid rgba(216, 82, 63, 0.4);
      color: #FFB4A6;
    }
    .zb-modal-msg.is-success {
      display: block;
      background: rgba(93, 211, 158, 0.12);
      border: 1px solid rgba(93, 211, 158, 0.4);
      color: #B0E8CD;
    }
  `;

  const MARKUP = `
    <div class="zb-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="zb-modal-title" aria-hidden="true">
      <div class="zb-modal">
        <div class="zb-modal-head">
          <h2 class="zb-modal-title" id="zb-modal-title">Send a message</h2>
          <button class="zb-modal-close" type="button" aria-label="Close">&times;</button>
        </div>
        <p class="zb-modal-sub">Bug reports, game requests, feedback, partnerships, or just a hello.</p>
        <form class="zb-modal-form" novalidate>
          <div class="zb-form-row">
            <label for="zb-f-name">Your name <span class="zb-optional">(optional)</span></label>
            <input type="text" id="zb-f-name" name="name" autocomplete="name" maxlength="120" />
          </div>
          <div class="zb-form-row">
            <label for="zb-f-email">Your email <span class="zb-optional">(optional — only used so we can reply)</span></label>
            <input type="email" id="zb-f-email" name="email" autocomplete="email" maxlength="200" />
          </div>
          <div class="zb-form-row">
            <label for="zb-f-subject">Subject <span class="zb-optional">(optional)</span></label>
            <input type="text" id="zb-f-subject" name="subject" maxlength="200" />
          </div>
          <div class="zb-form-row">
            <label for="zb-f-message">Message</label>
            <textarea id="zb-f-message" name="message" required maxlength="5000" rows="6"></textarea>
          </div>
          <div class="zb-hp" aria-hidden="true">
            <label>Don't fill this in: <input type="text" name="hp" tabindex="-1" autocomplete="off" /></label>
          </div>
          <div class="zb-modal-msg" role="status" aria-live="polite"></div>
          <div class="zb-modal-actions">
            <button type="button" class="zb-btn zb-btn-ghost zb-cancel">Cancel</button>
            <button type="submit" class="zb-btn zb-btn-primary zb-submit">Send</button>
          </div>
        </form>
      </div>
    </div>
  `;

  function mount() {
    const styleEl = document.createElement('style');
    styleEl.textContent = STYLES;
    document.head.appendChild(styleEl);

    const wrap = document.createElement('div');
    wrap.innerHTML = MARKUP;
    const backdrop = wrap.firstElementChild;
    document.body.appendChild(backdrop);

    const modal = backdrop.querySelector('.zb-modal');
    const closeBtn = backdrop.querySelector('.zb-modal-close');
    const cancelBtn = backdrop.querySelector('.zb-cancel');
    const form = backdrop.querySelector('.zb-modal-form');
    const submitBtn = backdrop.querySelector('.zb-submit');
    const msgEl = backdrop.querySelector('.zb-modal-msg');
    const messageInput = backdrop.querySelector('#zb-f-message');

    let lastFocused = null;

    function open() {
      lastFocused = document.activeElement;
      backdrop.classList.add('is-open');
      backdrop.setAttribute('aria-hidden', 'false');
      msgEl.className = 'zb-modal-msg';
      msgEl.textContent = '';
      setTimeout(() => messageInput.focus(), 50);
      document.addEventListener('keydown', onKey);
    }
    function close() {
      backdrop.classList.remove('is-open');
      backdrop.setAttribute('aria-hidden', 'true');
      document.removeEventListener('keydown', onKey);
      if (lastFocused && lastFocused.focus) lastFocused.focus();
    }
    function onKey(e) {
      if (e.key === 'Escape') close();
    }

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close();
    });
    closeBtn.addEventListener('click', close);
    cancelBtn.addEventListener('click', close);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      msgEl.className = 'zb-modal-msg';
      msgEl.textContent = '';

      const data = {
        name: form.name.value,
        email: form.email.value,
        subject: form.subject.value,
        message: form.message.value,
        hp: form.hp.value,
      };

      if (!data.message.trim() || data.message.trim().length < 5) {
        msgEl.className = 'zb-modal-msg is-error';
        msgEl.textContent = 'Please write a message of at least a few words.';
        messageInput.focus();
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending…';

      try {
        const r = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const json = await r.json().catch(() => ({}));
        if (r.ok && json.ok) {
          form.reset();
          msgEl.className = 'zb-modal-msg is-success';
          msgEl.textContent = 'Thanks — your message is on its way. We usually reply within a few days.';
        } else {
          msgEl.className = 'zb-modal-msg is-error';
          msgEl.textContent = json.error || 'Could not send. Please try again in a few minutes.';
        }
      } catch (err) {
        msgEl.className = 'zb-modal-msg is-error';
        msgEl.textContent = 'Could not reach the server. Please check your connection and try again.';
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send';
      }
    });

    document.addEventListener('click', (e) => {
      const trigger = e.target.closest('[data-action="open-contact"]');
      if (trigger) {
        e.preventDefault();
        open();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
