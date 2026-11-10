function renderBills(bills) {
  const list = document.querySelector('#bill-list');
  list.replaceChildren();
  const sorted = [...bills].sort((a, b) => b.date.localeCompare(a.date));
  document.querySelector('#bill-empty').hidden = sorted.length > 0;
  const latest = sorted[0];
  document.querySelector('#latest-bill').textContent = latest ? formatMoney(latest.amount) : 'Sin registros';
  document.querySelector('#latest-bill-date').textContent = latest ? formatDate(latest.date) : 'Agrega una factura abajo';
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

function formatDate(value) {
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
}
