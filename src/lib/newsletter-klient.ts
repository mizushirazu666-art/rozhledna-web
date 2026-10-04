/**
 * Přihláška k newsletteru (prohlížeč): každý formulář s atributem
 * data-newsletter pošle e-mail na /api/newsletter (Vercel funkce zapíše
 * odběratele do Airtable, tabulka Odberatele). Pamatuje si utm_source
 * z odkazu, kterým čtenář přišel (facebook, obec…), ať je vidět, odkud
 * odběratelé jsou.
 */
const KLIC_ZDROJ = 'rozhledna-zdroj';

function zapamatovatZdroj(): void {
  try {
    const zdroj = new URLSearchParams(location.search).get('utm_source');
    if (zdroj) sessionStorage.setItem(KLIC_ZDROJ, zdroj.slice(0, 60));
  } catch {
    /* bez úložiště to nevadí */
  }
}

function zdroj(): string {
  try {
    return sessionStorage.getItem(KLIC_ZDROJ) || '';
  } catch {
    return '';
  }
}

export function zapojitNewsletter(): void {
  zapamatovatZdroj();
  const nacteno = Date.now();
  document.querySelectorAll<HTMLFormElement>('form[data-newsletter]').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = form.querySelector<HTMLInputElement>('input[type=email]');
      const tlacitko = form.querySelector<HTMLButtonElement>('button');
      const zprava = form.parentElement?.querySelector<HTMLElement>('[data-newsletter-zprava]');
      const ukaz = (text: string, chyba = false) => {
        if (!zprava) return alert(text);
        zprava.textContent = text;
        zprava.hidden = false;
        zprava.classList.toggle('newsletter-zprava--chyba', chyba);
      };
      if (!email?.value) return;
      if (tlacitko) tlacitko.disabled = true;
      try {
        const resp = await fetch('/api/newsletter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.value,
            stranka: location.pathname,
            zdroj: zdroj(),
            nacteno,
            web: form.querySelector<HTMLInputElement>('input[name=web]')?.value || '',
          }),
        });
        const data = await resp.json().catch(() => ({}));
        if (resp.ok && data.ok) {
          form.hidden = true;
          ukaz('Děkujeme, jste přihlášeni. První přehled týdne vám přijde e-mailem.');
        } else {
          ukaz(data.chyba || 'Přihlášení se nepodařilo, zkuste to prosím později.', true);
        }
      } catch {
        ukaz('Přihlášení se nepodařilo, zkuste to prosím později.', true);
      } finally {
        if (tlacitko) tlacitko.disabled = false;
      }
    });
  });
}
