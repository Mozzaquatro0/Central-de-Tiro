/* ============================================================================
 * C TIR DIGITAL v5.0 — MÓDULO 5: MAPA TÁTICO LEAFLET, PRANCHETA OFFLINE 1:25.000
 * E PERFIL BALÍSTICO ASSIMÉTRICO (57%)
 * ============================================================================ */
window.CTIR = window.CTIR || {};

CTIR.MAP = (function () {
  const C = CTIR.CONSTANTS;
  const G = CTIR.GEO;

  let leafletMap = null;
  let overlayGroup = null;
  let initialized = false;
  let offlineMode = false;

  // Estado de navegação da Prancheta Offline 1:25.000
  let gridScalePxPerMeter = 0.085; // ~1:25.000 em tela padrão
  let gridPanX = 0;
  let gridPanY = 0;
  let isDraggingGrid = false;
  let dragStartX = 0;
  let dragStartY = 0;

  let callbacks = {
    onMoveTarget: null,
    onMoveBase: null,
    onMoveOa: null,
    onMoveCrest: null,
    onMoveFriendly: null,
    getActiveTool: () => 'target',
    isPinsLocked: () => false
  };

  function makePinIcon(label, bgColor, size = 28) {
    return L.divIcon({
      className: '',
      html: `<div class="tac-pin" style="width:${size}px;height:${size}px;background:${bgColor};">${label}</div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2]
    });
  }

  function init(cbs) {
    callbacks = { ...callbacks, ...cbs };

    const mapEl = document.getElementById('map');
    if (mapEl && typeof L !== 'undefined' && !initialized) {
      leafletMap = L.map('map', {
        zoomControl: true,
        attributionControl: false
      }).setView([-30.24, -54.93], 13);

      const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: 'OSM'
      });

      const satLayer = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 19, attribution: 'Esri' }
      );

      const topoLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        maxZoom: 17,
        attribution: 'OpenTopoMap'
      });

      satLayer.addTo(leafletMap);
      L.control
        .layers(
          {
            '🛰️ Satélite': satLayer,
            '🗺️ Mapa Urbano': osmLayer,
            '⛰️ Curvas de Nível': topoLayer
          },
          {},
          { position: 'topright' }
        )
        .addTo(leafletMap);

      overlayGroup = L.layerGroup().addTo(leafletMap);

      leafletMap.on('click', (e) => {
        if (callbacks.isPinsLocked()) return;
        const utm = G.latLngToUtm(e.latlng.lat, e.latlng.lng);
        const tool = callbacks.getActiveTool();
        if (tool === 'target' && callbacks.onMoveTarget) callbacks.onMoveTarget(utm.easting, utm.northing);
        else if (tool === 'base' && callbacks.onMoveBase) callbacks.onMoveBase(utm.easting, utm.northing);
        else if (tool === 'oa' && callbacks.onMoveOa) callbacks.onMoveOa(utm.easting, utm.northing);
        else if (tool === 'crest' && callbacks.onMoveCrest) callbacks.onMoveCrest(utm.easting, utm.northing);
        else if (tool === 'friendly' && callbacks.onMoveFriendly) callbacks.onMoveFriendly(utm.easting, utm.northing);
      });

      leafletMap.on('mousemove', (e) => {
        const utm = G.latLngToUtm(e.latlng.lat, e.latlng.lng);
        const hudUtm = document.getElementById('hudUtm');
        if (hudUtm) {
          hudUtm.textContent = `UTM: ${utm.zone}${utm.band} ${utm.easting}E ${utm.northing}N`;
        }
      });

      initialized = true;
    }

    setupOfflineCanvasEvents();
  }

  function setupOfflineCanvasEvents() {
    const canvas = document.getElementById('tacticalCanvas');
    if (!canvas) return;

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 0.87;
      gridScalePxPerMeter = Math.max(0.015, Math.min(0.6, gridScalePxPerMeter * factor));
      if (window.CTIR.APP) window.CTIR.APP.recalculateAll(false);
    }, { passive: false });

    canvas.addEventListener('pointerdown', (e) => {
      isDraggingGrid = true;
      dragStartX = e.clientX - gridPanX;
      dragStartY = e.clientY - gridPanY;
      canvas.dataset.downX = e.clientX;
      canvas.dataset.downY = e.clientY;
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!isDraggingGrid) return;
      gridPanX = e.clientX - dragStartX;
      gridPanY = e.clientY - dragStartY;
      if (window.CTIR.APP) window.CTIR.APP.recalculateAll(false);
    });

    canvas.addEventListener('pointerup', (e) => {
      const moved = Math.hypot(
        e.clientX - Number(canvas.dataset.downX || 0),
        e.clientY - Number(canvas.dataset.downY || 0)
      );
      isDraggingGrid = false;

      // Clique curto sem arrastar posiciona o pino selecionado
      if (moved < 6 && !callbacks.isPinsLocked() && lastRenderState) {
        const rect = canvas.getBoundingClientRect();
        const cx = e.clientX - rect.left - rect.width / 2 - gridPanX;
        const cy = e.clientY - rect.top - rect.height / 2 - gridPanY;
        const clickE = Math.round(lastRenderState.midE + cx / gridScalePxPerMeter);
        const clickN = Math.round(lastRenderState.midN - cy / gridScalePxPerMeter);

        const tool = callbacks.getActiveTool();
        if (tool === 'target' && callbacks.onMoveTarget) callbacks.onMoveTarget(clickE, clickN);
        else if (tool === 'base' && callbacks.onMoveBase) callbacks.onMoveBase(clickE, clickN);
        else if (tool === 'oa' && callbacks.onMoveOa) callbacks.onMoveOa(clickE, clickN);
        else if (tool === 'crest' && callbacks.onMoveCrest) callbacks.onMoveCrest(clickE, clickN);
        else if (tool === 'friendly' && callbacks.onMoveFriendly) callbacks.onMoveFriendly(clickE, clickN);
      }
    });
  }

  let lastRenderState = null;

  function setMapMode(isOffline) {
    offlineMode = Boolean(isOffline);
    const mapDiv = document.getElementById('map');
    const canvas = document.getElementById('tacticalCanvas');
    const gridCtrls = document.getElementById('gridControls');
    const btn = document.getElementById('btnToggleMapMode');

    if (offlineMode) {
      if (mapDiv) mapDiv.style.display = 'none';
      if (canvas) canvas.style.display = 'block';
      if (gridCtrls) gridCtrls.style.display = 'flex';
      if (btn) btn.textContent = '🛰️ Mapa Online';
    } else {
      if (mapDiv) mapDiv.style.display = 'block';
      if (canvas) canvas.style.display = 'none';
      if (gridCtrls) gridCtrls.style.display = 'none';
      if (btn) btn.textContent = '🗺️ Prancheta Offline';
      if (leafletMap) setTimeout(() => leafletMap.invalidateSize(), 60);
    }
  }

  function zoomGrid(factor) {
    gridScalePxPerMeter = Math.max(0.015, Math.min(0.6, gridScalePxPerMeter * factor));
  }

  function resetGridFit() {
    gridScalePxPerMeter = 0.085;
    gridPanX = 0;
    gridPanY = 0;
  }

  function fitBoundsToMission(state) {
    const pts = [
      G.utmToLatLng(state.baseE, state.baseN, state.utmZone, state.utmHemi),
      G.utmToLatLng(state.targetE, state.targetN, state.utmZone, state.utmHemi)
    ];
    if (state.oaE && state.oaN) {
      pts.push(G.utmToLatLng(state.oaE, state.oaN, state.utmZone, state.utmHemi));
    }
    if (leafletMap && !offlineMode) {
      const bounds = L.latLngBounds(pts.map((p) => [p.lat, p.lng]));
      leafletMap.fitBounds(bounds.pad(0.28));
    } else {
      resetGridFit();
    }
  }

  function centerOnLatLng(lat, lng, zoom = 14) {
    if (leafletMap && !offlineMode) {
      leafletMap.setView([lat, lng], zoom);
    }
  }

  /* Desenha elipse da Zona Batida (100 m x 50 m orientada no azimute de tiro) */
  function buildBeatenZonePolygon(targetE, targetN, azMil, zone, hemi) {
    const halfLen = 50; // 100 m longitudinal
    const halfWid = 25; // 50 m transversal
    const rad = G.normMil(azMil) * C.MIL_TO_RAD;
    const sinA = Math.sin(rad);
    const cosA = Math.cos(rad);
    const coords = [];

    for (let i = 0; i < 24; i++) {
      const theta = (i / 24) * 2 * Math.PI;
      const lx = halfWid * Math.cos(theta);
      const ly = halfLen * Math.sin(theta);
      const e = targetE + lx * cosA + ly * sinA;
      const n = targetN - lx * sinA + ly * cosA;
      const ll = G.utmToLatLng(e, n, zone, hemi);
      coords.push([ll.lat, ll.lng]);
    }
    return coords;
  }

  /* Renderiza no Leaflet */
  function renderLeaflet(state, solution) {
    if (!leafletMap || !overlayGroup) return;
    overlayGroup.clearLayers();

    const zone = state.utmZone;
    const hemi = state.utmHemi;
    const locked = callbacks.isPinsLocked();

    const baseLL = G.utmToLatLng(state.baseE, state.baseN, zone, hemi);
    const targetLL = G.utmToLatLng(state.targetE, state.targetN, zone, hemi);

    // Anel de alcance máximo da munição selecionada
    L.circle([baseLL.lat, baseLL.lng], {
      radius: solution.ammoMeta.maxRange,
      color: '#58a6ff',
      weight: 1.2,
      dashArray: '6, 6',
      fillOpacity: 0.02
    }).addTo(overlayGroup);

    // Anel de alcance mínimo
    L.circle([baseLL.lat, baseLL.lng], {
      radius: solution.ammoMeta.minRange,
      color: '#d29922',
      weight: 1,
      dashArray: '4, 4',
      fillOpacity: 0.03
    }).addTo(overlayGroup);

    // Linha de Tiro (Peça Base -> Alvo)
    const lineColor = solution.anyOutOfRange || solution.crestResult.blocked ? '#f85149' : '#3fb950';
    L.polyline(
      [
        [baseLL.lat, baseLL.lng],
        [targetLL.lat, targetLL.lng]
      ],
      { color: lineColor, weight: 2.5 }
    ).addTo(overlayGroup);

    // Cone de segurança lateral (±150''' em torno da linha de tiro)
    const dist = Math.max(200, solution.baseSolved.distM);
    const leftEdge = G.polarDelta(dist, G.normMil(solution.baseSolved.azNQ - 150));
    const rightEdge = G.polarDelta(dist, G.normMil(solution.baseSolved.azNQ + 150));
    const leftLL = G.utmToLatLng(state.baseE + leftEdge.dE, state.baseN + leftEdge.dN, zone, hemi);
    const rightLL = G.utmToLatLng(state.baseE + rightEdge.dE, state.baseN + rightEdge.dN, zone, hemi);

    L.polygon(
      [
        [baseLL.lat, baseLL.lng],
        [leftLL.lat, leftLL.lng],
        [targetLL.lat, targetLL.lng],
        [rightLL.lat, rightLL.lng]
      ],
      { color: '#3fb950', weight: 1, dashArray: '3, 5', fillColor: '#3fb950', fillOpacity: 0.06 }
    ).addTo(overlayGroup);

    // Zona Batida orientada (100 m x 50 m)
    const beatenCoords = buildBeatenZonePolygon(
      state.targetE,
      state.targetN,
      solution.baseSolved.fireAzNQ,
      zone,
      hemi
    );
    L.polygon(beatenCoords, {
      color: '#f85149',
      weight: 1.5,
      fillColor: '#f85149',
      fillOpacity: 0.24
    }).addTo(overlayGroup);

    // Marcadores das 4 Peças
    solution.pieces.forEach((p) => {
      const pLL = G.utmToLatLng(p.e, p.n, zone, hemi);
      const marker = L.marker([pLL.lat, pLL.lng], {
        icon: makePinIcon(String(p.number), p.isBase ? '#238636' : '#1f6feb', p.isBase ? 28 : 22),
        draggable: p.isBase && !locked
      }).addTo(overlayGroup);

      marker.bindTooltip(`${p.label}${p.isBase ? ' (BASE)' : ''}<br>Alça: ${p.alcaMil}'''`, {
        direction: 'top'
      });

      if (p.isBase && !locked) {
        marker.on('dragend', (ev) => {
          const ll = ev.target.getLatLng();
          const u = G.latLngToUtm(ll.lat, ll.lng, zone);
          if (callbacks.onMoveBase) callbacks.onMoveBase(u.easting, u.northing);
        });
      }
    });

    // Marcador do Alvo
    const targetMarker = L.marker([targetLL.lat, targetLL.lng], {
      icon: makePinIcon('🎯', '#da3633', 30),
      draggable: !locked
    }).addTo(overlayGroup);

    targetMarker.bindTooltip(
      `ALVO • ${solution.baseSolved.distM} m • Az ${G.formatMil(solution.baseSolved.azNQ)}`,
      { direction: 'top' }
    );

    if (!locked) {
      targetMarker.on('dragend', (ev) => {
        const ll = ev.target.getLatLng();
        const u = G.latLngToUtm(ll.lat, ll.lng, zone);
        if (callbacks.onMoveTarget) callbacks.onMoveTarget(u.easting, u.northing);
      });
    }

    // Marcador do Observador Avançado (OA)
    if (state.oaE && state.oaN) {
      const oaLL = G.utmToLatLng(state.oaE, state.oaN, zone, hemi);
      L.polyline(
        [
          [oaLL.lat, oaLL.lng],
          [targetLL.lat, targetLL.lng]
        ],
        { color: '#58a6ff', weight: 1.5, dashArray: '5, 5' }
      ).addTo(overlayGroup);

      const oaMarker = L.marker([oaLL.lat, oaLL.lng], {
        icon: makePinIcon('OA', '#1f6feb', 26),
        draggable: !locked
      }).addTo(overlayGroup);

      if (!locked) {
        oaMarker.on('dragend', (ev) => {
          const ll = ev.target.getLatLng();
          const u = G.latLngToUtm(ll.lat, ll.lng, zone);
          if (callbacks.onMoveOa) callbacks.onMoveOa(u.easting, u.northing);
        });
      }
    }

    // Marcador da Crista Intermediária (se definida)
    if (Number(state.crestDist) > 10 && Number(state.crestDist) < solution.baseSolved.distM) {
      const crestDelta = G.polarDelta(Number(state.crestDist), solution.baseSolved.azNQ);
      const crestLL = G.utmToLatLng(
        state.baseE + crestDelta.dE,
        state.baseN + crestDelta.dN,
        zone,
        hemi
      );
      L.marker([crestLL.lat, crestLL.lng], {
        icon: makePinIcon('⛰️', solution.crestResult.blocked ? '#da3633' : '#d29922', 24)
      })
        .bindTooltip(`Crista: ${state.crestDist}m | Cota ${state.crestAlt}m`)
        .addTo(overlayGroup);
    }

    // Tropas Amigas & Círculo TSZ
    if (state.friendlyE && state.friendlyN) {
      const fLL = G.utmToLatLng(state.friendlyE, state.friendlyN, zone, hemi);
      const rad = Number(state.friendlyRadius) || 400;
      L.circle([fLL.lat, fLL.lng], {
        radius: rad,
        color: '#f85149',
        weight: 2,
        fillColor: '#f85149',
        fillOpacity: 0.16
      }).addTo(overlayGroup);

      const fMarker = L.marker([fLL.lat, fLL.lng], {
        icon: makePinIcon('🛡️', '#2ea043', 26),
        draggable: !locked
      }).addTo(overlayGroup);

      if (!locked) {
        fMarker.on('dragend', (ev) => {
          const ll = ev.target.getLatLng();
          const u = G.latLngToUtm(ll.lat, ll.lng, zone);
          if (callbacks.onMoveFriendly) callbacks.onMoveFriendly(u.easting, u.northing);
        });
      }
    }

    // Concentrações / Alvos Salvos
    (state.savedTargets || []).forEach((st) => {
      const sLL = G.utmToLatLng(st.e, st.n, zone, hemi);
      const icon = L.divIcon({
        className: '',
        html: `<div class="tac-pin-saved">${st.name}</div>`,
        iconSize: [54, 18],
        iconAnchor: [27, 9]
      });
      L.marker([sLL.lat, sLL.lng], { icon }).addTo(overlayGroup);
    });
  }

  /* Renderiza na Prancheta Topográfica Offline 1:25.000 (<canvas>) */
  function renderOfflineCanvas(state, solution) {
    const canvas = document.getElementById('tacticalCanvas');
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(300, rect.width * dpr);
    canvas.height = Math.max(300, rect.height * dpr);

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const w = rect.width;
    const h = rect.height;
    const midE = (Number(state.baseE) + Number(state.targetE)) / 2;
    const midN = (Number(state.baseN) + Number(state.targetN)) / 2;
    lastRenderState = { midE, midN };

    const toPx = (e, n) => ({
      x: w / 2 + gridPanX + (e - midE) * gridScalePxPerMeter,
      y: h / 2 + gridPanY - (n - midN) * gridScalePxPerMeter
    });

    // Fundo da prancheta
    ctx.fillStyle = '#0c1218';
    ctx.fillRect(0, 0, w, h);

    // Quadrícula UTM de 1.000 m (1 km)
    const stepM = 1000;
    const minE = Math.floor((midE - (w / 2 + Math.abs(gridPanX)) / gridScalePxPerMeter) / stepM) * stepM;
    const maxE = Math.ceil((midE + (w / 2 + Math.abs(gridPanX)) / gridScalePxPerMeter) / stepM) * stepM;
    const minN = Math.floor((midN - (h / 2 + Math.abs(gridPanY)) / gridScalePxPerMeter) / stepM) * stepM;
    const maxN = Math.ceil((midN + (h / 2 + Math.abs(gridPanY)) / gridScalePxPerMeter) / stepM) * stepM;

    ctx.strokeStyle = 'rgba(88, 166, 255, 0.16)';
    ctx.lineWidth = 1;
    ctx.font = '10px Consolas, monospace';
    ctx.fillStyle = '#6e8299';

    for (let e = minE; e <= maxE; e += stepM) {
      const p = toPx(e, midN);
      ctx.beginPath();
      ctx.moveTo(p.x, 0);
      ctx.lineTo(p.x, h);
      ctx.stroke();
      ctx.fillText(String(e).slice(-5, -3) + 'k E', p.x + 3, h - 42);
    }

    for (let n = minN; n <= maxN; n += stepM) {
      const p = toPx(midE, n);
      ctx.beginPath();
      ctx.moveTo(0, p.y);
      ctx.lineTo(w, p.y);
      ctx.stroke();
      ctx.fillText(String(n).slice(-5, -3) + 'k N', 6, p.y - 3);
    }

    const basePx = toPx(state.baseE, state.baseN);
    const targetPx = toPx(state.targetE, state.targetN);

    // Anel de alcance máximo
    ctx.strokeStyle = 'rgba(88, 166, 255, 0.45)';
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.arc(basePx.x, basePx.y, solution.ammoMeta.maxRange * gridScalePxPerMeter, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.setLineDash([]);

    // Linha de tiro Peça Base -> Alvo
    ctx.strokeStyle = solution.anyOutOfRange ? '#f85149' : '#3fb950';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(basePx.x, basePx.y);
    ctx.lineTo(targetPx.x, targetPx.y);
    ctx.stroke();

    // Linha OA -> Alvo
    if (state.oaE && state.oaN) {
      const oaPx = toPx(state.oaE, state.oaN);
      ctx.strokeStyle = '#58a6ff';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(oaPx.x, oaPx.y);
      ctx.lineTo(targetPx.x, targetPx.y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#1f6feb';
      ctx.beginPath();
      ctx.arc(oaPx.x, oaPx.y, 9, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText('OA', oaPx.x - 6, oaPx.y + 3);
    }

    // TSZ Tropas Amigas
    if (state.friendlyE && state.friendlyN) {
      const fPx = toPx(state.friendlyE, state.friendlyN);
      const radPx = (Number(state.friendlyRadius) || 400) * gridScalePxPerMeter;
      ctx.fillStyle = 'rgba(248, 81, 73, 0.16)';
      ctx.strokeStyle = '#f85149';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(fPx.x, fPx.y, radPx, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
    }

    // 4 Peças
    solution.pieces.forEach((p) => {
      const pp = toPx(p.e, p.n);
      ctx.fillStyle = p.isBase ? '#238636' : '#1f6feb';
      ctx.beginPath();
      ctx.arc(pp.x, pp.y, p.isBase ? 9 : 7, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.fillText(String(p.number), pp.x - 3, pp.y + 3);
    });

    // Alvo
    ctx.fillStyle = '#da3633';
    ctx.beginPath();
    ctx.arc(targetPx.x, targetPx.y, 10, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.fillText('ALVO', targetPx.x + 12, targetPx.y + 4);

    // Rosa dos Ventos (NQ) no canto superior esquerdo
    const rx = 34;
    const ry = 88;
    ctx.strokeStyle = '#3fb950';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(rx, ry + 16);
    ctx.lineTo(rx, ry - 16);
    ctx.lineTo(rx - 4, ry - 10);
    ctx.moveTo(rx, ry - 16);
    ctx.lineTo(rx + 4, ry - 10);
    ctx.stroke();
    ctx.fillStyle = '#3fb950';
    ctx.fillText('NQ', rx - 7, ry - 20);
  }

  /* Renderiza o mini-perfil lateral de trajetória assimétrica (57%) e relevo */
  function renderProfileCanvas(state, solution) {
    const canvas = document.getElementById('profileCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#10161c';
    ctx.fillRect(0, 0, w, h);

    const totalRange = Math.max(100, solution.baseSolved.distM);
    const gunAlt = Number(state.baseAlt) || 0;
    const targetAlt = Number(state.targetAlt) || 0;
    const apexAboveGun = solution.baseSolved.apexM || 500;
    const peakAlt = gunAlt + apexAboveGun;

    const minY = Math.min(gunAlt, targetAlt, Number(state.crestAlt) || gunAlt) - 20;
    const maxY = Math.max(peakAlt, Number(state.crestAlt) || peakAlt) + 60;
    const spanY = Math.max(50, maxY - minY);

    const toX = (dist) => 12 + (dist / totalRange) * (w - 24);
    const toY = (alt) => h - 10 - ((alt - minY) / spanY) * (h - 20);

    // Perfil do terreno (varrido ou interpolado)
    ctx.beginPath();
    ctx.moveTo(toX(0), h);
    if (Array.isArray(state.terrainProfile) && state.terrainProfile.length > 2) {
      for (const pt of state.terrainProfile) {
        ctx.lineTo(toX(pt.dist), toY(pt.alt));
      }
    } else {
      ctx.lineTo(toX(0), toY(gunAlt));
      if (Number(state.crestDist) > 10 && Number(state.crestDist) < totalRange) {
        ctx.lineTo(toX(Number(state.crestDist)), toY(Number(state.crestAlt)));
      }
      ctx.lineTo(toX(totalRange), toY(targetAlt));
    }
    ctx.lineTo(toX(totalRange), h);
    ctx.closePath();
    ctx.fillStyle = 'rgba(139, 155, 176, 0.25)';
    ctx.fill();

    // Arco da trajetória assimétrica (ápice a 57%)
    ctx.beginPath();
    const steps = 40;
    for (let i = 0; i <= steps; i++) {
      const dist = (i / steps) * totalRange;
      const alt = CTIR.BALLISTICS.trajectoryAltitudeAt(
        dist,
        totalRange,
        gunAlt,
        targetAlt,
        apexAboveGun
      );
      const px = toX(dist);
      const py = toY(alt);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = solution.crestResult.blocked ? '#f85149' : '#3fb950';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Marcação da crista crítica
    if (solution.crestResult.hasCrest) {
      const cx = toX(solution.crestResult.crestDist);
      const cy = toY(solution.crestResult.crestAlt);
      ctx.fillStyle = solution.crestResult.blocked ? '#f85149' : '#d29922';
      ctx.beginPath();
      ctx.arc(cx, cy, 3.5, 0, 2 * Math.PI);
      ctx.fill();
    }
  }

  function renderAll(state, solution) {
    if (offlineMode) renderOfflineCanvas(state, solution);
    else renderLeaflet(state, solution);
    renderProfileCanvas(state, solution);
  }

  return {
    init,
    setMapMode,
    zoomGrid,
    resetGridFit,
    fitBoundsToMission,
    centerOnLatLng,
    renderAll
  };
})();
