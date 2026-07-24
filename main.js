const {
  parseMoney,
  simulateFinancing,
  curvePresets,
  clampCurveValue,
  CURVE_MIN,
  CURVE_MAX
} = PriceMath;

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const number = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
let mode = 'price';
let paymentChart, breakdownChart, curveChart, lastSchedule = [];
let activeCurvePoint = 0, curveDragging = false, curveAnimationFrame = null;
let curveControls = [...curvePresets.linear];

const formatInputMoney = input => {
  const raw = input.value.replace(/\D/g, '');
  input.value = number.format((Number(raw) || 0) / 100);
};

function initCurveEditor() {
  if (curveChart) {
    curveChart.resize();
    return;
  }

  curveChart = new Chart(document.getElementById('curveEditor'), {
    type: 'line',
    data: {
      labels: ['Início', '20%', '40%', '60%', '80%', 'Fim'],
      datasets: [{
        data: curveControls,
        borderColor: '#524fa0',
        backgroundColor: 'rgba(82,79,160,.12)',
        borderWidth: 3,
        fill: true,
        tension: .34,
        pointRadius: 6,
        pointHoverRadius: 8,
        pointHitRadius: 18,
        pointBackgroundColor: context => context.dataIndex === activeCurvePoint ? '#151728' : '#ffffff',
        pointBorderColor: '#524fa0',
        pointBorderWidth: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { intersect: false, mode: 'nearest' },
      layout: { padding: { top: 15, right: 14, bottom: 8, left: 4 } },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: context => `Peso relativo: ${Number(context.raw).toFixed(2)}×` } }
      },
      scales: {
        x: { display: false },
        y: {
          min: CURVE_MIN,
          max: CURVE_MAX,
          border: { display: false },
          grid: { color: 'rgba(82,79,160,.08)' },
          ticks: { stepSize: .5, callback: value => `${Number(value).toFixed(1)}×`, font: { size: 9 } }
        }
      }
    }
  });

  const canvas = document.getElementById('curveEditor');
  canvas.addEventListener('pointerdown', startCurveDrag);
  canvas.addEventListener('pointermove', moveCurveDrag);
  canvas.addEventListener('pointerup', endCurveDrag);
  canvas.addEventListener('pointercancel', endCurveDrag);
  canvas.addEventListener('keydown', handleCurveKeyboard);
}

function selectCurvePoint(index) {
  activeCurvePoint = Math.max(0, Math.min(curveControls.length - 1, index));
  if (curveChart) curveChart.update('none');
}

function startCurveDrag(event) {
  const point = curveChart.getElementsAtEventForMode(event, 'nearest', { intersect: false }, false)[0];
  if (!point) return;
  event.preventDefault();
  selectCurvePoint(point.index);
  curveDragging = true;
  document.getElementById('curveEditorWrap').classList.add('dragging');
  event.currentTarget.setPointerCapture(event.pointerId);
  setCurvePointFromPointer(event);
}

function moveCurveDrag(event) {
  if (!curveDragging) return;
  event.preventDefault();
  setCurvePointFromPointer(event);
}

function endCurveDrag(event) {
  if (!curveDragging) return;
  curveDragging = false;
  document.getElementById('curveEditorWrap').classList.remove('dragging');
  if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
}

function setCurvePointFromPointer(event) {
  const value = curveChart.scales.y.getValueForPixel(event.offsetY);
  curveControls[activeCurvePoint] = clampCurveValue(value, 0.05);
  curveChart.data.datasets[0].data = curveControls;
  curveChart.update('none');
  document.querySelectorAll('.curve-preset').forEach(button => button.classList.remove('active'));
  queueCurveSimulation();
}

