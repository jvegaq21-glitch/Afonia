function renderBills(bills) {
  const list = document.querySelector('#bill-list');
  list.replaceChildren();
  const sorted = [...bills].sort((a, b) => String(b.date).slice(0, 10).localeCompare(String(a.date).slice(0, 10)));
  document.querySelector('#bill-empty').hidden = sorted.length > 0;
  const latest = sorted[0];
  document.querySelector('#latest-bill').textContent = latest ? formatMoney(latest.amount) : 'Sin registros';
  document.querySelector('#latest-bill-date').textContent = latest ? formatDate(latest.date) : 'Agrega una factura abajo';

  const alertBox = getBillAlertBox();
  if (sorted.length >= 4) {
    const latestKwh = Number(sorted[0].kwh);
    const avgPrev = sorted.slice(1, 4).reduce((sum, b) => sum + Number(b.kwh), 0) / 3;
    const increase = avgPrev > 0 ? ((latestKwh - avgPrev) / avgPrev) * 100 : 0;

    if (increase > 20) {
      alertBox.textContent = `Alerta de sobreconsumo: la última factura (${latestKwh} kWh) subió ${increase.toFixed(1)}% frente al promedio de las 3 anteriores (${avgPrev.toFixed(1)} kWh).`;
      alertBox.hidden = false;
    } else {
      alertBox.hidden = true;
    }
  } else {
    alertBox.hidden = true;
  }

  for (const bill of sorted.slice(0, 5)) {
    const item = document.createElement('li');
    item.className = 'bill-row';
    const date = document.createElement('span');
    date.textContent = `${formatDate(bill.date)} · ${bill.kwh} kWh`;
    const amount = document.createElement('strong');
    amount.textContent = formatMoney(bill.amount);
    const actions = document.createElement('span');
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'small-button';
    edit.textContent = 'Editar';
    edit.dataset.billAction = 'edit';
    edit.dataset.id = bill.id;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'small-button';
    remove.textContent = 'Eliminar';
    remove.dataset.billAction = 'remove';
    remove.dataset.id = bill.id;
    actions.append(edit, remove);
    item.append(date, amount, actions);
    list.append(item);
  }
}

function getBillAlertBox() {
  let box = document.querySelector('#bill-alert');
  if (!box) {
    box = document.createElement('p');
    box.id = 'bill-alert';
    box.className = 'message';
    box.setAttribute('role', 'alert');
    box.hidden = true;
    const history = document.querySelector('.bill-history');
    if (history) history.before(box);
  }
  return box;
}

function formatDate(value) {
  const dateOnly = String(value).slice(0, 10);
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${dateOnly}T00:00:00Z`));
}