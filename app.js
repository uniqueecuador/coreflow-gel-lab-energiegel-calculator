/**
 * Energiegel Calculator — app.js
 * Coreflow Gel Lab v1.1 (standalone, geen sensor)
 *
 * Sensor-integratie staat uitgecommentarieerd onderaan dit bestand.
 * Zoek op "GLUCOSE SENSOR" om het terug te vinden.
 */

// ─── State ────────────────────────────────────────────────────────────────────

const state = {
  carbLevel: 'medium',
  batchGrams: 200,
  fruitPct: 0.20,
  fruitType: 'framboos',
};

// ─── Data ─────────────────────────────────────────────────────────────────────

let recipes = null;

async function loadRecipes() {
  const res = await fetch('recipes.json');
  recipes = await res.json();
  init();
}

// ─── Calculation engine ───────────────────────────────────────────────────────

function calc() {
  const carbLevel = recipes.carb_levels.find(c => c.id === state.carbLevel);
  const sachetSize = recipes.meta.sachet_size_g;
  const numSachets = state.batchGrams / sachetSize;
  const carbsPerSachet = carbLevel.carbs_per_sachet_g;
  const baseCarbs = 45;
  const carbScale = carbsPerSachet / baseCarbs;
  const fruitFraction = state.fruitPct / 0.20;

  const results = {};

  for (const ing of recipes.ingredients) {
    let gramsPerSachet;

    switch (ing.scales_with) {
      case 'fruit_pct':
        gramsPerSachet = ing.base_g_per_sachet * fruitFraction;
        break;
      case 'inverse_carbs': {
        const delta = carbsPerSachet - baseCarbs;
        gramsPerSachet = Math.max(20, ing.base_g_per_sachet - delta * 0.7 - (state.fruitPct - 0.20) * 25 * 0.3);
        break;
      }
      case 'carbs':
        gramsPerSachet = ing.base_g_per_sachet * carbScale;
        break;
      case 'capped':
        gramsPerSachet = Math.min(ing.base_g_per_sachet, ing.max_g_per_sachet || ing.base_g_per_sachet);
        break;
      case 'linear':
      default:
        gramsPerSachet = ing.base_g_per_sachet;
        break;
    }

    results[ing.id] = {
      ...ing,
      g_per_sachet: gramsPerSachet,
      g_batch: gramsPerSachet * numSachets,
    };
  }

  const osmolality = Math.round(180 + carbsPerSachet * 3.8 + state.fruitPct * 40);
  const prepTime = Math.max(15, Math.round(10 + numSachets * 5));
  const totalCarbs = carbsPerSachet * numSachets;

  return {
    carbLevel,
    numSachets,
    carbsPerSachet,
    totalCarbs,
    osmolality,
    prepTime,
    giRisk: carbLevel.gi_risk,
    ingredients: results,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtG(g) {
  if (g === undefined || g === null) return '—';
  if (g < 1) return g.toFixed(2) + ' g';
  return g.toFixed(1) + ' g';
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ─── Render ───────────────────────────────────────────────────────────────────

function render() {
  const d = calc();

  setText('metric-sachets', d.numSachets.toFixed(1));
  setText('metric-carbs', Math.round(d.totalCarbs) + ' g');
  setText('metric-time', '~' + d.prepTime + ' min');
  setText('metric-osmo', d.osmolality + ' mOsm');

  const riskMap = {
    low:    ['Laag',  'badge-success'],
    medium: ['Matig', 'badge-warning'],
    high:   ['Hoog',  'badge-danger'],
  };
  const [riskLabel, riskClass] = riskMap[d.giRisk] || riskMap['low'];
  const riskEl = document.getElementById('gi-risk');
  if (riskEl) { riskEl.textContent = riskLabel; riskEl.className = 'badge ' + riskClass; }

  const warnEl = document.getElementById('warning-banner');
  if (warnEl) {
    if (d.osmolality > 450) {
      warnEl.innerHTML = '<span class="warn-icon">⚠</span> Osmolaliteit >450 mOsm: verhoogd risico op maagklachten. Overweeg te splitsen in 2 sachets of voeg 20ml extra water toe.';
      warnEl.className = 'warning-banner warning-high';
      warnEl.style.display = 'flex';
    } else if (d.osmolality > 380) {
      warnEl.innerHTML = '<span class="warn-icon">ℹ</span> 60g+ variant: test eerst tijdens een rustige training op maagcomfort.';
      warnEl.className = 'warning-banner warning-medium';
      warnEl.style.display = 'flex';
    } else {
      warnEl.style.display = 'none';
    }
  }

  const tbody = document.getElementById('ingredients-tbody');
  if (tbody) {
    tbody.innerHTML = '';
    const categories = ['base', 'carbs', 'electrolytes', 'flavor', 'texture'];
    const catLabels  = { base: 'Vloeistofbasis', carbs: 'Koolhydraten', electrolytes: 'Elektrolyten', flavor: 'Zuren & smaak', texture: 'Textuur' };

    for (const cat of categories) {
      const ings = Object.values(d.ingredients).filter(i => i.category === cat);
      if (!ings.length) continue;

      const headerRow = document.createElement('tr');
      headerRow.className = 'category-header';
      headerRow.innerHTML = `<td colspan="4">${catLabels[cat]}</td>`;
      tbody.appendChild(headerRow);

      for (const ing of ings) {
        const row = document.createElement('tr');
        row.className = ing.essential ? '' : 'optional-row';

        const stockBadge = ing.must_buy
          ? '<span class="badge badge-danger">bijkopen</span>'
          : ing.in_stock
            ? '<span class="badge badge-success">in stock</span>'
            : '<span class="badge badge-warning">nodig</span>';

        row.innerHTML = `
          <td class="ing-name">
            ${ing.name}${stockBadge}
            ${!ing.essential ? '<span class="badge badge-neutral">optioneel</span>' : ''}
          </td>
          <td class="ing-notes">${ing.notes}</td>
          <td class="ing-sachet">${fmtG(ing.g_per_sachet)}</td>
          <td class="ing-batch">${fmtG(ing.g_batch)}</td>
        `;
        tbody.appendChild(row);
      }
    }

    const total = Object.values(d.ingredients).reduce((s, i) => s + (i.g_batch || 0), 0);
    const totRow = document.createElement('tr');
    totRow.className = 'total-row';
    totRow.innerHTML = `<td colspan="2"><strong>Totaal batch</strong></td><td></td><td class="ing-batch"><strong>${fmtG(total)}</strong></td>`;
    tbody.appendChild(totRow);
  }
}

// ─── Event handlers ───────────────────────────────────────────────────────────

function onCarbChange(levelId) {
  state.carbLevel = levelId;
  document.querySelectorAll('.carb-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.level === levelId);
  });
  render();
}

function onBatchChange(val) {
  state.batchGrams = parseInt(val);
  setText('batch-display', val + ' g');
  render();
}

function onFruitPctChange(val) {
  state.fruitPct = parseInt(val) / 100;
  setText('fruit-display', val + ' %');
  render();
}

function onFruitTypeChange(val) {
  state.fruitType = val;
  render();
}

// ─── Init ─────────────────────────────────────────────────────────────────────

function init() {
  const tabContainer = document.getElementById('carb-tabs');
  if (tabContainer) {
    tabContainer.innerHTML = '';
    for (const cl of recipes.carb_levels) {
      const btn = document.createElement('button');
      btn.className = 'carb-tab' + (cl.id === state.carbLevel ? ' active' : '');
      btn.dataset.level = cl.id;
      btn.textContent = cl.label;
      btn.title = cl.use_case;
      btn.onclick = () => onCarbChange(cl.id);
      tabContainer.appendChild(btn);
    }
  }

  const fruitSel = document.getElementById('fruit-select');
  if (fruitSel) {
    fruitSel.innerHTML = '';
    for (const ft of recipes.fruit_types) {
      const opt = document.createElement('option');
      opt.value = ft.id;
      opt.textContent = ft.label;
      fruitSel.appendChild(opt);
    }
    fruitSel.value = state.fruitType;
    fruitSel.onchange = e => onFruitTypeChange(e.target.value);
  }

  const protocolEl = document.getElementById('protocol-steps');
  if (protocolEl) {
    protocolEl.innerHTML = '';
    for (const step of recipes.protocol) {
      const li = document.createElement('li');
      li.innerHTML = `<strong>${step.title}</strong> — ${step.detail}`;
      protocolEl.appendChild(li);
    }
  }

  render();
}

loadRecipes();


// ═══════════════════════════════════════════════════════════════════════════════
// GLUCOSE SENSOR — Coreflow vest integratie
// Verwijder /* en */ hieronder om te activeren.
// Voeg ook het sensor-paneel terug in index.html (zie README).
// ═══════════════════════════════════════════════════════════════════════════════

/*

let sensorInstance = null;

class GlucoseSensor {
  constructor(endpoint) {
    this.endpoint   = endpoint;
    this.connected  = false;
    this.latestReading = null;
    this.onReading  = null;
    this._ws        = null;
    this._pollTimer = null;
  }

  async connect() {
    if (!this.endpoint) { this._startDemoMode(); return; }
    try {
      this._ws = new WebSocket(this.endpoint);
      this._ws.onopen    = () => { this.connected = true; updateSensorStatus('connected'); };
      this._ws.onmessage = (evt) => { try { this._handleReading(JSON.parse(evt.data)); } catch(e) { console.error(e); } };
      this._ws.onclose   = () => { this.connected = false; updateSensorStatus('disconnected'); setTimeout(() => this.connect(), 5000); };
      this._ws.onerror   = ()  => updateSensorStatus('error');
    } catch (e) {
      console.warn('[Sensor] WS mislukt, REST polling fallback');
      this._startPolling();
    }
  }

  async _pollOnce() {
    try { this._handleReading(await (await fetch(this.endpoint + '/latest')).json()); }
    catch(e) { updateSensorStatus('error'); }
  }

  _startPolling(ms = 10000) {
    this._pollTimer = setInterval(() => this._pollOnce(), ms);
    this._pollOnce();
  }

  _startDemoMode() {
    let base = 5.2;
    const tick = () => {
      base = Math.max(3.5, Math.min(11.0, base + (Math.random() - 0.48) * 0.3));
      const trend = base > 7 ? 'rising' : base < 4.5 ? 'falling' : 'stable';
      this._handleReading({ glucose_mmol: parseFloat(base.toFixed(1)), trend, timestamp_iso: new Date().toISOString(), device_id: 'DEMO-001' });
    };
    tick();
    this._pollTimer = setInterval(tick, 8000);
    this.connected = true;
    updateSensorStatus('demo');
  }

  _handleReading(data) {
    this.latestReading = data;
    if (this.onReading) this.onReading(data);
  }

  disconnect() {
    if (this._ws) this._ws.close();
    if (this._pollTimer) clearInterval(this._pollTimer);
    this.connected = false;
    updateSensorStatus('disconnected');
  }

  recommend(reading, thresholds) {
    if (!reading) return null;
    const g = reading.glucose_mmol, t = reading.trend;
    if (g < thresholds.low_alert_mmol  || (g < thresholds.target_min_mmol && t === 'falling'))
      return { level: 'high',   reason: `Glucose ${g} mmol/L — laag/dalend. Hogere carb-variant aanbevolen.` };
    if (g > thresholds.high_alert_mmol || (g > thresholds.target_max_mmol && t === 'rising'))
      return { level: 'low',    reason: `Glucose ${g} mmol/L — hoog/stijgend. Lagere variant of wacht.` };
    return   { level: 'medium', reason: `Glucose ${g} mmol/L — goed bereik.` };
  }
}

function updateSensorStatus(status) {
  const el = document.getElementById('sensor-status');
  if (!el) return;
  const map = { connected:['Verbonden','badge-success'], disconnected:['Verbroken','badge-danger'], demo:['Demo','badge-warning'], error:['Fout','badge-danger'] };
  const [label, cls] = map[status] || ['Onbekend','badge-neutral'];
  el.textContent = label; el.className = 'badge ' + cls;
}

function renderGlucosePanel() {
  if (!sensorInstance?.latestReading) return;
  const r = sensorInstance.latestReading;
  const thresholds = recipes.glucose_sensor.thresholds;
  document.getElementById('glucose-value').textContent = r.glucose_mmol.toFixed(1) + ' mmol/L';
  const trendMap = { rising:'↑ Stijgend', falling:'↓ Dalend', stable:'→ Stabiel', rapid_rise:'↑↑ Snel stijgend', rapid_fall:'↓↓ Snel dalend' };
  document.getElementById('glucose-trend').textContent = trendMap[r.trend] || r.trend;
  const rec = sensorInstance.recommend(r, thresholds);
  document.getElementById('glucose-recommendation').textContent = rec?.reason || '—';
  if (rec && rec.level !== state.carbLevel) {
    const autoEl = document.getElementById('glucose-auto-switch');
    if (autoEl) { autoEl.style.display = 'flex'; autoEl.dataset.recommended = rec.level; autoEl.querySelector('.rec-label').textContent = `Aanbevolen: ${rec.level}`; }
  }
}

function connectDemoSensor()    { sensorInstance = new GlucoseSensor(null);     sensorInstance.onReading = renderGlucosePanel; sensorInstance.connect(); }
function connectRealSensor(ep)  { sensorInstance = new GlucoseSensor(ep);       sensorInstance.onReading = renderGlucosePanel; sensorInstance.connect(); }
function applyRecommendedLevel() {
  const autoEl = document.getElementById('glucose-auto-switch');
  if (!autoEl) return;
  onCarbChange(autoEl.dataset.recommended);
  autoEl.style.display = 'none';
}

*/
