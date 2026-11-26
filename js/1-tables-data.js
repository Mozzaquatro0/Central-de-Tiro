/* ============================================================================
 * C TIR DIGITAL v5.0 — MÓDULO 1: TABELAS BALÍSTICAS (MANUAL C 23-95)
 * Morteiro Pesado 120 mm M2 Raiado (CONV, PR, PRPA, FUM, ILUM)
 * ============================================================================ */
window.CTIR = window.CTIR || {};

CTIR.CONSTANTS = {
  MIL_PER_CIRCLE: 6400,
  DEG_TO_MIL: 6400 / 360,
  MIL_TO_DEG: 360 / 6400,
  MIL_TO_RAD: (2 * Math.PI) / 6400,
  RAD_TO_MIL: 6400 / (2 * Math.PI),
  KT_TO_MS: 0.514444,
  MS_TO_KT: 1 / 0.514444,
  MIN_ELEV_MIL: 711,   // ~40° elevação mínima prática
  MAX_ELEV_MIL: 1511,  // ~85° elevação máxima (tiro vertical)
  APEX_RATIO: 0.57,    // Ápice assimétrico real devido ao arrasto aerodinâmico
  BASE_DEFLECTION: 3200 // Referência da luneta panorâmica (3200''')
};

CTIR.AMMO_META = {
  CONV: {
    code: 'CONV',
    name: 'AE Convencional M44 / PR',
    shortName: 'AE CONV',
    weightKg: 13.4,
    minRange: 450,
    maxRange: 8150,
    burstRadius: 35,
    illumination: false
  },
  PR: {
    code: 'PR',
    name: 'AE Grande Capacidade (PR)',
    shortName: 'AE PR',
    weightKg: 13.0,
    minRange: 500,
    maxRange: 8350,
    burstRadius: 42,
    illumination: false
  },
  PRPA: {
    code: 'PRPA',
    name: 'AE Propulsão Adicional (12,6 km)',
    shortName: 'AE PRPA',
    weightKg: 13.8,
    minRange: 4200,
    maxRange: 12600,
    burstRadius: 38,
    illumination: false
  },
  FUM: {
    code: 'FUM',
    name: 'Fumígena (WP / HC)',
    shortName: 'FUMÍGENA',
    weightKg: 13.2,
    minRange: 500,
    maxRange: 6800,
    burstRadius: 30,
    illumination: false
  },
  ILUM: {
    code: 'ILUM',
    name: 'Iluminativa (Paraquedas)',
    shortName: 'ILUM',
    weightKg: 13.1,
    minRange: 600,
    maxRange: 6400,
    burstRadius: 450, // Raio de iluminação efetiva
    illumination: true,
    burstHeightM: 450 // Altura padrão de abertura sobre o alvo
  }
};

/* Tabelas de Tiro Estruturadas (C 23-95 — Mrt P 120 mm M2 Raiado)
 * Campos por linha:
 *   r: alcance horizontal (m)
 *   el: elevação / alça (milésimos 6400''')
 *   tof: tempo de voo (segundos)
 *   dr: derivação giroscópica direita (milésimos)
 *   ap: flecha máxima da trajetória (m)
 *   fk: garfo para 100 m de variação em alcance (milésimos)
 *   dpa: variação de alcance por +10 m de desnível alvo acima da peça (m)
 *   wl: variação de alcance por 1 kt de vento longitudinal (m/kt)
 *   wc: derivação lateral por 1 kt de vento transversal ('''/kt)
 *   dn: variação de alcance por +1% na densidade do ar (m/%)
 *   wt: variação de alcance por +1 quadrado de peso da granada (m/□)
 *   pt: variação de alcance por +10°C na temperatura do propelente (m)
 */
