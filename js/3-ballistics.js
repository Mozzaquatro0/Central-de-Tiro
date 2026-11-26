/* ============================================================================
 * C TIR DIGITAL v5.0 — MÓDULO 3: MOTOR BALÍSTICO (C 23-95)
 * - Densidade atmosférica termodinâmica real (pressão na cota + temperatura)
 * - Fator K estritamente longitudinal (eixo Peça-Alvo)
 * - Trajetória assimétrica (ápice a 57% do alcance) na checagem de crista
 * - Verificação de Zona de Segurança de Tropas (TSZ) e limite de elevação
 * ============================================================================ */
window.CTIR = window.CTIR || {};

CTIR.BALLISTICS = (function () {
  const C = CTIR.CONSTANTS;
  const G = CTIR.GEO;

  /* Densidade do ar real: rho = (P_hPa * 100) / (287.058 * (T_C + 273.15))
   * Referência balística padrão ICAO/C 23-95: 15°C e 997 hPa (~1.206 kg/m³)
   */
  function computeAirDensityRatio(tempC, pressureHpa) {
    const tK = (Number(tempC) || 15) + 273.15;
    const pPa = (Number(pressureHpa) || 997) * 100;
    const rho = pPa / (287.058 * tK);
    const rhoStd = (997 * 100) / (287.058 * (15 + 273.15));
    const ratio = rho / rhoStd;
    return {
      rhoKgM3: rho,
      rhoPercent: ratio * 100,
      deltaRhoPct: (ratio - 1) * 100
    };
  }

  /* Interpolação linear nas linhas da tabela de tiro */
  function interpolateRow(chargeObj, rangeM) {
    const rows = chargeObj.rows;
    if (rangeM <= rows[0].r) {
      const ratio = Math.max(0.5, rangeM / rows[0].r);
      return {
        ...rows[0],
        el: Math.min(C.MAX_ELEV_MIL, rows[0].el + (rows[0].r - rangeM) * (rows[0].fk / 100)),
        tof: rows[0].tof * ratio,
        ap: rows[0].ap * ratio
      };
    }
    const last = rows[rows.length - 1];
    if (rangeM >= last.r) {
      const ratio = rangeM / last.r;
      return {
        ...last,
        el: Math.max(C.MIN_ELEV_MIL, last.el - (rangeM - last.r) * (last.fk / 100)),
        tof: last.tof * ratio,
        ap: last.ap * ratio
      };
    }

    for (let i = 0; i < rows.length - 1; i++) {
      const r0 = rows[i];
      const r1 = rows[i + 1];
      if (rangeM >= r0.r && rangeM <= r1.r) {
        const t = (rangeM - r0.r) / (r1.r - r0.r);
        const lerp = (k) => r0[k] + t * (r1[k] - r0[k]);
        return {
          r: rangeM,
          el: lerp('el'),
          tof: lerp('tof'),
          dr: lerp('dr'),
          ap: lerp('ap'),
          fk: lerp('fk'),
          dpa: lerp('dpa'),
          wl: lerp('wl'),
          wc: lerp('wc'),
          dn: lerp('dn'),
          wt: lerp('wt'),
          pt: lerp('pt')
        };
      }
    }
    return rows[0];
  }

  /* Seleciona a carga ideal (AUTO) ou retorna a carga manual solicitada */
  function selectChargeTable(ammoType, horizDist, chargePref = 'AUTO') {
    const tables = CTIR.FIRING_TABLES[ammoType] || CTIR.FIRING_TABLES.CONV;
    if (chargePref !== 'AUTO') {
      const chNum = Number(chargePref);
      const exact = tables.find((t) => t.charge === chNum);
      if (exact) return exact;
    }

    // Busca cargas cujo envelope cobre o alcance, preferindo margem confortável ao máximo
    const candidates = tables.filter(
      (t) => horizDist >= t.minRange && horizDist <= t.maxRange
    );
    if (candidates.length > 0) {
      // Prefere a menor carga capaz de bater o alvo com margem >= 8% do alcance máximo (menor dispersão)
      const comfortable = candidates.find((t) => horizDist <= t.maxRange * 0.94);
      return comfortable || candidates[candidates.length - 1];
    }

    // Se fora de alcance, retorna a carga mais próxima (menor ou maior disponível)
    if (horizDist < tables[0].minRange) return tables[0];
    return tables[tables.length - 1];
  }

  /* Acumulação do Fator K estritamente longitudinal (projeção no eixo Peça-Alvo) */
  function accumulateLongitudinalFactorK(currentK, corrLR, corrAD, azOaMil, azGunTargetMil, currentRangeM) {
    if (currentRangeM < 100) return currentK;
    // Vetor de correção solicitado pelo OA no terreno (em metros)
    const dOa = G.polarDelta(corrAD, azOaMil);
    const lOa = G.polarDelta(corrLR, G.normMil(azOaMil + 1600));
    const vecE = dOa.dE + lOa.dE;
    const vecN = dOa.dN + lOa.dN;

    // Unitário do eixo Peça -> Alvo
    const gunRad = G.normMil(azGunTargetMil) * C.MIL_TO_RAD;
    const uGunE = Math.sin(gunRad);
    const uGunN = Math.cos(gunRad);

    // Projeção escalar estritamente longitudinal (ignora componente transversal pura)
    const longitudinalDeltaM = vecE * uGunE + vecN * uGunN;
    const deltaK = longitudinalDeltaM / currentRangeM;

    // Limita Fator K acumulado dentro de faixa operacional realista [-0.15, +0.15]
    return Math.max(-0.15, Math.min(0.15, currentK + deltaK));
  }

  /* Altura da trajetória assimétrica (ápice atinge Y_max a x = 0.57 * R) */
  function trajectoryAltitudeAt(x, totalRange, gunAlt, targetAlt, apexHeightAboveGun) {
    if (totalRange <= 0 || x <= 0) return gunAlt;
    if (x >= totalRange) return targetAlt;

    const u = x / totalRange;
    const p = C.APEX_RATIO; // 0.57
    const yPeak = gunAlt + apexHeightAboveGun;

    if (u <= p) {
      // Arco ascendente até u = 0.57
      const s = u / p;
      return gunAlt + (yPeak - gunAlt) * (2 * s - s * s);
    } else {
      // Arco descendente mais íngreme de u = 0.57 até u = 1.00
      const s = (u - p) / (1 - p);
      return yPeak - (yPeak - targetAlt) * (s * s);
    }
  }

  /* Checagem de Crista Intermediária (Manual ou Varredura Open-Meteo) */
  function checkCrestClearance(params) {
    const {
      totalRange,
      gunAlt,
      targetAlt,
      apexAboveGun,
      crestDist,
      crestAlt,
      terrainProfile
    } = params;

    let criticalDist = Number(crestDist) || 0;
    let criticalTerrainAlt = Number(crestAlt) || 0;
    let minMargin = Infinity;
    let worstPoint = null;

    // Se houver perfil varrido de 28 pontos, verifica todos os pontos intermediários
    if (Array.isArray(terrainProfile) && terrainProfile.length > 2) {
      for (let i = 1; i < terrainProfile.length - 1; i++) {
        const pt = terrainProfile[i];
        if (pt.dist <= 20 || pt.dist >= totalRange - 20) continue;
        const projAlt = trajectoryAltitudeAt(pt.dist, totalRange, gunAlt, targetAlt, apexAboveGun);
        const margin = projAlt - pt.alt;
        if (margin < minMargin) {
          minMargin = margin;
          worstPoint = { dist: pt.dist, terrainAlt: pt.alt, projAlt, margin };
        }
      }
    }

    // Verifica também a crista manual informada
    if (criticalDist > 10 && criticalDist < totalRange - 10 && criticalTerrainAlt > 0) {
      const projAltManual = trajectoryAltitudeAt(criticalDist, totalRange, gunAlt, targetAlt, apexAboveGun);
      const manualMargin = projAltManual - criticalTerrainAlt;
      if (manualMargin < minMargin) {
        minMargin = manualMargin;
        worstPoint = {
          dist: criticalDist,
          terrainAlt: criticalTerrainAlt,
          projAlt: projAltManual,
          margin: manualMargin
        };
      }
    }

    if (!worstPoint || !isFinite(minMargin)) {
      return {
        hasCrest: false,
        blocked: false,
        caution: false,
        marginM: null,
        crestDist: criticalDist,
        crestAlt: criticalTerrainAlt,
        projAlt: null
      };
    }

    return {
      hasCrest: true,
      blocked: worstPoint.margin <= 0,
      caution: worstPoint.margin > 0 && worstPoint.margin < 25,
      marginM: Math.round(worstPoint.margin),
      crestDist: Math.round(worstPoint.dist),
      crestAlt: Math.round(worstPoint.terrainAlt),
      projAlt: Math.round(worstPoint.projAlt)
    };
  }

  /* Verifica Zona de Segurança de Tropas Amigas (TSZ) */
  function checkTszSafety(pieces, targetE, targetN, friendlyE, friendlyN, friendlyRadius) {
    if (
      friendlyE === '' ||
      friendlyN === '' ||
      friendlyE === null ||
      friendlyN === null ||
      isNaN(Number(friendlyE)) ||
      isNaN(Number(friendlyN))
    ) {
      return { active: false, status: 'NONE', minDistM: null };
    }

    const fE = Number(friendlyE);
    const fN = Number(friendlyN);
    const rad = Math.max(50, Number(friendlyRadius) || 400);

    let minDist = Math.hypot(targetE - fE, targetN - fN);
    for (const p of pieces) {
      if (p.aimE !== undefined) {
        const d = Math.hypot(p.aimE - fE, p.aimN - fN);
        if (d < minDist) minDist = d;
      }
    }

    let status = 'SAFE';
    if (minDist < rad) status = 'DANGER';
    else if (minDist < rad + 150) status = 'CAUTION';

    return {
      active: true,
      status,
      minDistM: Math.round(minDist),
      radiusM: rad
    };
  }

  /* Calcula posição UTM das 4 peças da seção perpendicular à Direção da Frente */
  function computePiecePositions(baseE, baseN, baseIdx, intervalM, frontAzMil) {
    // Linha das peças é perpendicular à direção da frente (+1600''' à direita)
    const lineAz = G.normMil(frontAzMil + 1600);
    const pieces = [];
    for (let i = 0; i < 4; i++) {
      const offsetSteps = i - baseIdx; // Negativo = à esquerda da peça base, Positivo = à direita
      const delta = G.polarDelta(offsetSteps * intervalM, lineAz);
      pieces.push({
        index: i,
        number: i + 1,
        label: `${i + 1}ª Pç`,
        isBase: i === baseIdx,
        e: Math.round(baseE + delta.dE),
        n: Math.round(baseN + delta.dN)
      });
    }
    return pieces;
  }

  /* Solver Completo da Seção (4 Peças) */
  function solveBatteryFiringSolution(state) {
    const baseIdx = Number(state.basePieceSelect) || 0;
    const baseE = Number(state.baseE) || 0;
    const baseN = Number(state.baseN) || 0;
    const baseAlt = Number(state.baseAlt) || 0;
    const intervalM = Math.max(5, Number(state.pieceInterval) || 35);
    const frontAz = G.normMil(Number(state.frontAzimuth) || 0);
    const sheafType = state.sheafType || 'parallel';

    const targetE = Number(state.targetE) || 0;
    const targetN = Number(state.targetN) || 0;
    const targetAlt = Number(state.targetAlt) || 0;

    const ammoType = state.ammoType || 'CONV';
    const ammoMeta = CTIR.AMMO_META[ammoType] || CTIR.AMMO_META.CONV;
    const chargePref = state.chargeSelect || 'AUTO';
    const projWeightVar = Number(state.projWeightVar) || 0;
    const propTemp = Number(state.propTemp) || 21;

    const magDecl = Number(state.magDeclination) || 0;
    const meridianConv = Number(state.meridianConv) || 0;
    const northRef = state.northRefSelect || 'NQ';

    // Converte direções de vento para Norte da Quadrícula (NQ)
    const windSupDirNQ = G.toGridAzimuth(Number(state.windDir) || 0, northRef, magDecl, meridianConv);
    const windSupSpd = Number(state.windSpeed) || 0;
    const windBalDirNQ = G.toGridAzimuth(Number(state.windBalDir) || 0, northRef, magDecl, meridianConv);
    const windBalSpd = Number(state.windBalSpeed) || 0;

    // Vento efetivo ponderado (25% superfície + 75% camada balística em altitude)
    const effWindE =
      0.25 * windSupSpd * Math.sin(windSupDirNQ * C.MIL_TO_RAD) +
      0.75 * windBalSpd * Math.sin(windBalDirNQ * C.MIL_TO_RAD);
    const effWindN =
      0.25 * windSupSpd * Math.cos(windSupDirNQ * C.MIL_TO_RAD) +
      0.75 * windBalSpd * Math.cos(windBalDirNQ * C.MIL_TO_RAD);

    const effWindSpeed = Math.hypot(effWindE, effWindN);
    let effWindFromRad = Math.atan2(effWindE, effWindN);
    if (effWindFromRad < 0) effWindFromRad += 2 * Math.PI;
    const effWindFromMil = effWindFromRad * C.RAD_TO_MIL;

    const airTemp = Number(state.airTemp) || 15;
    const airPressure = Number(state.airPressure) || 997;
    const densityInfo = computeAirDensityRatio(airTemp, airPressure);
    const factorK = Number(state.factorK) || 0;

    // 1. Posições das 4 peças
    const piecePositions = computePiecePositions(baseE, baseN, baseIdx, intervalM, frontAz);

    // 2. Geometria principal da Peça Base -> Alvo
    const baseGeom = G.inverseUtm(baseE, baseN, targetE, targetN);
    const selectedChargeObj = selectChargeTable(ammoType, baseGeom.dist, chargePref);

    // Decomposição do vento em relação à linha de tiro da Peça Base
    // Vento soprado DE windFromMil: vento de cauda ajuda (+VL), vento de proa freia (-VL)
    const windAngleDiffRad = (effWindFromMil - baseGeom.azMil) * C.MIL_TO_RAD;
    const windLongKt = -effWindSpeed * Math.cos(windAngleDiffRad); // + = cauda, - = proa
    const windCrossKt = effWindSpeed * Math.sin(windAngleDiffRad); // + = vem da direita (empurra p/ esquerda)

    // Altura efetiva de explosão (Iluminativa abre 450 m acima do alvo)
    const effectiveTargetAlt = ammoMeta.illumination
      ? targetAlt + (ammoMeta.burstHeightM || 450)
      : targetAlt;

    // 3. Cálculo individual para cada uma das 4 peças
    const solvedPieces = piecePositions.map((p) => {
      // Define ponto de impacto individual conforme tipo de feixe
      let aimE = targetE;
      let aimN = targetN;

      if (sheafType === 'parallel') {
        aimE = targetE + (p.e - baseE);
        aimN = targetN + (p.n - baseN);
      } else if (sheafType === 'open') {
        const openSpacing = 35; // 35 m entre arrebentamentos
        const lineAz = G.normMil(baseGeom.azMil + 1600);
        const shift = G.polarDelta((p.index - baseIdx) * openSpacing, lineAz);
        aimE = targetE + shift.dE;
        aimN = targetN + shift.dN;
      }

      const geom = G.inverseUtm(p.e, p.n, aimE, aimN);
      const rawDist = geom.dist;
      const rawAz = geom.azMil;

      // Interpola dados base na distância topográfica
      const baseRow = interpolateRow(selectedChargeObj, rawDist);

      // Correções balísticas de alcance (em metros)
      const corrFK = rawDist * factorK;
      const pWindDiff = (effWindFromMil - rawAz) * C.MIL_TO_RAD;
      const pWindLong = -effWindSpeed * Math.cos(pWindDiff);
      const pWindCross = effWindSpeed * Math.sin(pWindDiff);

      const corrWindLongM = pWindLong * baseRow.wl;
      const corrDensM = densityInfo.deltaRhoPct * baseRow.dn;
      const corrWeightM = projWeightVar * baseRow.wt;
      const corrPropTempM = ((propTemp - 21) / 10) * baseRow.pt;

      // Correção de desnível (dpa: variação de alcance por +10 m de desnível)
      const deltaH = effectiveTargetAlt - baseAlt;
      const corrAltM = (deltaH / 10) * baseRow.dpa;

      // Alcance equivalente de tabela (compensando fatores balísticos e Fator K)
      // Se vento de cauda alonga (+corrWindLongM), atiramos com alcance de tabela menor (-corrWindLongM)
      const ballisticRange =
        rawDist + corrFK - corrWindLongM - corrDensM - corrWeightM - corrPropTempM - corrAltM;

      const finalRow = interpolateRow(selectedChargeObj, ballisticRange);

      // Sítio geométrico (milésimos)
      const siteMil = rawDist > 10 ? Math.atan2(deltaH, rawDist) * C.RAD_TO_MIL : 0;

      // Deriva total = Derivação giroscópica + correção de vento transversal
      // Vento vindo da direita (+pWindCross) empurra para a esquerda -> apontar mais à direita (+deriva)
      const windDeflectionMil = pWindCross * baseRow.wc;
      const totalDriftMil = finalRow.dr + windDeflectionMil;

      // Azimute de Tiro corrigido e Deriva na Luneta (referência Frente da Seção)
      const fireAzNQ = G.normMil(rawAz + totalDriftMil);
      const deflectionFromFront = G.deltaMil(fireAzNQ, frontAz);
      const sightDeflection = G.normMil(C.BASE_DEFLECTION - deflectionFromFront);

      const elevationMil = Math.round(finalRow.el);
      const siteRounded = Math.round(siteMil);
      const totalElvMil = elevationMil + siteRounded;

      const outOfRange =
        rawDist < selectedChargeObj.minRange ||
        rawDist > selectedChargeObj.maxRange ||
        ballisticRange < selectedChargeObj.minRange * 0.9 ||
        ballisticRange > selectedChargeObj.maxRange * 1.03 ||
        totalElvMil < C.MIN_ELEV_MIL ||
        totalElvMil > C.MAX_ELEV_MIL;

      return {
        ...p,
        aimE: Math.round(aimE),
        aimN: Math.round(aimN),
        distM: Math.round(rawDist),
        ballisticRangeM: Math.round(ballisticRange),
        azNQ: Math.round(rawAz),
        fireAzNQ: Math.round(fireAzNQ),
        driftMil: Math.round(totalDriftMil),
        deflectionFromFront: Math.round(deflectionFromFront),
        sightMil: Math.round(sightDeflection),
        alcaMil: elevationMil,
        siteMil: siteRounded,
        elvMil: totalElvMil,
        tofSec: Number(finalRow.tof.toFixed(1)),
        apexM: Math.round(finalRow.ap),
        forkMil: Math.round(finalRow.fk),
        outOfRange
      };
    });

    const baseSolved = solvedPieces[baseIdx] || solvedPieces[0];

    // 4. Checagem de Crista Intermediária (trajetória assimétrica 57%)
    const crestResult = checkCrestClearance({
      totalRange: baseSolved.distM,
      gunAlt: baseAlt,
      targetAlt: effectiveTargetAlt,
      apexAboveGun: baseSolved.apexM,
      crestDist: state.crestDist,
      crestAlt: state.crestAlt,
      terrainProfile: state.terrainProfile
    });

    // 5. Checagem de Tropas Amigas (TSZ)
    const tszResult = checkTszSafety(
      solvedPieces,
      targetE,
      targetN,
      state.friendlyE,
      state.friendlyN,
      state.friendlyRadius
    );

    const anyOutOfRange = solvedPieces.some((p) => p.outOfRange);
    const absoluteOutOfEnvelope =
      baseGeom.dist < ammoMeta.minRange || baseGeom.dist > ammoMeta.maxRange;

    return {
      baseIdx,
      baseSolved,
      pieces: solvedPieces,
      ammoMeta,
      charge: selectedChargeObj.charge,
      v0: selectedChargeObj.v0,
      chargeMinRange: selectedChargeObj.minRange,
      chargeMaxRange: selectedChargeObj.maxRange,
      densityInfo,
      windLongKt: Number(windLongKt.toFixed(1)),
      windCrossKt: Number(windCrossKt.toFixed(1)),
      factorK,
      crestResult,
      tszResult,
      anyOutOfRange,
      absoluteOutOfEnvelope
    };
  }

  return {
    computeAirDensityRatio,
    interpolateRow,
    selectChargeTable,
    accumulateLongitudinalFactorK,
    trajectoryAltitudeAt,
    checkCrestClearance,
    checkTszSafety,
    computePiecePositions,
    solveBatteryFiringSolution
  };
})();