function handleCurveKeyboard(event) {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    selectCurvePoint(activeCurvePoint + (event.key === 'ArrowRight' ? 1 : -1));
    return;
  }
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault();
    const direction = event.key === 'ArrowUp' ? 1 : -1;
    curveControls[activeCurvePoint] = clampCurveValue(curveControls[activeCurvePoint] + direction * .05, 0);
    curveChart.data.datasets[0].data = curveControls;
    curveChart.update('none');
    document.querySelectorAll('.curve-preset').forEach(button => button.classList.remove('active'));
    queueCurveSimulation();
  }
}

function queueCurveSimulation() {
  if (curveAnimationFrame) cancelAnimationFrame(curveAnimationFrame);
  curveAnimationFrame = requestAnimationFrame(() => {
    curveAnimationFrame = null;
    simulate();
  });
}

document.querySelectorAll('.money').forEach(input => input.addEventListener('input', () => formatInputMoney(input)));

document.querySelectorAll('.segmented button').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.segmented button').forEach(b => b.classList.remove('active'));
    button.classList.add('active');
    mode = button.dataset.mode;
    document.getElementById('growingOptions').classList.toggle('visible', mode === 'growing');
    if (mode === 'growing') requestAnimationFrame(initCurveEditor);
    simulate();
  });
});

document.querySelectorAll('.curve-preset').forEach(button => {
  button.addEventListener('click', () => {
    curveControls = [...curvePresets[button.dataset.curvePreset]];
    document.querySelectorAll('.curve-preset').forEach(item => item.classList.toggle('active', item === button));
    if (curveChart) {
      curveChart.data.datasets[0].data = curveControls;
      curveChart.update('none');
    }
    simulate();
  });
});

const balloonToggle = document.getElementById('balloonToggle');
balloonToggle.addEventListener('change', () => {
  document.getElementById('balloonOptions').classList.toggle('visible', balloonToggle.checked);
  if (balloonToggle.checked && !document.querySelector('.balloon-item')) addBalloon(6, 10000);
});

function addBalloon(month = 6, amount = 10000) {
  const item = document.createElement('div');
  item.className = 'balloon-item';
  item.innerHTML = `
    <div class="input-wrap"><input type="number" min="1" value="${month}" class="balloon-month has-suffix"><span class="suffix">mês</span></div>
    <div class="input-wrap"><span class="prefix">R$</span><input value="${number.format(amount)}" class="balloon-value money has-prefix"></div>
    <button type="button" class="remove" aria-label="Remover balão">×</button>`;
  item.querySelector('.money').addEventListener('input', e => formatInputMoney(e.target));
  item.querySelector('.remove').addEventListener('click', () => item.remove());
  document.getElementById('balloonList').appendChild(item);
}

document.getElementById('addBalloon').addEventListener('click', () => addBalloon());

function getBalloons(months) {
  if (!balloonToggle.checked) return new Map();
  const map = new Map();
  document.querySelectorAll('.balloon-item').forEach(item => {
    const month = Math.max(1, Math.min(months, Number(item.querySelector('.balloon-month').value) || 1));
    const value = Math.max(0, parseMoney(item.querySelector('.balloon-value').value));
    map.set(month, (map.get(month) || 0) + value);
  });
  return map;
}

function simulate() {
  const property = parseMoney(document.getElementById('propertyValue').value);
  const down = parseMoney(document.getElementById('downPayment').value);
  const months = Math.max(1, Number(document.getElementById('months').value) || 1);
  const rate = Math.max(0, Number(document.getElementById('interest').value) || 0) / 100;
  const balloons = getBalloons(months);

  const result = simulateFinancing({
    property,
    down,
    months,
    rate,
    mode,
    balloons,
    curveControls
  });

  if (result.error) {
    alert(result.error);
    return;
  }

  lastSchedule = result.schedule;
  render(result);
}

