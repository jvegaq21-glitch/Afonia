const KEYS = { devices: 'kwhtrack-intermedia-devices', bills: 'kwhtrack-intermedia-bills', rate: 'kwhtrack-intermedia-rate' };
let devices = LocalStore.read(KEYS.devices, []);
let bills = LocalStore.read(KEYS.bills, []);
let rate = Number(localStorage.getItem(KEYS.rate)) || 1000;
let search = '';
let sortBy = 'name';
let databaseAvailable = false;
const deviceForm = document.querySelector('#device-form');
const billForm = document.querySelector('#bill-form');
const formatMoney = (value) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value);

function saveLocal() {
  LocalStore.write(KEYS.devices, devices);
  LocalStore.write(KEYS.bills, bills);
  try { localStorage.setItem(KEYS.rate, String(rate)); } catch { /* storage may be unavailable */ }
}

async function api(path, options = {}) {
  const response = await fetch('/api' + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers }
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'No se pudo completar la solicitud.');
  return result;
}

async function connect() {
  try {
    const health = await api('/health');
    databaseAvailable = health.database === 'connected';
    document.querySelector('#connection-status').textContent = databaseAvailable
      ? 'Conectado al servidor y a MySQL.'
      : 'Servidor iniciado, pero MySQL no está disponible. Se usa el almacenamiento local.';
    if (!databaseAvailable) return;
    const data = await api('/dashboard');
    devices = data.devices;
    bills = data.bills;
    rate = Number(data.rate);
    document.querySelector('#rate-form').elements.rate.value = rate;
    renderDevices();
    renderBills(bills);
  } catch {
    databaseAvailable = false;
    document.querySelector('#connection-status').textContent = 'Modo local: los datos se guardan en este navegador. Inicia el servidor para conectar MySQL.';
  }
}

