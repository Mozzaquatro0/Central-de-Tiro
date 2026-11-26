/* ============================================================================
 * C TIR DIGITAL v5.0 — MÓDULO 2: GEODÉSIA SIRGAS 2000 UTM, TRÊS NORTES & 6400'''
 * ============================================================================ */
window.CTIR = window.CTIR || {};

CTIR.GEO = (function () {
  const C = CTIR.CONSTANTS;

  // Elipsoide GRS80 / SIRGAS 2000 / WGS84
  const A = 6378137.0;
  const F = 1 / 298.257222101;
  const K0 = 0.9996;
  const E2 = F * (2 - F);
  const EP2 = E2 / (1 - E2);

  function normMil(m) {
    const mod = ((Number(m) || 0) % C.MIL_PER_CIRCLE + C.MIL_PER_CIRCLE) % C.MIL_PER_CIRCLE;
    return mod;
  }

  function deltaMil(targetMil, refMil) {
    let diff = normMil(targetMil) - normMil(refMil);
    if (diff > 3200) diff -= 6400;
    if (diff < -3200) diff += 6400;
    return diff;
  }

  function roundEB(val, step = 1) {
    return Math.round((Number(val) || 0) / step) * step;
  }

  function formatMil(m) {
    const val = Math.round(normMil(m)) % 6400;
    return String(val).padStart(4, '0') + "'''";
  }

  function formatSignedMil(m) {
    const r = Math.round(Number(m) || 0);
    return (r >= 0 ? '+' : '') + r + "'''";
  }

  /* Converte Coordenada UTM SIRGAS 2000 -> Latitude/Longitude (graus decimais) */
  function utmToLatLng(easting, northing, zone = 21, hemi = 'S') {
    const x = Number(easting) - 500000.0;
    const y = hemi === 'S' ? Number(northing) - 10000000.0 : Number(northing);
    const lonOrigin = ((Number(zone) - 1) * 6 - 180 + 3) * (Math.PI / 180);

    const m = y / K0;
    const mu = m / (A * (1 - E2 / 4 - (3 * E2 * E2) / 64 - (5 * Math.pow(E2, 3)) / 256));

    const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
    const j1 = (3 * e1) / 2 - (27 * Math.pow(e1, 3)) / 32;
    const j2 = (21 * e1 * e1) / 16 - (55 * Math.pow(e1, 4)) / 32;
    const j3 = (151 * Math.pow(e1, 3)) / 96;
    const j4 = (1097 * Math.pow(e1, 4)) / 512;

    const fp =
      mu +
      j1 * Math.sin(2 * mu) +
      j2 * Math.sin(4 * mu) +
      j3 * Math.sin(6 * mu) +
      j4 * Math.sin(8 * mu);

    const sinFp = Math.sin(fp);
    const cosFp = Math.cos(fp);
    const tanFp = Math.tan(fp);

    const c1 = EP2 * cosFp * cosFp;
    const t1 = tanFp * tanFp;
    const r1 = (A * (1 - E2)) / Math.pow(1 - E2 * sinFp * sinFp, 1.5);
    const n1 = A / Math.sqrt(1 - E2 * sinFp * sinFp);
    const d = x / (n1 * K0);

    const q1 = (n1 * tanFp) / r1;
    const q2 = (d * d) / 2;
    const q3 = ((5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * EP2) * Math.pow(d, 4)) / 24;
    const q4 = ((61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * EP2 - 3 * c1 * c1) * Math.pow(d, 6)) / 720;
    const lat = fp - q1 * (q2 - q3 + q4);

    const q5 = d;
    const q6 = ((1 + 2 * t1 + c1) * Math.pow(d, 3)) / 6;
    const q7 = ((5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * EP2 + 24 * t1 * t1) * Math.pow(d, 5)) / 120;
    const lon = lonOrigin + (q5 - q6 + q7) / cosFp;

    return {
      lat: lat * (180 / Math.PI),
      lng: lon * (180 / Math.PI)
    };
  }

  /* Converte Latitude/Longitude -> UTM SIRGAS 2000 */
  function latLngToUtm(latDeg, lngDeg, forceZone = null) {
    const lat = Number(latDeg) * (Math.PI / 180);
    const lng = Number(lngDeg);
    const zone = forceZone || Math.floor((lng + 180) / 6) + 1;
    const lonOrigin = ((zone - 1) * 6 - 180 + 3) * (Math.PI / 180);
    const lonRad = lng * (Math.PI / 180);

    const sinLat = Math.sin(lat);
    const cosLat = Math.cos(lat);
    const tanLat = Math.tan(lat);

    const n = A / Math.sqrt(1 - E2 * sinLat * sinLat);
    const t = tanLat * tanLat;
    const c = EP2 * cosLat * cosLat;
    const aCoef = cosLat * (lonRad - lonOrigin);

    const m =
      A *
      ((1 - E2 / 4 - (3 * E2 * E2) / 64 - (5 * Math.pow(E2, 3)) / 256) * lat -
        ((3 * E2) / 8 + (3 * E2 * E2) / 32 + (45 * Math.pow(E2, 3)) / 1024) * Math.sin(2 * lat) +
        ((15 * E2 * E2) / 256 + (45 * Math.pow(E2, 3)) / 1024) * Math.sin(4 * lat) -
        ((35 * Math.pow(E2, 3)) / 3072) * Math.sin(6 * lat));

    const easting =
      K0 *
        n *
        (aCoef +
          ((1 - t + c) * Math.pow(aCoef, 3)) / 6 +
          ((5 - 18 * t + t * t + 72 * c - 58 * EP2) * Math.pow(aCoef, 5)) / 120) +
      500000.0;

    let northing =
      K0 *
      (m +
        n *
          tanLat *
          ((aCoef * aCoef) / 2 +
            ((5 - t + 9 * c + 4 * c * c) * Math.pow(aCoef, 4)) / 24 +
            ((61 - 58 * t + t * t + 600 * c - 330 * EP2) * Math.pow(aCoef, 6)) / 720));

    const hemi = latDeg < 0 ? 'S' : 'N';
    if (hemi === 'S') northing += 10000000.0;

    // Letra da faixa MGRS / UTM
    const bands = 'CDEFGHJKLMNPQRSTUVWXX';
    const bandIdx = Math.max(0, Math.min(bands.length - 1, Math.floor((latDeg + 80) / 8)));

    return {
      easting: Math.round(easting),
      northing: Math.round(northing),
      zone,
      hemi,
      band: bands[bandIdx]
    };
  }

  /* Convergência de Meridianos (C) em milésimos (6400''')
   * C = arctan(tan(lon - lon0) * sin(lat))
   * Relação cartográfica: NV = NQ + C
   */
  function computeMeridianConvergence(easting, northing, zone, hemi) {
    const ll = utmToLatLng(easting, northing, zone, hemi);
    const lon0 = (zone - 1) * 6 - 180 + 3;
    const dLonRad = (ll.lng - lon0) * (Math.PI / 180);
    const latRad = ll.lat * (Math.PI / 180);
    const convRad = Math.atan(Math.tan(dLonRad) * Math.sin(latRad));
    return Math.round(convRad * C.RAD_TO_MIL);
  }

  /* Conversão entre os Três Nortes (NQ = Quadrícula, NV = Verdadeiro, NM = Magnético)
   * Convenção adotada:
   *   magDeclMil (QM): negativo para Oeste (W), positivo para Leste (E)
   *   convMil (C):     convergência de meridianos (NV = NQ + C)
   *   NM = NV - QM = NQ + C - QM
   */
  function toGridAzimuth(azInput, refType, magDeclMil, convMil) {
    const az = Number(azInput) || 0;
    const qm = Number(magDeclMil) || 0;
    const c = Number(convMil) || 0;
    if (refType === 'NV') return normMil(az - c);
    if (refType === 'NM') return normMil(az + qm - c);
    return normMil(az);
  }

  function fromGridAzimuth(azNQ, magDeclMil, convMil) {
    const nq = normMil(azNQ);
    const qm = Number(magDeclMil) || 0;
    const c = Number(convMil) || 0;
    const nv = normMil(nq + c);
    const nm = normMil(nv - qm);
    return { nq, nv, nm };
  }

  /* Projeção Polar (Distância + Azimute NQ -> Delta Easting/Northing) */
  function polarDelta(distM, azMilNQ) {
    const rad = normMil(azMilNQ) * C.MIL_TO_RAD;
    return {
      dE: distM * Math.sin(rad),
      dN: distM * Math.cos(rad)
    };
  }

  /* Problema Inverso UTM (Ponto 1 -> Ponto 2 em Distância m e Azimute NQ 6400''') */
  function inverseUtm(e1, n1, e2, n2) {
    const dE = Number(e2) - Number(e1);
    const dN = Number(n2) - Number(n1);
    const dist = Math.hypot(dE, dN);
    let azRad = Math.atan2(dE, dN);
    if (azRad < 0) azRad += 2 * Math.PI;
    const azMil = azRad * C.RAD_TO_MIL;
    return { dist, azMil, dE, dN };
  }

  /* Converte número ou milésimo para leitura fonética militar brasileira */
  function toMilitarySpeech(text) {
    const P = CTIR.PHONETICS;
    return String(text)
      .replace(/(\d{4})'''/g, (_, digits) => {
        const spoken = digits
          .split('')
          .map((d) => P.digits[d] || d)
          .join(' ');
        return `${spoken} MILÉSIMOS`;
      })
      .replace(/\b([A-Z]{2})\s*(\d+)\b/g, (_, letters, nums) => {
        const lSpoken = letters
          .split('')
          .map((ch) => P.letters[ch] || ch)
          .join(' ');
        const nSpoken = nums
          .split('')
          .map((d) => P.digits[d] || d)
          .join(' ');
        return `${lSpoken} ${nSpoken}`;
      });
  }

  /* Interpreta comando de voz falado pelo OA em português */
  function parseVoiceCorrection(rawTranscript) {
    const txt = String(rawTranscript || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    const wordNumbers = {
      zero: 0, uno: 1, um: 1, uma: 1, dois: 2, duas: 2, tres: 3,
      quarto: 4, quatro: 4, cinco: 5, meia: 6, seis: 6, sete: 7,
      oito: 8, nove: 9, dez: 10, quinze: 15, vinte: 20, vinte_e_cinco: 25,
      trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70,
      oitenta: 80, noventa: 90, cem: 100, cento: 100, duzentos: 200,
      trezentos: 300, quatrocentos: 400, quinhentos: 500, seiscentos: 600,
      setecentos: 700, oitocentos: 800, novecentos: 900, mil: 1000
    };

    function extractValueAfter(keywords) {
      for (const kw of keywords) {
        const regexNum = new RegExp(kw + '\\s*(?:de\\s*)?(\\d+(?:[.,]\\d+)?)');
        const mNum = txt.match(regexNum);
        if (mNum) return parseFloat(mNum[1].replace(',', '.'));

        const regexWord = new RegExp(kw + '\\s*(?:de\\s*)?([a-z\\s]{2,28})');
        const mWord = txt.match(regexWord);
        if (mWord) {
          const tokens = mWord[1].trim().split(/\s+/);
          let total = 0;
          let matched = false;
          for (const tk of tokens) {
            if (tk === 'e') continue;
            if (wordNumbers[tk] !== undefined) {
              total += wordNumbers[tk];
              matched = true;
            } else {
              break;
            }
          }
          if (matched) return total;
        }
      }
      return null;
    }

    let lr = 0;
    let ad = 0;
    let ud = 0;
    let recognized = false;

    const rightVal = extractValueAfter(['direita']);
    if (rightVal !== null) { lr += rightVal; recognized = true; }

    const leftVal = extractValueAfter(['esquerda']);
    if (leftVal !== null) { lr -= leftVal; recognized = true; }

    const addVal = extractValueAfter(['alongar', 'alonga', 'mais']);
    if (addVal !== null) { ad += addVal; recognized = true; }

    const dropVal = extractValueAfter(['encurtar', 'encurta', 'menos']);
    if (dropVal !== null) { ad -= dropVal; recognized = true; }

    const upVal = extractValueAfter(['subir', 'sobe']);
    if (upVal !== null) { ud += upVal; recognized = true; }

    const downVal = extractValueAfter(['baixar', 'baixa', 'descer']);
    if (downVal !== null) { ud -= downVal; recognized = true; }

    return { recognized, lr, ad, ud, cleanText: txt };
  }

  return {
    normMil,
    deltaMil,
    roundEB,
    formatMil,
    formatSignedMil,
    utmToLatLng,
    latLngToUtm,
    computeMeridianConvergence,
    toGridAzimuth,
    fromGridAzimuth,
    polarDelta,
    inverseUtm,
    toMilitarySpeech,
    parseVoiceCorrection
  };
})();
