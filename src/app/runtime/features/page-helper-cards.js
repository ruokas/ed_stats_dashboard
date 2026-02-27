const HELPERS = {
  charts: {
    key: 'edDashboard:helper:charts:dismissed',
    title: 'Kaip naudotis grafikais',
    steps: [
      'Pirmiausia pasirinkite laikotarpį ir pagrindinius filtrus.',
      'Atverkite tik reikalingą sekciją (Valandinis / Heatmap / Stacionarizacijos).',
      'Naudokite „Eksportuoti“ norimai vizualizacijai.',
    ],
  },
  summaries: {
    key: 'edDashboard:helper:summaries:dismissed',
    title: 'Kaip naudotis suvestinėmis',
    steps: [
      'Pradėkite nuo metų, TOP N ir minimalios imties.',
      'Naudokite viršutinę sekcijų navigaciją greitam perėjimui.',
      'Eksportuokite lenteles ar grafikus tik po filtrų patikslinimo.',
    ],
  },
  gydytojai: {
    key: 'edDashboard:helper:gydytojai:dismissed',
    title: 'Kaip naudotis gydytojų analize',
    steps: [
      'Naudokite bazinius filtrus ir paiešką pagal vardą.',
      'Išplėstinius filtrus atverkite tik kai reikia TOP/min. imties/rikiavimo.',
      'Palyginimui pirmiausia rinkitės lenteles, tada grafikus.',
    ],
  },
};

function readDismissed(key) {
  try {
    return window.localStorage.getItem(key) === 'true';
  } catch (_error) {
    return false;
  }
}

function writeDismissed(key) {
  try {
    window.localStorage.setItem(key, 'true');
  } catch (_error) {
    // ignore
  }
}

export function initPageHelperCard() {
  const pageId = String(document.body?.dataset?.page || '').trim();
  const config = HELPERS[pageId];
  const main = document.querySelector('main.container');
  if (!config || !main || readDismissed(config.key) || document.getElementById('pageHelperCard')) {
    return;
  }
  const card = document.createElement('aside');
  card.id = 'pageHelperCard';
  card.className = 'page-helper-card';
  card.setAttribute('role', 'note');
  card.innerHTML = `
    <div class="page-helper-card__content">
      <h2 class="page-helper-card__title">${config.title}</h2>
      <ol class="page-helper-card__list">
        ${config.steps.map((step) => `<li>${step}</li>`).join('')}
      </ol>
    </div>
    <button type="button" class="chip-button chip-button--ghost page-helper-card__dismiss" aria-label="Uždaryti pagalbos kortelę">Uždaryti</button>
  `;
  const firstChild = main.firstElementChild || null;
  if (firstChild) {
    main.insertBefore(card, firstChild);
  } else {
    main.appendChild(card);
  }
  const dismiss = card.querySelector('.page-helper-card__dismiss');
  if (dismiss instanceof HTMLButtonElement) {
    dismiss.addEventListener('click', () => {
      writeDismissed(config.key);
      card.remove();
    });
  }
}