function renderDevices() {
  const body = document.querySelector('#device-list');
  body.replaceChildren();
  const shown = [...devices]
    .filter((item) => `${item.name} ${item.category}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => sortBy === 'name' ? a.name.localeCompare(b.name) : monthlyConsumption(b) - monthlyConsumption(a));
  for (const device of shown) {
    const row = document.createElement('tr');
    const info = document.createElement('td');
    const name = document.createElement('strong');
    name.textContent = device.name;
    const category = document.createElement('span');
    category.textContent = device.category;
    info.append(name, category);
    row.append(info, makeCell(`${device.watts} W`), makeCell(`${device.hours} h`), makeCell(`${monthlyConsumption(device).toFixed(1)} kWh`));
    const actions = document.createElement('td');
    const buttons = document.createElement('div');
    buttons.className = 'row-actions';
    buttons.append(actionButton('Editar', 'edit', device.id), actionButton('Eliminar', 'remove', device.id));
    actions.append(buttons);
    row.append(actions);
    body.append(row);
  }
  document.querySelector('#device-count').textContent = String(devices.length);
  const summary = householdSummary(devices, rate);
  document.querySelector('#total-kwh').textContent = summary.kwh.toFixed(1);
  document.querySelector('#total-cost').textContent = formatMoney(summary.cost);
  document.querySelector('#empty-message').hidden = devices.length > 0;
  document.querySelector('#no-results').hidden = devices.length === 0 || shown.length > 0;
}

function makeCell(value) {
  const cell = document.createElement('td');
  cell.textContent = value;
  return cell;
}
function actionButton(label, action, id) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'small-button';
  button.textContent = label;
  button.dataset.action = action;
  button.dataset.id = id;
  return button;
}
function message(selector, text) { document.querySelector(selector).textContent = text; }
function resetDeviceForm() {
  deviceForm.reset();
  deviceForm.elements.id.value = '';
  deviceForm.elements.watts.value = 150;
  deviceForm.elements.hours.value = 4;
  deviceForm.elements.quantity.value = 1;
  document.querySelector('#save-device').textContent = 'Guardar equipo';
  document.querySelector('#cancel-edit').hidden = true;
}

document.querySelector('#search-input').addEventListener('input', (event) => {
  search = event.target.value.trim();
  renderDevices();
});
document.querySelector('#sort-select').addEventListener('change', (event) => {
  sortBy = event.target.value;
  renderDevices();
});

document.querySelector('#device-list').addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const index = devices.findIndex((item) => String(item.id) === button.dataset.id);
  if (index < 0) return;
  if (button.dataset.action === 'remove') {
    try {
      if (databaseAvailable) await api(`/devices/${button.dataset.id}`, { method: 'DELETE' });
    } catch (error) { return message('#form-message', error.message); }
    devices.splice(index, 1);
    saveLocal();
    renderDevices();
    return message('#form-message', 'Equipo eliminado.');
  }
  const item = devices[index];
  deviceForm.elements.id.value = item.id;
  deviceForm.elements.name.value = item.name;
  deviceForm.elements.category.value = item.category;
  deviceForm.elements.watts.value = item.watts;
  deviceForm.elements.hours.value = item.hours;
  deviceForm.elements.quantity.value = item.quantity;
  document.querySelector('#save-device').textContent = 'Guardar cambios';
  document.querySelector('#cancel-edit').hidden = false;
  document.querySelector('#agregar').scrollIntoView({ behavior: 'smooth' });
  deviceForm.elements.name.focus();
});

deviceForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(deviceForm);
  const id = data.get('id');
  const item = {
    name: String(data.get('name')).trim(),
    category: data.get('category'),
    watts: Number(data.get('watts')),
    hours: Number(data.get('hours')),
    quantity: Number(data.get('quantity'))
  };
  const index = devices.findIndex((device) => String(device.id) === id);
  try {
    if (databaseAvailable) {
      const saved = id
        ? await api(`/devices/${id}`, { method: 'PUT', body: JSON.stringify(item) })
        : await api('/devices', { method: 'POST', body: JSON.stringify(item) });
      if (id) devices[index] = saved;
      else devices.push(saved);
    } else if (id) devices[index] = { ...item, id };
    else devices.push({ ...item, id: crypto.randomUUID() });
  } catch (error) { return message('#form-message', error.message); }
  saveLocal();
  resetDeviceForm();
  renderDevices();
  message('#form-message', id ? 'Cambios guardados.' : 'Equipo guardado.');
});
document.querySelector('#cancel-edit').addEventListener('click', resetDeviceForm);

billForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(billForm);
  const id = data.get('id');
  const item = { date: data.get('date'), kwh: Number(data.get('kwh')), amount: Number(data.get('amount')) };
  const index = bills.findIndex((bill) => String(bill.id) === id);
  try {
    if (databaseAvailable) {
      const saved = id
        ? await api(`/bills/${id}`, { method: 'PUT', body: JSON.stringify(item) })
        : await api('/bills', { method: 'POST', body: JSON.stringify(item) });
      if (id) bills[index] = saved;
      else bills.push(saved);
    } else if (id) bills[index] = { ...item, id };
    else bills.push({ ...item, id: crypto.randomUUID() });
  } catch (error) { return message('#bill-message', error.message); }
  saveLocal();
  billForm.reset();
  billForm.elements.id.value = '';
  billForm.querySelector('button[type="submit"]').textContent = 'Guardar factura';
  renderBills(bills);
  message('#bill-message', id ? 'Cambios de factura guardados.' : 'Factura guardada.');
});

document.querySelector('#bill-list').addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-bill-action]');
  if (!button) return;
  const index = bills.findIndex((bill) => String(bill.id) === button.dataset.id);
  if (index < 0) return;
  if (button.dataset.billAction === 'remove') {
    try {
      if (databaseAvailable) await api(`/bills/${button.dataset.id}`, { method: 'DELETE' });
    } catch (error) { return message('#bill-message', error.message); }
    bills.splice(index, 1);
    saveLocal();
    renderBills(bills);
    return message('#bill-message', 'Factura eliminada.');
  }
  const bill = bills[index];
  billForm.elements.id.value = bill.id;
  billForm.elements.date.value = bill.date.slice(0, 10);
  billForm.elements.kwh.value = bill.kwh;
  billForm.elements.amount.value = bill.amount;
  billForm.querySelector('button[type="submit"]').textContent = 'Guardar cambios';
  billForm.scrollIntoView({ behavior: 'smooth' });
});

const rateForm = document.querySelector('#rate-form');
rateForm.elements.rate.value = rate;
rateForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const nextRate = Number(rateForm.elements.rate.value);
  try {
    if (databaseAvailable) await api('/settings/rate', { method: 'PUT', body: JSON.stringify({ rate: nextRate }) });
  } catch (error) { return message('#rate-message', error.message); }
  rate = nextRate;
  saveLocal();
  renderDevices();
  message('#rate-message', 'Tarifa actualizada.');
});

const menuToggle = document.querySelector('#menu-toggle');
menuToggle.addEventListener('click', () => {
  const expanded = menuToggle.getAttribute('aria-expanded') !== 'true';
  menuToggle.setAttribute('aria-expanded', String(expanded));
  document.querySelector('#main-nav').classList.toggle('open', expanded);
});
document.querySelector('#main-nav').addEventListener('click', (event) => {
  if (!event.target.closest('a')) return;
  menuToggle.setAttribute('aria-expanded', 'false');
  document.querySelector('#main-nav').classList.remove('open');
});

renderDevices();
renderBills(bills);
connect();