CTIR.FIRING_TABLES = {
  CONV: [
    {
      charge: 0, v0: 112, minRange: 450, maxRange: 1150,
      rows: [
        { r: 450,  el: 1345, tof: 19.8, dr: 18, ap: 480,  fk: 26, dpa: -4.2, wl: 2.1, wc: 1.4, dn: -2.5, wt: -4.0, pt: 5.5 },
        { r: 700,  el: 1235, tof: 19.1, dr: 15, ap: 445,  fk: 23, dpa: -5.4, wl: 2.6, wc: 1.3, dn: -3.8, wt: -6.0, pt: 8.0 },
        { r: 950,  el: 1110, tof: 18.0, dr: 12, ap: 395,  fk: 21, dpa: -7.1, wl: 3.1, wc: 1.2, dn: -5.2, wt: -8.0, pt: 10.5 },
        { r: 1150, el: 965,  tof: 16.5, dr: 10, ap: 335,  fk: 25, dpa: -9.8, wl: 3.6, wc: 1.1, dn: -6.5, wt: -10.0, pt: 12.5 }
      ]
    },
    {
      charge: 1, v0: 148, minRange: 800, maxRange: 1950,
      rows: [
        { r: 800,  el: 1352, tof: 26.2, dr: 22, ap: 840,  fk: 18, dpa: -4.0, wl: 3.4, wc: 1.5, dn: -4.8, wt: -7.0, pt: 9.0 },
        { r: 1200, el: 1245, tof: 25.1, dr: 19, ap: 775,  fk: 16, dpa: -5.2, wl: 4.2, wc: 1.4, dn: -7.1, wt: -10.5, pt: 13.5 },
        { r: 1600, el: 1115, tof: 23.4, dr: 16, ap: 680,  fk: 15, dpa: -6.9, wl: 5.0, wc: 1.3, dn: -9.5, wt: -14.0, pt: 18.0 },
        { r: 1950, el: 955,  tof: 21.2, dr: 13, ap: 560,  fk: 18, dpa: -9.6, wl: 5.8, wc: 1.2, dn: -11.8, wt: -17.0, pt: 22.0 }
      ]
    },
    {
      charge: 2, v0: 184, minRange: 1250, maxRange: 2850,
      rows: [
        { r: 1250, el: 1348, tof: 32.1, dr: 26, ap: 1260, fk: 13, dpa: -4.1, wl: 4.8, wc: 1.6, dn: -8.2, wt: -11.0, pt: 14.5 },
        { r: 1800, el: 1242, tof: 30.6, dr: 22, ap: 1150, fk: 12, dpa: -5.3, wl: 5.9, wc: 1.5, dn: -11.5, wt: -15.5, pt: 20.5 },
        { r: 2350, el: 1112, tof: 28.5, dr: 19, ap: 1010, fk: 11, dpa: -7.0, wl: 7.0, wc: 1.4, dn: -15.0, wt: -20.0, pt: 26.5 },
        { r: 2850, el: 945,  tof: 25.6, dr: 15, ap: 825,  fk: 14, dpa: -9.9, wl: 8.1, wc: 1.3, dn: -18.5, wt: -24.5, pt: 32.0 }
      ]
    },
    {
      charge: 3, v0: 218, minRange: 1800, maxRange: 3850,
      rows: [
        { r: 1800, el: 1342, tof: 37.5, dr: 30, ap: 1710, fk: 10, dpa: -4.2, wl: 6.3, wc: 1.7, dn: -12.5, wt: -15.5, pt: 21.0 },
        { r: 2500, el: 1240, tof: 35.8, dr: 26, ap: 1565, fk: 9,  dpa: -5.4, wl: 7.6, wc: 1.6, dn: -17.2, wt: -21.5, pt: 29.0 },
        { r: 3200, el: 1115, tof: 33.4, dr: 22, ap: 1375, fk: 9,  dpa: -7.1, wl: 9.0, wc: 1.5, dn: -22.0, wt: -27.5, pt: 37.0 },
        { r: 3850, el: 940,  tof: 30.0, dr: 18, ap: 1120, fk: 11, dpa: -10.1, wl: 10.4, wc: 1.4, dn: -27.0, wt: -33.0, pt: 44.5 }
      ]
    },
    {
      charge: 4, v0: 252, minRange: 2400, maxRange: 4900,
      rows: [
        { r: 2400, el: 1338, tof: 42.6, dr: 34, ap: 2190, fk: 8,  dpa: -4.3, wl: 7.9, wc: 1.8, dn: -17.8, wt: -21.0, pt: 28.5 },
        { r: 3300, el: 1232, tof: 40.5, dr: 29, ap: 1995, fk: 7,  dpa: -5.6, wl: 9.5, wc: 1.7, dn: -24.2, wt: -28.5, pt: 38.5 },
        { r: 4150, el: 1108, tof: 37.8, dr: 25, ap: 1755, fk: 7,  dpa: -7.3, wl: 11.2, wc: 1.6, dn: -30.5, wt: -36.0, pt: 48.5 },
        { r: 4900, el: 935,  tof: 34.1, dr: 21, ap: 1440, fk: 9,  dpa: -10.3, wl: 12.8, wc: 1.5, dn: -36.5, wt: -42.5, pt: 57.5 }
      ]
    },
    {
      charge: 5, v0: 284, minRange: 3000, maxRange: 5900,
      rows: [
        { r: 3000, el: 1335, tof: 47.2, dr: 38, ap: 2680, fk: 7,  dpa: -4.4, wl: 9.5, wc: 1.9, dn: -23.5, wt: -26.5, pt: 36.0 },
        { r: 4000, el: 1230, tof: 44.9, dr: 33, ap: 2440, fk: 6,  dpa: -5.7, wl: 11.4, wc: 1.8, dn: -31.2, wt: -35.0, pt: 47.5 },
        { r: 5000, el: 1105, tof: 41.9, dr: 28, ap: 2145, fk: 6,  dpa: -7.5, wl: 13.3, wc: 1.7, dn: -39.0, wt: -43.5, pt: 59.0 },
        { r: 5900, el: 930,  tof: 37.9, dr: 23, ap: 1760, fk: 8,  dpa: -10.5, wl: 15.1, wc: 1.6, dn: -46.5, wt: -51.5, pt: 69.5 }
      ]
    },
    {
      charge: 6, v0: 314, minRange: 3600, maxRange: 6800,
      rows: [
        { r: 3600, el: 1330, tof: 51.4, dr: 42, ap: 3160, fk: 6,  dpa: -4.5, wl: 11.1, wc: 2.0, dn: -29.5, wt: -32.0, pt: 43.5 },
        { r: 4700, el: 1225, tof: 48.9, dr: 36, ap: 2880, fk: 5,  dpa: -5.8, wl: 13.2, wc: 1.9, dn: -38.5, wt: -41.5, pt: 56.5 },
        { r: 5800, el: 1098, tof: 45.6, dr: 31, ap: 2530, fk: 5,  dpa: -7.7, wl: 15.3, wc: 1.8, dn: -47.5, wt: -51.0, pt: 69.5 },
        { r: 6800, el: 922,  tof: 41.2, dr: 26, ap: 2080, fk: 7,  dpa: -10.8, wl: 17.3, wc: 1.7, dn: -56.0, wt: -59.5, pt: 81.0 }
      ]
    },
    {
      charge: 7, v0: 342, minRange: 4200, maxRange: 7550,
      rows: [
        { r: 4200, el: 1326, tof: 55.1, dr: 46, ap: 3620, fk: 5,  dpa: -4.6, wl: 12.6, wc: 2.1, dn: -35.8, wt: -37.5, pt: 51.0 },
        { r: 5350, el: 1220, tof: 52.4, dr: 40, ap: 3300, fk: 5,  dpa: -6.0, wl: 14.9, wc: 2.0, dn: -45.5, wt: -47.5, pt: 64.5 },
        { r: 6500, el: 1092, tof: 48.9, dr: 34, ap: 2895, fk: 5,  dpa: -7.9, wl: 17.1, wc: 1.9, dn: -55.2, wt: -57.5, pt: 78.0 },
        { r: 7550, el: 915,  tof: 44.3, dr: 28, ap: 2380, fk: 6,  dpa: -11.0, wl: 19.2, wc: 1.8, dn: -64.5, wt: -66.5, pt: 90.5 }
      ]
    },
    {
      charge: 8, v0: 368, minRange: 4800, maxRange: 8150,
      rows: [
        { r: 4800, el: 1320, tof: 58.4, dr: 50, ap: 4050, fk: 5,  dpa: -4.7, wl: 14.1, wc: 2.2, dn: -42.0, wt: -43.0, pt: 58.5 },
        { r: 5950, el: 1215, tof: 55.6, dr: 43, ap: 3695, fk: 4,  dpa: -6.1, wl: 16.5, wc: 2.1, dn: -52.0, wt: -53.0, pt: 72.0 },
        { r: 7100, el: 1085, tof: 51.9, dr: 37, ap: 3240, fk: 4,  dpa: -8.1, wl: 18.8, wc: 2.0, dn: -62.0, wt: -63.0, pt: 85.5 },
        { r: 8150, el: 905,  tof: 47.0, dr: 31, ap: 2660, fk: 6,  dpa: -11.3, wl: 21.0, wc: 1.9, dn: -71.5, wt: -72.0, pt: 98.0 }
      ]
    }
  ],

  /* PRPA — Granada com Propulsão Adicional (Alcance Estendido até 12.600 m) */
  PRPA: [
    {
      charge: 5, v0: 295, minRange: 4200, maxRange: 7400,
      rows: [
        { r: 4200, el: 1325, tof: 54.0, dr: 44, ap: 3480, fk: 5, dpa: -4.6, wl: 12.4, wc: 2.1, dn: -35.0, wt: -37.0, pt: 50.0 },
        { r: 5300, el: 1218, tof: 51.3, dr: 38, ap: 3170, fk: 5, dpa: -5.9, wl: 14.6, wc: 2.0, dn: -44.2, wt: -46.5, pt: 63.0 },
        { r: 6400, el: 1090, tof: 47.8, dr: 33, ap: 2780, fk: 5, dpa: -7.8, wl: 16.8, wc: 1.9, dn: -53.5, wt: -56.0, pt: 76.0 },
        { r: 7400, el: 918,  tof: 43.2, dr: 27, ap: 2290, fk: 6, dpa: -10.9, wl: 18.9, wc: 1.8, dn: -62.0, wt: -65.0, pt: 88.0 }
      ]
    },
    {
      charge: 6, v0: 332, minRange: 5200, maxRange: 8900,
      rows: [
        { r: 5200, el: 1320, tof: 60.2, dr: 51, ap: 4310, fk: 5, dpa: -4.7, wl: 15.0, wc: 2.2, dn: -45.5, wt: -46.0, pt: 62.5 },
        { r: 6450, el: 1212, tof: 57.2, dr: 44, ap: 3920, fk: 4, dpa: -6.1, wl: 17.5, wc: 2.1, dn: -56.5, wt: -57.0, pt: 77.5 },
        { r: 7700, el: 1082, tof: 53.4, dr: 38, ap: 3440, fk: 4, dpa: -8.1, wl: 20.0, wc: 2.0, dn: -67.5, wt: -68.0, pt: 92.5 },
        { r: 8900, el: 910,  tof: 48.3, dr: 32, ap: 2830, fk: 6, dpa: -11.3, wl: 22.4, wc: 1.9, dn: -78.0, wt: -78.5, pt: 106.5 }
      ]
    },
    {
      charge: 7, v0: 368, minRange: 6300, maxRange: 10300,
      rows: [
        { r: 6300,  el: 1315, tof: 65.8, dr: 58, ap: 5120, fk: 4, dpa: -4.8, wl: 17.6, wc: 2.3, dn: -56.5, wt: -55.5, pt: 75.5 },
        { r: 7650,  el: 1206, tof: 62.5, dr: 50, ap: 4660, fk: 4, dpa: -6.3, wl: 20.4, wc: 2.2, dn: -68.5, wt: -67.5, pt: 91.5 },
        { r: 9000,  el: 1075, tof: 58.3, dr: 43, ap: 4090, fk: 4, dpa: -8.3, wl: 23.1, wc: 2.1, dn: -80.5, wt: -79.5, pt: 108.0 },
        { r: 10300, el: 902,  tof: 52.8, dr: 36, ap: 3360, fk: 5, dpa: -11.6, wl: 25.8, wc: 2.0, dn: -92.0, wt: -91.0, pt: 123.5 }
      ]
    },
    {
      charge: 8, v0: 402, minRange: 7400, maxRange: 11500,
      rows: [
        { r: 7400,  el: 1310, tof: 70.9, dr: 64, ap: 5910, fk: 4, dpa: -4.9, wl: 20.1, wc: 2.4, dn: -67.5, wt: -65.0, pt: 88.5 },
        { r: 8800,  el: 1200, tof: 67.3, dr: 56, ap: 5380, fk: 3, dpa: -6.4, wl: 23.0, wc: 2.3, dn: -80.0, wt: -77.5, pt: 105.5 },
        { r: 10200, el: 1068, tof: 62.8, dr: 48, ap: 4720, fk: 3, dpa: -8.5, wl: 26.0, wc: 2.2, dn: -93.0, wt: -90.0, pt: 122.0 },
        { r: 11500, el: 895,  tof: 56.9, dr: 40, ap: 3880, fk: 5, dpa: -11.9, wl: 28.8, wc: 2.1, dn: -105.0, wt: -101.5, pt: 138.0 }
      ]
    },
    {
      charge: 9, v0: 432, minRange: 8400, maxRange: 12600,
      rows: [
        { r: 8400,  el: 1305, tof: 75.5, dr: 70, ap: 6680, fk: 3, dpa: -5.0, wl: 22.4, wc: 2.5, dn: -78.0, wt: -74.0, pt: 101.0 },
        { r: 9800,  el: 1195, tof: 71.7, dr: 61, ap: 6080, fk: 3, dpa: -6.5, wl: 25.5, wc: 2.4, dn: -91.0, wt: -86.5, pt: 118.0 },
        { r: 11200, el: 1062, tof: 66.9, dr: 52, ap: 5340, fk: 3, dpa: -8.7, wl: 28.6, wc: 2.3, dn: -104.0, wt: -99.0, pt: 134.5 },
        { r: 12600, el: 888,  tof: 60.5, dr: 44, ap: 4390, fk: 4, dpa: -12.2, wl: 31.6, wc: 2.2, dn: -116.5, wt: -111.0, pt: 151.0 }
      ]
    }
  ]
};

