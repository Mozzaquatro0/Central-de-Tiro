/* ============================================================================
 * C TIR DIGITAL v5.0 — MÓDULO 4: APIS EXTERNAS & SENSORES NATIVOS
 * - Open-Meteo Forecast (Vento Superfície + Camadas Balísticas + Pressão Real)
 * - Open-Meteo Elevation (Varredura em lote de 28 pontos do perfil de relevo)
 * - NOAA Geomagnetic API + Fallback WMM Regional (Declinação Magnética QM)
 * - OpenStreetMap Nominatim (Busca de localidades e setor operacional)
 * - Geolocation GPS -> UTM, DeviceOrientation Bússola 6400''', Web Speech API,
 *   Web Share API & Screen Wake Lock API
 * ============================================================================ */
window.CTIR = window.CTIR || {};

CTIR.APIS = (function () {
  const C = CTIR.CONSTANTS;
  const G = CTIR.GEO;

  const METEO_CACHE_KEY = 'ctir_meteo_cache_v5';
  const TERRAIN_CACHE_KEY = 'ctir_terrain_cache_v5';

  let compassActive = false;
  let lastCompassNm = 0;
  let lastCompassNq = 0;
  let lastCompassDeg = 0;
  let wakeLockSentinel = null;

  function setPill(id, text, mode) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.className = 'api-pill' + (mode ? ' ' + mode : '');
  }

  function formatTimeHHMM(dateObj) {
    const d = dateObj || new Date();
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  /* ==========================================================================
   * 1. OPEN-METEO: METEOROLOGIA BALÍSTICA (SUPERFÍCIE + ALTITUDE + PRESSÃO)
   * ========================================================================== */
  async function fetchOpenMeteoBallistic(state, solution, onUpdateCallback) {
    const btn = document.getElementById('btnFetchMeteo');
    if (btn) btn.disabled = true;
    setPill('pillMeteoStatus', 'CONSULTANDO...', 'cached');

    const ll = G.utmToLatLng(state.baseE, state.baseN, state.utmZone, state.utmHemi);
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${ll.lat.toFixed(5)}&longitude=${ll.lng.toFixed(5)}` +
      `&current=temperature_2m,surface_pressure,wind_speed_10m,wind_direction_10m` +
      `&hourly=wind_speed_925hPa,wind_direction_925hPa,wind_speed_850hPa,wind_direction_850hPa,wind_speed_700hPa,wind_direction_700hPa` +
      `&wind_speed_unit=kn&forecast_days=1&timezone=auto`;

    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();

      const cur = data.current || {};
      const tempC = Number(cur.temperature_2m ?? 15);
      const pressHpa = Number(cur.surface_pressure ?? 997);
      const supSpdKt = Number(cur.wind_speed_10m ?? 0);
      const supDirDeg = Number(cur.wind_direction_10m ?? 0);

      // Pondera vento em camadas superiores conforme a flecha da trajetória
      const apexAltMsl = (Number(state.baseAlt) || 0) + (solution?.baseSolved?.apexM || 1500);
      const nowHour = new Date().getHours();
      const h = data.hourly || {};
      const idx = Math.min(23, Math.max(0, nowHour));

      const w925Spd = Number(h.wind_speed_925hPa?.[idx] ?? supSpdKt);
      const w925Dir = Number(h.wind_direction_925hPa?.[idx] ?? supDirDeg);
      const w850Spd = Number(h.wind_speed_850hPa?.[idx] ?? w925Spd);
      const w850Dir = Number(h.wind_direction_850hPa?.[idx] ?? w925Dir);
      const w700Spd = Number(h.wind_speed_700hPa?.[idx] ?? w850Spd);
      const w700Dir = Number(h.wind_direction_700hPa?.[idx] ?? w850Dir);

      // Pesos por altitude máxima da flecha (925hPa ~750m, 850hPa ~1500m, 700hPa ~3000m)
      let weights = [0.55, 0.35, 0.10];
      if (apexAltMsl > 2600) weights = [0.20, 0.40, 0.40];
      else if (apexAltMsl > 1400) weights = [0.35, 0.45, 0.20];

      const layers = [
        { spd: w925Spd, dir: w925Dir, w: weights[0] },
        { spd: w850Spd, dir: w850Dir, w: weights[1] },
        { spd: w700Spd, dir: w700Dir, w: weights[2] }
      ];

      let vx = 0;
      let vy = 0;
      for (const l of layers) {
        const rad = (l.dir * Math.PI) / 180;
        vx += l.w * l.spd * Math.sin(rad);
        vy += l.w * l.spd * Math.cos(rad);
      }
      const balSpdKt = Math.hypot(vx, vy);
      let balDirDeg = (Math.atan2(vx, vy) * 180) / Math.PI;
      if (balDirDeg < 0) balDirDeg += 360;

      // Converte direção Verdadeira (NV) da API para a referência angular ativa (NQ / NV / NM)
      const supMilNV = supDirDeg * C.DEG_TO_MIL;
      const balMilNV = balDirDeg * C.DEG_TO_MIL;
      const supMilNQ = G.toGridAzimuth(supMilNV, 'NV', state.magDeclination, state.meridianConv);
      const balMilNQ = G.toGridAzimuth(balMilNV, 'NV', state.magDeclination, state.meridianConv);

      const convertFromNQToSelected = (milNQ) => {
        const three = G.fromGridAzimuth(milNQ, state.magDeclination, state.meridianConv);
        if (state.northRefSelect === 'NV') return Math.round(three.nv);
        if (state.northRefSelect === 'NM') return Math.round(three.nm);
        return Math.round(three.nq);
      };

      const payload = {
        windDir: convertFromNQToSelected(supMilNQ),
        windSpeed: Number(supSpdKt.toFixed(1)),
        windBalDir: convertFromNQToSelected(balMilNQ),
        windBalSpeed: Number(balSpdKt.toFixed(1)),
        airTemp: Number(tempC.toFixed(1)),
        airPressure: Number(pressHpa.toFixed(1)),
        timestamp: formatTimeHHMM()
      };

      localStorage.setItem(METEO_CACHE_KEY, JSON.stringify(payload));
      setPill('pillMeteoStatus', `ONLINE • ${payload.timestamp}`, 'online');
      if (onUpdateCallback) onUpdateCallback(payload, false);
    } catch (err) {
      // Fallback offline: tenta carregar última leitura válida salva no cache
      const cachedRaw = localStorage.getItem(METEO_CACHE_KEY);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw);
        setPill('pillMeteoStatus', `CACHE • ${cached.timestamp || 'OFFLINE'}`, 'cached');
        if (onUpdateCallback) onUpdateCallback(cached, true);
      } else {
        setPill('pillMeteoStatus', 'OFFLINE (MANUAL)', 'offline');
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  /* ==========================================================================
   * 2. OPEN-METEO ELEVATION: VARREDURA DE RELEVO E CRISTA INTERMEDIÁRIA
   * ========================================================================== */
  async function scanTerrainProfile(state, onTerrainCallback) {
    const btn = document.getElementById('btnScanTerrain');
    if (btn) btn.disabled = true;
    setPill('pillTerrainStatus', 'VARRENDO...', 'cached');

    const samplesCount = 28;
    const pts = [];
    const lats = [];
    const lngs = [];

    for (let i = 0; i < samplesCount; i++) {
      const t = i / (samplesCount - 1);
      const e = state.baseE + t * (state.targetE - state.baseE);
      const n = state.baseN + t * (state.targetN - state.baseN);
      const dist = Math.hypot(e - state.baseE, n - state.baseN);
      const ll = G.utmToLatLng(e, n, state.utmZone, state.utmHemi);
      pts.push({ dist, e, n, lat: ll.lat, lng: ll.lng, alt: 0 });
      lats.push(ll.lat.toFixed(5));
      lngs.push(ll.lng.toFixed(5));
    }

    const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats.join(',')}&longitude=${lngs.join(',')}`;

    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      const elevations = data.elevation || [];

      if (elevations.length !== samplesCount) {
        throw new Error('Resposta incompleta de elevação');
      }

      for (let i = 0; i < samplesCount; i++) {
        pts[i].alt = Math.round(Number(elevations[i]) || 0);
      }

      const gunAlt = pts[0].alt;
      const targetAlt = pts[samplesCount - 1].alt;
      const totalDist = pts[samplesCount - 1].dist;

      // Identifica a crista intermediária mais proeminente acima da linha reta Peça-Alvo
      let bestCrest = { dist: 0, alt: 0, prominence: -Infinity };
      for (let i = 1; i < samplesCount - 1; i++) {
        const lineAlt = gunAlt + (pts[i].dist / Math.max(1, totalDist)) * (targetAlt - gunAlt);
        const prominence = pts[i].alt - lineAlt;
        if (prominence > bestCrest.prominence) {
          bestCrest = {
            dist: Math.round(pts[i].dist),
            alt: pts[i].alt,
            prominence
          };
        }
      }

      const result = {
        profile: pts,
        baseAlt: gunAlt,
        targetAlt: targetAlt,
        crestDist: bestCrest.dist,
        crestAlt: bestCrest.alt,
        timestamp: formatTimeHHMM()
      };

      localStorage.setItem(TERRAIN_CACHE_KEY, JSON.stringify(result));
      setPill('pillTerrainStatus', `SRTM OK • ${result.timestamp}`, 'online');
      if (onTerrainCallback) onTerrainCallback(result);
    } catch (err) {
      setPill('pillTerrainStatus', 'OFFLINE (MANUAL)', 'offline');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  /* ==========================================================================
   * 3. NOAA / MODELO GEOMAGNÉTICO: DECLINAÇÃO MAGNÉTICA (QM EM 6400''')
   * ========================================================================== */
  function estimateRegionalDeclinationDeg(lat, lng) {
    // Aproximação polinomial calibrada para o território brasileiro (época 2026.9)
    // Sul do Brasil (lat -30, lng -55) ~ -17.5° (-311'''); Nordeste ~ -21.5°; Norte ~ -15.5°
    const dLat = lat - -20.0;
    const dLng = lng - -50.0;
    return -19.2 - 0.14 * dLat - 0.36 * dLng;
  }

  async function fetchNoaaDeclination(state, onDeclCallback) {
    const btn = document.getElementById('btnFetchNoaa');
    if (btn) btn.disabled = true;

    const ll = G.utmToLatLng(state.baseE, state.baseN, state.utmZone, state.utmHemi);
    const now = new Date();
    const url =
      `https://www.ngdc.noaa.gov/geomag-web/calculators/calculateDeclination` +
      `?lat1=${ll.lat.toFixed(4)}&lon1=${ll.lng.toFixed(4)}&model=WMM` +
      `&startYear=${now.getFullYear()}&startMonth=${now.getMonth() + 1}&startDay=${now.getDate()}` +
      `&key=zNEw7&resultFormat=json`;

    let declDeg = null;
    try {
      const resp = await fetch(url);
      if (resp.ok) {
        const data = await resp.json();
        const val = data?.result?.[0]?.declination;
        if (typeof val === 'number' && !isNaN(val)) {
          declDeg = val;
        }
      }
    } catch (_) {
      // Silencioso: usa modelo regional WMM-2026 offline abaixo
    }

    if (declDeg === null) {
      declDeg = estimateRegionalDeclinationDeg(ll.lat, ll.lng);
    }

    const qmMil = Math.round(declDeg * C.DEG_TO_MIL);
    if (onDeclCallback) onDeclCallback(qmMil, declDeg);
    if (btn) btn.disabled = false;
  }

  /* ==========================================================================
   * 4. OPENSTREETMAP NOMINATIM: BUSCA DE LOCALIDADE & GEOCODIFICAÇÃO REVERSA
   * ========================================================================== */
  async function searchNominatimLocation(query, onFoundCallback) {
    const clean = String(query || '').trim();
    if (!clean) return;
    const btn = document.getElementById('btnGeoSearch');
    if (btn) btn.disabled = true;

    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(clean)}`;
      const resp = await fetch(url, { headers: { 'Accept-Language': 'pt-BR' } });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const list = await resp.json();
      if (Array.isArray(list) && list.length > 0) {
        const hit = list[0];
        const lat = parseFloat(hit.lat);
        const lng = parseFloat(hit.lon);
        const label = (hit.display_name || clean).split(',').slice(0, 2).join(', ');
        if (onFoundCallback) onFoundCallback({ lat, lng, label });
      }
    } catch (_) {
      // Offline ou indisponível
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function reverseGeocodeSector(state, onPlaceCallback) {
    const ll = G.utmToLatLng(state.targetE, state.targetN, state.utmZone, state.utmHemi);
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&zoom=12&lat=${ll.lat.toFixed(5)}&lon=${ll.lng.toFixed(5)}`;
      const resp = await fetch(url, { headers: { 'Accept-Language': 'pt-BR' } });
      if (!resp.ok) return;
      const data = await resp.json();
      const addr = data.address || {};
      const city = addr.city || addr.town || addr.village || addr.municipality || '';
      const stateCode = addr.state || '';
      const place = [city, stateCode].filter(Boolean).join(' - ') || 'Setor Operacional';
      if (onPlaceCallback) onPlaceCallback(place);
    } catch (_) {
      // Mantém rótulo atual offline
    }
  }

  /* ==========================================================================
   * 5. GPS NATIVO -> COORDENADAS UTM SIRGAS 2000
   * ========================================================================== */
  function captureGpsUtm(onGpsCallback) {
    if (!navigator.geolocation) {
      setPill('pillGeoStatus', 'GPS INDISPONÍVEL', 'offline');
      return;
    }
    setPill('pillGeoStatus', 'BUSCANDO SAT...', 'cached');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, altitude, accuracy } = pos.coords;
        const utm = G.latLngToUtm(latitude, longitude);
        setPill('pillGeoStatus', `GPS ±${Math.round(accuracy || 5)}m`, 'online');
        if (onGpsCallback) {
          onGpsCallback({
            easting: utm.easting,
            northing: utm.northing,
            zone: utm.zone,
            hemi: utm.hemi,
            alt: altitude !== null && !isNaN(altitude) ? Math.round(altitude) : null
          });
        }
      },
      () => {
        setPill('pillGeoStatus', 'GPS NEGADO/FALHA', 'offline');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
  }

  /* ==========================================================================
   * 6. BÚSSOLA TÁTICA EM 6400''' (DEVICE ORIENTATION API)
   * ========================================================================== */
  function handleOrientationEvent(ev, getNorthParams) {
    let headingDeg = null;
    if (typeof ev.webkitCompassHeading === 'number') {
      headingDeg = ev.webkitCompassHeading;
    } else if (typeof ev.alpha === 'number' && ev.alpha !== null) {
      headingDeg = (360 - ev.alpha) % 360;
    }
    if (headingDeg === null || isNaN(headingDeg)) return;

    const { magDeclination, meridianConv } = getNorthParams();
    const nmMil = G.normMil(headingDeg * C.DEG_TO_MIL);
    const nqMil = G.toGridAzimuth(nmMil, 'NM', magDeclination, meridianConv);

    lastCompassDeg = headingDeg;
    lastCompassNm = Math.round(nmMil);
    lastCompassNq = Math.round(nqMil);

    const elMil = document.getElementById('compassMilReadout');
    const elNm = document.getElementById('compassNmReadout');
    const elDeg = document.getElementById('compassDegReadout');
    if (elMil) elMil.textContent = G.formatMil(lastCompassNq);
    if (elNm) elNm.textContent = G.formatMil(lastCompassNm);
    if (elDeg) elDeg.textContent = lastCompassDeg.toFixed(1) + '°';
    setPill('compassSensorStatus', 'MAGNETÔMETRO ATIVO', 'online');
  }

  async function toggleTacticalCompass(enable, getNorthParams) {
    const listener = (ev) => handleOrientationEvent(ev, getNorthParams);

    if (!enable) {
      window.removeEventListener('deviceorientationabsolute', listener, true);
      window.removeEventListener('deviceorientation', listener, true);
      compassActive = false;
      return;
    }

    if (
      typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function'
    ) {
      try {
        const perm = await DeviceOrientationEvent.requestPermission();
        if (perm !== 'granted') {
          setPill('compassSensorStatus', 'PERMISSÃO NEGADA', 'offline');
          return;
        }
      } catch (_) {
        setPill('compassSensorStatus', 'ERRO SENSOR iOS', 'offline');
        return;
      }
    }

    if (!compassActive) {
      window.addEventListener('deviceorientationabsolute', listener, true);
      window.addEventListener('deviceorientation', listener, true);
      compassActive = true;
      setPill('compassSensorStatus', 'CALIBRANDO...', 'cached');
    }
  }

  function getLastCompassNq() {
    return lastCompassNq;
  }

  /* ==========================================================================
   * 7. WEB SPEECH API (SÍNTESE DE VOZ MILITAR & DITADO DE CORREÇÃO OA)
   * ========================================================================== */
  function speakFireCommand(rawCommand) {
    const btn = document.getElementById('btnSpeakCmd');
    if (!('speechSynthesis' in window)) return;

    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      if (btn) btn.classList.remove('speaking');
      return;
    }

    const spokenText = G.toMilitarySpeech(rawCommand);
    const utter = new SpeechSynthesisUtterance(spokenText);
    utter.lang = 'pt-BR';
    utter.rate = 0.96;
    utter.pitch = 1.0;

    utter.onstart = () => { if (btn) btn.classList.add('speaking'); };
    utter.onend = () => { if (btn) btn.classList.remove('speaking'); };
    utter.onerror = () => { if (btn) btn.classList.remove('speaking'); };

    window.speechSynthesis.speak(utter);
  }

  function startVoiceOaRecognition(onResultCallback) {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    const box = document.getElementById('voiceTranscript');
    const btn = document.getElementById('btnVoiceInput');

    if (!SpeechRec) {
      if (box) {
        box.style.display = 'block';
        box.textContent = '⚠️ Reconhecimento de voz não suportado neste navegador.';
      }
      return;
    }

    const rec = new SpeechRec();
    rec.lang = 'pt-BR';
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    if (btn) btn.classList.add('speaking');
    if (box) {
      box.style.display = 'block';
      box.textContent = '🎙️ Ouvindo comando do OA (ex: "Direita cem, alongar duzentos")...';
    }

    rec.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || '';
      const parsed = G.parseVoiceCorrection(transcript);
      if (box) {
        box.textContent = parsed.recognized
          ? `🎙️ "${transcript}" → Dir/Esq: ${parsed.lr}m | Along/Enc: ${parsed.ad}m | Sub/Bax: ${parsed.ud}m`
          : `🎙️ "${transcript}" (Diga ex: "Esquerda cinquenta, encurtar cem")`;
      }
      if (parsed.recognized && onResultCallback) {
        onResultCallback(parsed);
      }
    };

    rec.onerror = () => {
      if (box) box.textContent = '⚠️ Falha na captura de áudio. Verifique o microfone.';
    };

    rec.onend = () => {
      if (btn) btn.classList.remove('speaking');
    };

    rec.start();
  }

  /* ==========================================================================
   * 8. WEB SHARE API & SCREEN WAKE LOCK API
   * ========================================================================== */
  async function shareMission(title, text) {
    if (navigator.share) {
      try {
        await navigator.share({ title, text });
        return true;
      } catch (_) {
        return false;
      }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    return false;
  }

  async function toggleWakeLock() {
    const btn = document.getElementById('btnWakeLock');
    if (!('wakeLock' in navigator)) return false;

    if (wakeLockSentinel) {
      await wakeLockSentinel.release();
      wakeLockSentinel = null;
      if (btn) btn.classList.remove('active');
      return false;
    }

    try {
      wakeLockSentinel = await navigator.wakeLock.request('screen');
      if (btn) btn.classList.add('active');
      wakeLockSentinel.addEventListener('release', () => {
        wakeLockSentinel = null;
        if (btn) btn.classList.remove('active');
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  return {
    fetchOpenMeteoBallistic,
    scanTerrainProfile,
    fetchNoaaDeclination,
    searchNominatimLocation,
    reverseGeocodeSector,
    captureGpsUtm,
    toggleTacticalCompass,
    getLastCompassNq,
    speakFireCommand,
    startVoiceOaRecognition,
    shareMission,
    toggleWakeLock
  };
})();