function render(data) {
  document.getElementById('emptyState').hidden = true;
  document.getElementById('summary').hidden = false;
  document.getElementById('visualGrid').hidden = false;
  document.getElementById('tableCard').hidden = false;

  const totalPaid = data.down + data.totalRegular + data.totalBalloon;
  document.getElementById('financedMetric').textContent = brl.format(data.principal);
  document.getElementById('firstMetric').textContent = brl.format(data.schedule[0]?.payment || 0);
  document.getElementById('lastMetric').textContent = brl.format(data.schedule[data.schedule.length - 1]?.payment || 0);
  document.getElementById('totalMetric').textContent = brl.format(totalPaid);
  document.getElementById('firstMetricHint').textContent = mode === 'growing' ? 'Parcela inicial ajustada' : 'Parcela mensal Price';

  document.getElementById('principalLegend').textContent = brl.format(data.principal);
  document.getElementById('interestLegend').textContent = brl.format(data.totalInterest);
  document.getElementById('balloonLegend').textContent = brl.format(data.totalBalloon);

  const tbody = document.getElementById('scheduleBody');
  tbody.innerHTML = data.schedule.map(row => `
    <tr class="${row.balloon > 0 ? 'balloon-row' : ''}">
      <td>${row.month}${row.balloon > 0 ? '<span class="badge-balloon">BALÃO</span>' : ''}</td>
      <td>${brl.format(row.payment)}</td>
      <td>${brl.format(row.interest)}</td>
      <td>${brl.format(row.amortization)}</td>
      <td>${brl.format(row.balloon)}</td>
      <td>${brl.format(row.balance)}</td>
    </tr>`).join('');

  if (paymentChart) paymentChart.destroy();
  paymentChart = new Chart(document.getElementById('paymentChart'), {
    type: 'line',
    data: {
      labels: data.schedule.map(r => `M${r.month}`),
      datasets: [
        { label: 'Parcela', data: data.schedule.map(r => r.payment + r.balloon), borderColor: '#524fa0', backgroundColor: 'rgba(82,79,160,.10)', fill: true, tension: .32, pointRadius: 0, borderWidth: 2.5, yAxisID: 'y' },
        { label: 'Saldo devedor', data: data.schedule.map(r => r.balance), borderColor: '#a7a9b9', backgroundColor: 'transparent', tension: .25, pointRadius: 0, borderDash: [5,5], borderWidth: 1.8, yAxisID: 'y1' }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { usePointStyle: true, boxWidth: 8, font: { family: 'Inter', size: 11 } } }, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${brl.format(ctx.raw)}` } } },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 10, font: { size: 10 } } },
        y: { position: 'left', grid: { color: '#eff0f5' }, ticks: { callback: v => 'R$ ' + Math.round(v/1000) + 'k', font: { size: 10 } } },
        y1: { position: 'right', grid: { drawOnChartArea: false }, ticks: { callback: v => 'R$ ' + Math.round(v/1000) + 'k', font: { size: 10 } } }
      }
    }
  });

  if (breakdownChart) breakdownChart.destroy();
  breakdownChart = new Chart(document.getElementById('breakdownChart'), {
    type: 'doughnut',
    data: { labels: ['Principal', 'Juros', 'Entrada'], datasets: [{ data: [data.principal, data.totalInterest, data.down], backgroundColor: ['#524fa0', '#8b85ff', '#d9d8f6'], borderWidth: 0, hoverOffset: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '72%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.label}: ${brl.format(ctx.raw)}` } } } }
  });
}

document.getElementById('calculate').addEventListener('click', simulate);
document.getElementById('exportCsv').addEventListener('click', () => {
  if (!lastSchedule.length) return;
  const rows = [['Mês','Parcela','Juros','Amortização','Balão','Saldo'], ...lastSchedule.map(r => [r.month, r.payment, r.interest, r.amortization, r.balloon, r.balance])];
  const csv = '\ufeff' + rows.map(row => row.map(v => typeof v === 'number' ? String(v).replace('.', ',') : v).join(';')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'simulacao-financiamento.csv'; a.click(); URL.revokeObjectURL(a.href);
});

simulate();