/* Deriva tabelas PR, FUM e ILUM a partir da base balística calibrada CONV */
(function buildDerivedAmmoTables() {
  const cloneAndScale = (baseCharges, rangeScale, driftScale, maxCharge) =>
    baseCharges
      .filter((c) => c.charge <= maxCharge)
      .map((c) => ({
        charge: c.charge,
        v0: Math.round(c.v0 * Math.sqrt(rangeScale)),
        minRange: Math.round(c.minRange * rangeScale),
        maxRange: Math.round(c.maxRange * rangeScale),
        rows: c.rows.map((row) => ({
          ...row,
          r: Math.round(row.r * rangeScale),
          dr: Math.round(row.dr * driftScale),
          ap: Math.round(row.ap * rangeScale)
        }))
      }));

  CTIR.FIRING_TABLES.PR = cloneAndScale(CTIR.FIRING_TABLES.CONV, 1.0245, 0.98, 8);
  CTIR.FIRING_TABLES.FUM = cloneAndScale(CTIR.FIRING_TABLES.CONV, 0.90, 1.04, 7);
  CTIR.FIRING_TABLES.ILUM = cloneAndScale(CTIR.FIRING_TABLES.CONV, 0.848, 1.06, 7);
})();

CTIR.PHONETICS = {
  digits: {
    '0': 'ZERO',
    '1': 'UNO',
    '2': 'DOIS',
    '3': 'TRÊS',
    '4': 'QUARTO',
    '5': 'CINCO',
    '6': 'MEIA',
    '7': 'SETE',
    '8': 'OITO',
    '9': 'NOVE',
    '.': 'VÍRGULA',
    ',': 'VÍRGULA'
  },
  letters: {
    A: 'ALFA', B: 'BRAVO', C: 'CHARLIE', D: 'DELTA', E: 'ECHO',
    F: 'FOXTROT', G: 'GOLF', H: 'HOTEL', I: 'INDIA', J: 'JULIET',
    K: 'KILO', L: 'LIMA', M: 'MIKE', N: 'NOVEMBER', O: 'OSCAR',
    P: 'PAPA', Q: 'QUEBEC', R: 'ROMEO', S: 'SIERRA', T: 'TANGO',
    U: 'UNIFORM', V: 'VICTOR', W: 'WHISKEY', X: 'X-RAY', Y: 'YANKEE',
    Z: 'ZULU'
  }
};
