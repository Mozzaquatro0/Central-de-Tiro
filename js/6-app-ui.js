/* ============================================================================
 * C TIR DIGITAL v5.0 — MÓDULO 6: ORQUESTRADOR DA INTERFACE, ESTADO & TUTORIAL
 * ============================================================================ */
window.CTIR = window.CTIR || {};

CTIR.APP = (function () {
  const C = CTIR.CONSTANTS;
  const G = CTIR.GEO;
  const B = CTIR.BALLISTICS;
  const A = CTIR.APIS;
  const M = CTIR.MAP;

  const STORAGE_KEY = 'ctir_120mm_v5_state';
  const TUT_DISMISSED_KEY = 'ctir_120mm_v5_tut_hide';

  const defaultState = {
    basePieceSelect: 1,
    utmZone: 21,
    utmHemi: 'S',
    baseE: 698450,
    baseN: 6652300,
    baseAlt: 132,
    pieceInterval: 35,
    frontAzimuth: 1600,
    sheafType: 'parallel',
    targetE: 701820,
    targetN: 6655940,
    targetAlt: 168,
    magDeclination: -312,
    meridianConv: -14,
    northRefSelect: 'NQ',
    ammoType: 'CONV',
    chargeSelect: 'AUTO',
    fuzeType: 'INST',
    fuzeTime: 0.0,
    projWeightVar: 0,
    propTemp: 21,
    windDir: 0,
    windSpeed: 0,
    windBalDir: 0,
    windBalSpeed: 0,
    airTemp: 15,
    airPressure: 997,
    crestDist: 0,
    crestAlt: 0,
    friendlyE: '',
    friendlyN: '',
    friendlyAlt: 140,
    friendlyRadius: 400,
    oaE: 700950,
    oaN: 6654400,
    oaAlt: 185,
    oaAz: 520,
    oaDist: 1765,
    oaSite: -10,
    factorK: 0,
    activeTool: 'target',
    pinsLocked: false,
    nightMode: false,
    offlineMap: false,
    placeName: 'Setor Operacional',
    terrainProfile: null,
    savedTargets: [],
    missionLog: []
  };

  let state = { ...defaultState };
  let lastSolution = null;
  let lastFireCommandText = '';
  let currentTutStep = 0;

  const TUTORIAL_STEPS = [
    {
      selector: '#cardPosition',
      title: '1. Posição da Linha de Fogo, Alvo e Três Nortes',
      body: 'Insira as coordenadas SIRGAS 2000 UTM da Peça Base e do Alvo, ou capture direto pelo botão GPS. O sistema calcula a Convergência de Meridianos (C) e converte automaticamente entre Norte da Quadrícula (NQ), Verdadeiro (NV) e Magnético (NM).',
      tip: 'Use "🧲 QM Auto" para atualizar a Declinação Magnética via NOAA conforme a data e posição.'
    },
    {
      selector: '#cardAmmo',
      title: '2. Munição 120 mm, Carga e Espoleta',
      body: 'Escolha a granada (AE Convencional, PR, PRPA até 12,6 km, Fumígena ou Iluminativa). No modo "Automática (Ótima)", a Central escolhe a carga com melhor margem balística.',
      tip: 'Informe os quadrados de peso pintados na ogiva (□) e a temperatura do propelente para eliminar erros sistemáticos.'
    },
    {
      selector: '#cardMeteo',
      title: '3. Meteorologia Balística & Densidade Real',
      body: 'Clique em "☁️ Puxar Meteo" para obter vento de superfície, vento balístico ponderado em altitude, temperatura e pressão barométrica real na cota da posição.',
      tip: 'Os dados ficam salvos em cache para operação 100% offline caso a conexão caia no terreno.'
    },
    {
      selector: '#cardSafety',
      title: '4. Relevo, Crista Assimétrica (57%) e TSZ',
      body: 'Use "📈 Varrer Relevo" para checar 28 pontos do terreno entre as peças e o alvo, ou informe a crista manualmente. O cálculo considera o ápice assimétrico real a 57% do alcance.',
      tip: 'Preencha Tropas E/N para ativar o escudo vermelho da Zona de Segurança de Tropas (TSZ).'
    },
    {
      selector: '#mapSection',
      title: '5. Mapa Tático & Prancheta Offline 1:25.000',
      body: 'Selecione o pino na barra superior (Alvo, Peça Base, OA, Crista ou Tropas) e toque no mapa. No celular, ative "🔒 Travar Pinos" após posicionar para evitar arrastes acidentais.',
      tip: 'Sem internet? Alterne no topo para "🗺️ Prancheta Offline" com quadrícula UTM 1:25.000.'
    },
    {
      selector: '#cardFiringTable',
      title: '6. Elementos de Tiro da Seção & Comando de Tiro',
      body: 'A tabela exibe Distância, Azimute NQ, Deriva, Luneta, Alça, Sítio, Elevação e Tempo de Voo das 4 peças. O Comando de Tiro pode ser lido em voz alta na fonética militar ("🔊 Falar") ou compartilhado.',
      tip: 'Se o alvo ultrapassar o alcance da munição ou bater em crista, o alerta vermelho bloqueia o tiro.'
    },
    {
      selector: '#cardConduct',
      title: '7. Conduta do OA, Bússola 6400\'\'\' e Fator K Longitudinal',
      body: 'Use a Bússola do celular já convertida para NQ, lance alvos por coordenadas polares do OA ou dite correções por voz ("🎙️ Ditar OA"). O Fator K acumula apenas o erro longitudinal no eixo Peça–Alvo.',
      tip: 'Salve concentrações (ex: AB 1001) e imprima a Ficha do Calculador em A4 pelo botão superior.'
    }
  ];

  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        state = { ...defaultState, ...JSON.parse(saved) };
      }
    } catch (_) {
      state = { ...defaultState };
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {
      // Ignora limite de quota
    }
  }

  /* Sincroniza objeto state -> campos do formulário HTML */
  function syncStateToInputs() {
    const ids = [
      'basePieceSelect', 'utmZone', 'utmHemi', 'baseE', 'baseN', 'baseAlt',
      'pieceInterval', 'frontAzimuth', 'sheafType', 'targetE', 'targetN', 'targetAlt',
      'magDeclination', 'meridianConv', 'northRefSelect', 'ammoType', 'chargeSelect',
      'fuzeType', 'fuzeTime', 'projWeightVar', 'propTemp', 'windDir', 'windSpeed',
      'windBalDir', 'windBalSpeed', 'airTemp', 'airPressure', 'crestDist', 'crestAlt',
      'friendlyE', 'friendlyN', 'friendlyAlt', 'friendlyRadius',
      'oaE', 'oaN', 'oaAlt', 'oaAz', 'oaDist', 'oaSite'
    ];

    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el && state[id] !== undefined) {
        el.value = state[id];
      }
    });

    document.body.classList.toggle('night-mode', Boolean(state.nightMode));
    const btnNight = document.getElementById('btnNightMode');
    if (btnNight) btnNight.classList.toggle('active', Boolean(state.nightMode));

    const btnLock = document.getElementById('btnLockPins');
    if (btnLock) {
      btnLock.classList.toggle('locked', Boolean(state.pinsLocked));
      btnLock.textContent = state.pinsLocked ? '🔒 Pinos Travados' : '🔓 Pinos Livres';
    }

    document.querySelectorAll('.pin-btn[data-tool]').forEach((btn) => {
      btn.classList.toggle('selected', btn.dataset.tool === state.activeTool);
    });

    const hudPlace = document.getElementById('hudPlaceName');
    if (hudPlace) hudPlace.textContent = state.placeName || 'Setor Operacional';
  }

  /* Lê valores dos campos HTML -> objeto state */
  function syncInputsToState() {
    const numIds = [
      'basePieceSelect', 'utmZone', 'baseE', 'baseN', 'baseAlt',
      'pieceInterval', 'frontAzimuth', 'targetE', 'targetN', 'targetAlt',
      'magDeclination', 'meridianConv', 'fuzeTime', 'projWeightVar', 'propTemp',
      'windDir', 'windSpeed', 'windBalDir', 'windBalSpeed', 'airTemp', 'airPressure',
      'crestDist', 'crestAlt', 'friendlyAlt', 'friendlyRadius',
      'oaE', 'oaN', 'oaAlt', 'oaAz', 'oaDist', 'oaSite'
    ];
    const strIds = ['utmHemi', 'sheafType', 'northRefSelect', 'ammoType', 'chargeSelect', 'fuzeType'];

    numIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) state[id] = Number(el.value) || 0;
    });

    strIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) state[id] = el.value;
    });

    const fE = document.getElementById('friendlyE');
    const fN = document.getElementById('friendlyN');
    state.friendlyE = fE && fE.value !== '' ? Number(fE.value) : '';
    state.friendlyN = fN && fN.value !== '' ? Number(fN.value) : '';
  }

  /* Atualiza faixa dos Três Nortes (NQ / NV / NM) */
  function updateNorthsDisplay() {
    const conv = G.computeMeridianConvergence(
      state.baseE,
      state.baseN,
      state.utmZone,
      state.utmHemi
    );
    state.meridianConv = conv;
    const convInput = document.getElementById('meridianConv');
    if (convInput) convInput.value = conv;

    const three = G.fromGridAzimuth(0, state.magDeclination, conv);
    const nvDiff = G.deltaMil(three.nv, 0);
    const nmDiff = G.deltaMil(three.nm, 0);

    const strip = document.getElementById('northsReadout');
    if (strip) {
      strip.innerHTML =
        `NQ 0''' | NV <strong>${G.formatSignedMil(nvDiff)}</strong> | ` +
        `NM <strong>${G.formatSignedMil(nmDiff)}</strong> (QM ${G.formatSignedMil(state.magDeclination)})`;
    }
  }

  /* Monta o Comando de Tiro regulamentar (C 23-95) */
  function buildFireCommand(sol) {
    const base = sol.baseSolved;
    const fuzeMap = {
      INST: 'ESPOLETA INSTANTÂNEA',
      RET: 'ESPOLETA RETARDO',
      PROX: 'ESPOLETA PROXIMIDADE',
      TMP: `ESPOLETA TEMPO, GRADUAÇÃO ${Number(state.fuzeTime).toFixed(1)}s`
    };
    const sheafMap = {
      parallel: 'FEIXE PARALELO',
      convergent: 'FEIXE CONVERGENTE',
      open: 'FEIXE ABERTO (35 m)'
    };

    const pLines = sol.pieces
      .map(
        (p) =>
          `${p.label}${p.isBase ? ' (BASE)' : ''}: DERIVA ${G.formatMil(p.sightMil)} | ALÇA ${p.alcaMil}''' | SÍTIO ${G.formatSignedMil(p.siteMil)} | ELV ${p.elvMil}'''`
      )
      .join('\n');

    return [
      `ATENÇÃO SEÇÃO DE MORTEIROS 120 mm!`,
      `MUNIÇÃO: ${sol.ammoMeta.shortName} • CARGA ${sol.charge} • ${fuzeMap[state.fuzeType] || 'INSTANTÂNEA'}`,
      `DIREÇÃO DE TIRO (BASE): AZIMUTE NQ ${G.formatMil(base.fireAzNQ)} • ${sheafMap[state.sheafType] || 'FEIXE PARALELO'}`,
      `------------------------------------------------------------`,
      pLines,
      `------------------------------------------------------------`,
      `ALCANCE: ${base.distM} m | FLECHA: ${base.apexM} m | TEMPO DE VOO: ${base.tofSec.toFixed(1)} s | FATOR K: ${(sol.factorK * 100 >= 0 ? '+' : '') + (sol.factorK * 100).toFixed(1)}%`
    ].join('\n');
  }

  /* Atualiza tabela das 4 peças, alertas de segurança e Comando de Tiro */
  function renderSolutionUI(sol) {
    lastSolution = sol;

    // Resumo topo da tabela
    const elDist = document.getElementById('summaryDist');
    const elAz = document.getElementById('summaryAz');
    const elCh = document.getElementById('summaryCharge');
    const elAp = document.getElementById('summaryApex');
    const elFk = document.getElementById('summaryFactorK');

    if (elDist) elDist.textContent = `${sol.baseSolved.distM} m`;
    if (elAz) elAz.textContent = G.formatMil(sol.baseSolved.azNQ);
    if (elCh) elCh.textContent = `Carga ${sol.charge}`;
    if (elAp) elAp.textContent = `${sol.baseSolved.apexM} m`;
    if (elFk) {
      const pct = (sol.factorK * 100).toFixed(1);
      elFk.textContent = `Fator K: ${Number(pct) >= 0 ? '+' : ''}${pct}%`;
      elFk.className = 'api-pill ' + (Math.abs(sol.factorK) > 0.001 ? 'cached' : 'online');
    }

    // Leituras meteorológicas
    const elDens = document.getElementById('meteoDensityReadout');
    const elWind = document.getElementById('meteoWindCompReadout');
    if (elDens) {
      elDens.innerHTML = `Densidade ρ: <strong>${sol.densityInfo.rhoPercent.toFixed(1)}%</strong> (${sol.densityInfo.rhoKgM3.toFixed(3)} kg/m³)`;
    }
    if (elWind) {
      elWind.innerHTML = `VL: <strong>${sol.windLongKt >= 0 ? '+' : ''}${sol.windLongKt} kt</strong> | VT: <strong>${sol.windCrossKt >= 0 ? '+' : ''}${sol.windCrossKt} kt</strong>`;
    }

    // HUD inferior do mapa
    const hudDist = document.getElementById('hudDistAz');
    if (hudDist) {
      hudDist.textContent = `Dist: ${sol.baseSolved.distM} m | Az NQ: ${G.formatMil(sol.baseSolved.azNQ)} | Carga ${sol.charge}`;
    }

    // Tabela das 4 peças
    const tbody = document.getElementById('piecesTableBody');
    if (tbody) {
      tbody.innerHTML = sol.pieces
        .map((p) => {
          const rowClass = p.outOfRange ? 'row-oob' : p.isBase ? 'base-piece' : '';
          return `<tr class="${rowClass}">
            <td><strong>${p.label}</strong></td>
            <td>${p.distM}</td>
            <td>${G.formatMil(p.fireAzNQ)}</td>
            <td>${G.formatSignedMil(p.deflectionFromFront)}</td>
            <td class="val-highlight">${G.formatMil(p.sightMil)}</td>
            <td class="val-highlight">${p.alcaMil}'''</td>
            <td>${G.formatSignedMil(p.siteMil)}</td>
            <td class="${p.outOfRange ? 'val-danger' : ''}">${p.elvMil}'''</td>
            <td>${p.tofSec.toFixed(1)}s</td>
          </tr>`;
        })
        .join('');
    }

    // Alertas de Segurança e Banner Crítico
    const alerts = [];
    const banner = document.getElementById('outOfRangeBanner');
    let criticalBlock = false;

    if (sol.absoluteOutOfEnvelope || sol.anyOutOfRange) {
      criticalBlock = true;
      const msg =
        sol.baseSolved.distM < sol.ammoMeta.minRange
          ? `⚠️ ALVO ABAIXO DO ALCANCE MÍNIMO (${sol.baseSolved.distM} m < ${sol.ammoMeta.minRange} m)!`
          : `⚠️ ALVO FORA DO ALCANCE MÁXIMO (${sol.baseSolved.distM} m > ${sol.ammoMeta.maxRange} m)!`;
      alerts.push(`<div class="alert-box alert-danger">${msg} Troque para PRPA ou mude de posição.</div>`);
      if (banner) {
        banner.textContent = msg;
        banner.style.display = 'block';
      }
    } else if (banner) {
      banner.style.display = 'none';
    }

    if (sol.crestResult.hasCrest) {
      if (sol.crestResult.blocked) {
        criticalBlock = true;
        alerts.push(
          `<div class="alert-box alert-danger">⛰️ CRISTA BLOQUEANDO TRAJETÓRIA a ${sol.crestResult.crestDist} m (Cota terreno ${sol.crestResult.crestAlt} m vs Granada ${sol.crestResult.projAlt} m | Margem ${sol.crestResult.marginM} m)!</div>`
        );
        if (banner && banner.style.display === 'none') {
          banner.textContent = `⛰️ ALERTA DE CRISTA: PROJÉTIL INTERCEPTA RELEVO A ${sol.crestResult.crestDist} m!`;
          banner.style.display = 'block';
        }
      } else if (sol.crestResult.caution) {
        alerts.push(
          `<div class="alert-box alert-warn">⛰️ PASSAGEM RASA SOBRE CRISTA a ${sol.crestResult.crestDist} m (Folga vertical: +${sol.crestResult.marginM} m).</div>`
        );
      } else {
        alerts.push(
          `<div class="alert-box alert-ok">⛰️ Crista livre a ${sol.crestResult.crestDist} m (Folga vertical: +${sol.crestResult.marginM} m).</div>`
        );
      }
    }

    if (sol.tszResult.active) {
      if (sol.tszResult.status === 'DANGER') {
        criticalBlock = true;
        alerts.push(
          `<div class="alert-box alert-danger">🛡️ PERIGO! TIRO DENTRO DA TSZ DE TROPAS AMIGAS (${sol.tszResult.minDistM} m < Raio ${sol.tszResult.radiusM} m)!</div>`
        );
      } else if (sol.tszResult.status === 'CAUTION') {
        alerts.push(
          `<div class="alert-box alert-warn">🛡️ ATENÇÃO TSZ: Impacto a ${sol.tszResult.minDistM} m das tropas amigas (Limite ${sol.tszResult.radiusM} m).</div>`
        );
      } else {
        alerts.push(
          `<div class="alert-box alert-ok">🛡️ Tropas amigas seguras (${sol.tszResult.minDistM} m do impacto).</div>`
        );
      }
    }

    if (alerts.length === 0) {
      alerts.push(
        `<div class="alert-box alert-ok">✅ Solução balística validada dentro do envelope C 23-95.</div>`
      );
    }

    const alertsBox = document.getElementById('safetyAlertsBox');
    if (alertsBox) alertsBox.innerHTML = alerts.join('');

    lastFireCommandText = buildFireCommand(sol);
    const cmdBox = document.getElementById('fireCommandBox');
    if (cmdBox) {
      cmdBox.textContent = lastFireCommandText;
      cmdBox.classList.toggle('blocked', criticalBlock);
    }
  }

  function recalculateAll(persist = true) {
    syncInputsToState();
    updateNorthsDisplay();
    const sol = B.solveBatteryFiringSolution(state);
    renderSolutionUI(sol);
    M.renderAll(state, sol);
    if (persist) saveState();
  }

  /* Registra evento no histórico cronológico */
  function appendLog(entryText) {
    const now = new Date();
    const stamp =
      String(now.getHours()).padStart(2, '0') +
      ':' +
      String(now.getMinutes()).padStart(2, '0') +
      ':' +
      String(now.getSeconds()).padStart(2, '0');
    state.missionLog.unshift({ time: stamp, text: entryText });
    if (state.missionLog.length > 35) state.missionLog.pop();
    renderLogsAndTargets();
    saveState();
  }

  function renderLogsAndTargets() {
    const tList = document.getElementById('savedTargetsList');
    if (tList) {
      if (!state.savedTargets.length) {
        tList.innerHTML = `<div style="font-size:10px; color:var(--text-muted); padding:3px;">Nenhuma concentração salva.</div>`;
      } else {
        tList.innerHTML = state.savedTargets
          .map(
            (t, idx) => `<div class="target-item">
              <span><strong>${t.name}</strong> • ${t.e}E ${t.n}N (${t.alt}m)</span>
              <div style="display:flex; gap:3px;">
                <button class="btn primary" type="button" style="padding:2px 6px; font-size:10px;" data-engage-target="${idx}">Engajar</button>
                <button class="btn danger" type="button" style="padding:2px 6px; font-size:10px;" data-del-target="${idx}">✕</button>
              </div>
            </div>`
          )
          .join('');
      }
    }

    const lList = document.getElementById('missionLogList');
    if (lList) {
      lList.innerHTML = state.missionLog
        .map((item) => `<div class="log-item"><strong>[${item.time}]</strong> ${item.text}</div>`)
        .join('');
    }
  }

  /* ==========================================================================
   * TUTORIAL INTERATIVO SPOTLIGHT (DESKTOP + MOBILE SAFE)
   * ========================================================================== */
  function openTutorial(stepIdx = 0) {
    currentTutStep = Math.max(0, Math.min(TUTORIAL_STEPS.length - 1, stepIdx));
    const layer = document.getElementById('tutorialLayer');
    if (!layer) return;
    layer.style.display = 'block';
    renderTutorialStep();
  }

  function closeTutorial() {
    const layer = document.getElementById('tutorialLayer');
    const chk = document.getElementById('tutDontShow');
    if (chk && chk.checked) {
      localStorage.setItem(TUT_DISMISSED_KEY, '1');
    }
    if (layer) layer.style.display = 'none';
  }

  function renderTutorialStep() {
    const step = TUTORIAL_STEPS[currentTutStep];
    const targetEl = document.querySelector(step.selector);
    const spot = document.getElementById('tutorialSpotlight');
    const card = document.getElementById('tutorialCard');

    document.getElementById('tutStepBadge').textContent = `PASSO ${currentTutStep + 1} / ${TUTORIAL_STEPS.length}`;
    document.getElementById('tutTitle').textContent = step.title;
    document.getElementById('tutBody').textContent = step.body;
    document.getElementById('tutTip').textContent = '💡 ' + step.tip;
    document.getElementById('tutPrevBtn').disabled = currentTutStep === 0;
    document.getElementById('tutNextBtn').textContent =
      currentTutStep === TUTORIAL_STEPS.length - 1 ? 'Concluir ✔' : 'Próximo ▶';

    if (targetEl && spot && card) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => {
        const rect = targetEl.getBoundingClientRect();
        const pad = 5;
        spot.style.left = Math.max(2, rect.left - pad) + 'px';
        spot.style.top = Math.max(2, rect.top - pad) + 'px';
        spot.style.width = Math.min(window.innerWidth - 4, rect.width + pad * 2) + 'px';
        spot.style.height = Math.min(window.innerHeight - 4, rect.height + pad * 2) + 'px';

        // Em telas > 480px posiciona card próximo ao alvo sem sair da tela
        if (window.innerWidth > 480) {
          let cardLeft = rect.right + 16;
          if (cardLeft + 390 > window.innerWidth) {
            cardLeft = Math.max(12, rect.left - 396);
          }
          if (cardLeft < 12) {
            cardLeft = Math.max(12, (window.innerWidth - 380) / 2);
          }
          const cardTop = Math.max(14, Math.min(window.innerHeight - 290, rect.top));
          card.style.left = cardLeft + 'px';
          card.style.top = cardTop + 'px';
          card.style.bottom = 'auto';
        }
      }, 180);
    }
  }

  /* ==========================================================================
   * BINDING DE EVENTOS DA INTERFACE
   * ========================================================================== */
  function bindEvents() {
    // Recalcula em tempo real ao editar qualquer input/select
    document.querySelectorAll('.sidebar input, .sidebar select').forEach((el) => {
      el.addEventListener('input', () => recalculateAll(true));
      el.addEventListener('change', () => recalculateAll(true));
    });

    // Ferramentas de pinos no mapa
    document.querySelectorAll('.pin-btn[data-tool]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.activeTool = btn.dataset.tool;
        syncStateToInputs();
        saveState();
      });
    });

    // Trava de pinos (mobile safety)
    document.getElementById('btnLockPins')?.addEventListener('click', () => {
      state.pinsLocked = !state.pinsLocked;
      syncStateToInputs();
      recalculateAll(true);
    });

    document.getElementById('btnCenterMap')?.addEventListener('click', () => {
      M.fitBoundsToMission(state);
    });

    // Alternar Mapa Online vs Prancheta Offline 1:25.000
    document.getElementById('btnToggleMapMode')?.addEventListener('click', () => {
      state.offlineMap = !state.offlineMap;
      M.setMapMode(state.offlineMap);
      recalculateAll(true);
    });

    document.getElementById('btnGridZoomIn')?.addEventListener('click', () => {
      M.zoomGrid(1.22);
      recalculateAll(false);
    });
    document.getElementById('btnGridZoomOut')?.addEventListener('click', () => {
      M.zoomGrid(0.82);
      recalculateAll(false);
    });
    document.getElementById('btnGridFit')?.addEventListener('click', () => {
      M.resetGridFit();
      recalculateAll(false);
    });

    // Visão Noturna (Luz Vermelha)
    document.getElementById('btnNightMode')?.addEventListener('click', () => {
      state.nightMode = !state.nightMode;
      syncStateToInputs();
      saveState();
    });

    // Tela Ativa (Wake Lock)
    document.getElementById('btnWakeLock')?.addEventListener('click', () => {
      A.toggleWakeLock();
    });

    // Impressão Ficha A4
    document.getElementById('btnPrintSheet')?.addEventListener('click', () => {
      window.print();
    });

    // Exportar / Importar JSON
    document.getElementById('btnExportJson')?.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ctir-120mm-missao-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      appendLog('Missão exportada em arquivo JSON.');
    });

    document.getElementById('btnImportJson')?.addEventListener('click', () => {
      document.getElementById('importJsonInput')?.click();
    });

    document.getElementById('importJsonInput')?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const imported = JSON.parse(ev.target.result);
          state = { ...defaultState, ...imported };
          syncStateToInputs();
          renderLogsAndTargets();
          recalculateAll(true);
          M.fitBoundsToMission(state);
          appendLog(`Missão importada de "${file.name}".`);
        } catch (_) {
          alert('Arquivo JSON inválido.');
        }
      };
      reader.readAsText(file);
    });

    // GPS -> UTM
    document.getElementById('btnCaptureGps')?.addEventListener('click', () => {
      A.captureGpsUtm((gps) => {
        state.baseE = gps.easting;
        state.baseN = gps.northing;
        state.utmZone = gps.zone;
        state.utmHemi = gps.hemi;
        if (gps.alt !== null) state.baseAlt = gps.alt;
        syncStateToInputs();
        recalculateAll(true);
        M.fitBoundsToMission(state);
        appendLog(`Posição da Peça Base capturada via GPS: ${gps.easting}E ${gps.northing}N.`);
      });
    });

    // NOAA Declinação Magnética (QM)
    document.getElementById('btnFetchNoaa')?.addEventListener('click', () => {
      A.fetchNoaaDeclination(state, (qmMil, deg) => {
        state.magDeclination = qmMil;
        syncStateToInputs();
        recalculateAll(true);
        appendLog(`Declinação Magnética atualizada: ${G.formatSignedMil(qmMil)} (${deg.toFixed(2)}°).`);
      });
    });

    // Open-Meteo Meteorologia Balística
    document.getElementById('btnFetchMeteo')?.addEventListener('click', () => {
      A.fetchOpenMeteoBallistic(state, lastSolution, (meteo, fromCache) => {
        Object.assign(state, {
          windDir: meteo.windDir,
          windSpeed: meteo.windSpeed,
          windBalDir: meteo.windBalDir,
          windBalSpeed: meteo.windBalSpeed,
          airTemp: meteo.airTemp,
          airPressure: meteo.airPressure
        });
        syncStateToInputs();
        recalculateAll(true);
        appendLog(
          fromCache
            ? `Meteorologia restaurada do cache offline (${meteo.timestamp}).`
            : `Boletim Meteo Balístico aplicado (${meteo.airTemp}°C, ${meteo.airPressure} hPa, Vento Alt ${meteo.windBalSpeed} kt).`
        );
      });
    });

    // Open-Meteo Varredura de Relevo (28 pontos)
    document.getElementById('btnScanTerrain')?.addEventListener('click', () => {
      A.scanTerrainProfile(state, (res) => {
        state.terrainProfile = res.profile;
        state.baseAlt = res.baseAlt;
        state.targetAlt = res.targetAlt;
        state.crestDist = res.crestDist;
        state.crestAlt = res.crestAlt;
        syncStateToInputs();
        recalculateAll(true);
        appendLog(`Relevo varrido (28 pts): Crista crítica a ${res.crestDist} m (Cota ${res.crestAlt} m).`);
      });
    });

    // Busca de Localidade (Nominatim)
    const runGeoSearch = () => {
      const q = document.getElementById('geoSearchInput')?.value;
      A.searchNominatimLocation(q, (hit) => {
        const utm = G.latLngToUtm(hit.lat, hit.lng);
        state.utmZone = utm.zone;
        state.utmHemi = utm.hemi;
        state.targetE = utm.easting;
        state.targetN = utm.northing;
        state.placeName = hit.label;
        syncStateToInputs();
        recalculateAll(true);
        M.centerOnLatLng(hit.lat, hit.lng, 14);
        appendLog(`Setor localizado: ${hit.label} (${utm.easting}E ${utm.northing}N).`);
      });
    };
    document.getElementById('btnGeoSearch')?.addEventListener('click', runGeoSearch);
    document.getElementById('geoSearchInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') runGeoSearch();
    });

    // Voz Militar, Copiar e Compartilhar Comando de Tiro
    document.getElementById('btnSpeakCmd')?.addEventListener('click', () => {
      A.speakFireCommand(lastFireCommandText);
    });

    document.getElementById('btnCopyCmd')?.addEventListener('click', async () => {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(lastFireCommandText);
        appendLog('Comando de Tiro copiado para a área de transferência.');
      }
    });

    document.getElementById('btnShareMission')?.addEventListener('click', () => {
      A.shareMission('Comando de Tiro — Mrt P 120 mm M2R', lastFireCommandText);
    });

    // Alternar Painel Polar OA vs Bússola 6400'''
    document.getElementById('btnTogglePolar')?.addEventListener('click', () => {
      document.getElementById('polarBox')?.classList.toggle('open');
      document.getElementById('btnTogglePolar')?.classList.toggle('active');
    });

    document.getElementById('btnToggleCompass')?.addEventListener('click', () => {
      const box = document.getElementById('compassBox');
      const btn = document.getElementById('btnToggleCompass');
      const willOpen = !box?.classList.contains('open');
      box?.classList.toggle('open', willOpen);
      btn?.classList.toggle('active', willOpen);
      A.toggleTacticalCompass(willOpen, () => ({
        magDeclination: state.magDeclination,
        meridianConv: state.meridianConv
      }));
    });

    document.getElementById('btnUseCompassOa')?.addEventListener('click', () => {
      state.oaAz = A.getLastCompassNq();
      syncStateToInputs();
      recalculateAll(true);
    });

    document.getElementById('btnUseCompassFront')?.addEventListener('click', () => {
      state.frontAzimuth = A.getLastCompassNq();
      syncStateToInputs();
      recalculateAll(true);
    });

    // Ditado por Voz das Correções do OA
    document.getElementById('btnVoiceInput')?.addEventListener('click', () => {
      A.startVoiceOaRecognition((parsed) => {
        state.corrLR = parsed.lr;
        state.corrAD = parsed.ad;
        state.corrUD = parsed.ud;
        const elLR = document.getElementById('corrLR');
        const elAD = document.getElementById('corrAD');
        const elUD = document.getElementById('corrUD');
        if (elLR) elLR.value = parsed.lr;
        if (elAD) elAD.value = parsed.ad;
        if (elUD) elUD.value = parsed.ud;
      });
    });

    // Coordenadas Polares do OA -> Alvo
    document.getElementById('btnApplyPolar')?.addEventListener('click', () => {
      syncInputsToState();
      const azNQ = G.toGridAzimuth(
        state.oaAz,
        state.northRefSelect,
        state.magDeclination,
        state.meridianConv
      );
      const delta = G.polarDelta(state.oaDist, azNQ);
      state.targetE = Math.round(state.oaE + delta.dE);
      state.targetN = Math.round(state.oaN + delta.dN);
      state.targetAlt = Math.round(
        state.oaAlt + state.oaDist * Math.tan(state.oaSite * C.MIL_TO_RAD)
      );
      state.terrainProfile = null;
      syncStateToInputs();
      recalculateAll(true);
      M.fitBoundsToMission(state);
      appendLog(`Alvo locado por Polar OA: Az ${G.formatMil(azNQ)}, Dist ${state.oaDist} m.`);
    });

    // Correções de Regulação do OA (Fator K estritamente longitudinal)
    document.getElementById('btnApplyCorrection')?.addEventListener('click', () => {
      syncInputsToState();
      const lr = Number(document.getElementById('corrLR')?.value) || 0;
      const ad = Number(document.getElementById('corrAD')?.value) || 0;
      const ud = Number(document.getElementById('corrUD')?.value) || 0;

      if (lr === 0 && ad === 0 && ud === 0) return;

      const oaToTarget = G.inverseUtm(state.oaE, state.oaN, state.targetE, state.targetN);
      const gunToTarget = G.inverseUtm(state.baseE, state.baseN, state.targetE, state.targetN);

      // Atualiza Fator K exclusivamente pela projeção longitudinal no eixo Peça-Alvo
      state.factorK = B.accumulateLongitudinalFactorK(
        state.factorK,
        lr,
        ad,
        oaToTarget.azMil,
        gunToTarget.azMil,
        gunToTarget.dist
      );

      // Desloca coordenada do alvo conforme observação do OA
      const dLong = G.polarDelta(ad, oaToTarget.azMil);
      const dLat = G.polarDelta(lr, G.normMil(oaToTarget.azMil + 1600));
      state.targetE = Math.round(state.targetE + dLong.dE + dLat.dE);
      state.targetN = Math.round(state.targetN + dLong.dN + dLat.dN);
      state.targetAlt = Math.round(state.targetAlt + ud);

      // Limpa caixas de correção após aplicar
      ['corrLR', 'corrAD', 'corrUD'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = 0;
      });

      syncStateToInputs();
      recalculateAll(true);
      appendLog(
        `Correção OA aplicada (Dir/Esq ${lr}m, Along/Enc ${ad}m, Sub/Bax ${ud}m) → Fator K ${(state.factorK * 100).toFixed(1)}%.`
      );
    });

    document.getElementById('btnResetFactorK')?.addEventListener('click', () => {
      state.factorK = 0;
      recalculateAll(true);
      appendLog('Fator K acumulado zerado.');
    });

    // Salvar e Engajar Concentrações
    document.getElementById('btnSaveTarget')?.addEventListener('click', () => {
      const inp = document.getElementById('newTargetName');
      const name = (inp?.value || '').trim() || `AB ${1001 + state.savedTargets.length}`;
      state.savedTargets.push({
        name,
        e: state.targetE,
        n: state.targetN,
        alt: state.targetAlt
      });
      if (inp) inp.value = '';
      renderLogsAndTargets();
      recalculateAll(true);
      appendLog(`Concentração "${name}" registrada (${state.targetE}E ${state.targetN}N).`);
    });

    document.getElementById('savedTargetsList')?.addEventListener('click', (e) => {
      const engageIdx = e.target.dataset.engageTarget;
      const delIdx = e.target.dataset.delTarget;

      if (engageIdx !== undefined) {
        const t = state.savedTargets[Number(engageIdx)];
        if (t) {
          state.targetE = t.e;
          state.targetN = t.n;
          state.targetAlt = t.alt;
          state.terrainProfile = null;
          syncStateToInputs();
          recalculateAll(true);
          M.fitBoundsToMission(state);
          appendLog(`Engajando concentração salva "${t.name}".`);
        }
      } else if (delIdx !== undefined) {
        state.savedTargets.splice(Number(delIdx), 1);
        renderLogsAndTargets();
        recalculateAll(true);
      }
    });

    document.getElementById('btnClearLog')?.addEventListener('click', () => {
      state.missionLog = [];
      renderLogsAndTargets();
      saveState();
    });

    // Tutorial Spotlight
    document.getElementById('btnTutorial')?.addEventListener('click', () => openTutorial(0));
    document.getElementById('tutCloseBtn')?.addEventListener('click', closeTutorial);
    document.getElementById('tutPrevBtn')?.addEventListener('click', () => {
      if (currentTutStep > 0) {
        currentTutStep--;
        renderTutorialStep();
      }
    });
    document.getElementById('tutNextBtn')?.addEventListener('click', () => {
      if (currentTutStep < TUTORIAL_STEPS.length - 1) {
        currentTutStep++;
        renderTutorialStep();
      } else {
        closeTutorial();
      }
    });
  }

  /* Inicialização Principal */
  function bootstrap() {
    loadState();
    syncStateToInputs();
    renderLogsAndTargets();

    M.init({
      getActiveTool: () => state.activeTool,
      isPinsLocked: () => state.pinsLocked,
      onMoveTarget: (e, n) => {
        state.targetE = e;
        state.targetN = n;
        state.terrainProfile = null;
        syncStateToInputs();
        recalculateAll(true);
      },
      onMoveBase: (e, n) => {
        state.baseE = e;
        state.baseN = n;
        state.terrainProfile = null;
        syncStateToInputs();
        recalculateAll(true);
      },
      onMoveOa: (e, n) => {
        state.oaE = e;
        state.oaN = n;
        syncStateToInputs();
        recalculateAll(true);
      },
      onMoveCrest: (e, n) => {
        state.crestDist = Math.round(Math.hypot(e - state.baseE, n - state.baseN));
        syncStateToInputs();
        recalculateAll(true);
      },
      onMoveFriendly: (e, n) => {
        state.friendlyE = e;
        state.friendlyN = n;
        syncStateToInputs();
        recalculateAll(true);
      }
    });

    M.setMapMode(state.offlineMap);
    bindEvents();
    recalculateAll(false);
    M.fitBoundsToMission(state);

    // Geocodificação reversa inicial silenciosa para cabeçalho da ficha
    A.reverseGeocodeSector(state, (place) => {
      state.placeName = place;
      const hudPlace = document.getElementById('hudPlaceName');
      if (hudPlace) hudPlace.textContent = place;
      saveState();
    });

    // Exibe tutorial na primeira abertura se não tiver sido dispensado
    if (!localStorage.getItem(TUT_DISMISSED_KEY)) {
      setTimeout(() => openTutorial(0), 650);
    }
  }

  document.addEventListener('DOMContentLoaded', bootstrap);

  return {
    recalculateAll,
    openTutorial
  };
})();
