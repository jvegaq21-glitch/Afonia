const API = '/api';
const KEYS = { devices: 'kwhtrack-intermedia-devices', bills: 'kwhtrack-intermedia-bills', rate: 'kwhtrack-intermedia-rate' };
let devices = LocalStore.read(KEYS.devices, []);
let bills = LocalStore.read(KEYS.bills, []);
let rate = Number(localStorage.getItem(KEYS.rate)) || 1000;
let search = '';
let sortBy = 'name';
let serverAvailable = false;
let databaseAvailable = false;

const deviceForm = document.querySelector('#device-form');
const billForm = document.querySelector('#bill-form');
const money = (amount) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(amount);

function saveLocal() {
  LocalStore.write(KEYS.devices, devices);
  LocalStore.write(KEYS.bills, bills);
  try { localStorage.setItem(KEYS.rate, String(rate)); } catch { /* storage may be disabled */ }
}

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, { headers: { 'Content-Type': 'application/json', ...options.headers }, ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No se pudo completar la solicitud.');
  return data;
}

async function connect() {
  try {
    const health = await api('/health');
    serverAvailable = true;
    databaseAvailable = health.database === 'connected';
    document.querySelector('#connection-status').textContent = health.database === 'connected'
      ? 'Conectado al servidor y a MySQL.'
      : 'Servidor conectado; configura MySQL para guardar los datos en la base de datos.';
    if (databaseAvailable) {
      const data = await api('/dashboard');
      devices = data.devices;
      bills = data.bills;
      rate = data.rate;
      document.querySelector('#rate-form').elements.rate.value = rate;
      renderDevices();
      renderBills(bills);
    }
  } catch {
    document.querySelector('#connection-status').textContent = 'Modo local: los datos se guardan en este navegador. Inicia el servidor para conectar MySQL.';
  }
}

function renderDevices() {
  const body = document.querySelector('#device-list');
  body.replaceChildren();
  const matching = [...devices]
    .filter((device) => `${device.name} ${device.category}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => sortBy === 'name' ? a.name.localeCompare(b.name) : monthlyConsumption(b) - monthlyConsumption(a));
  for (const device of matching) {
    const row = document.createElement('tr');
    const info = document.createElement('td');
    const name = document.createElement('strong');
    name.textContent = device.name;
    const category = document.createElement('span');
    category.textContent = device.category;
    info.append(name, category);
    row.append(info, cell(`${device.watts} W`), cell(`${device.hours} h`), cell(`${monthlyConsumption(device).toFixed(1)} kWh`));
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
  document.querySelector('#total-cost').textContent = money(summary.cost);
  document.querySelector('#empty-message').hidden = devices.length > 0;
  document.querySelector('#no-results').hidden = devices.length === 0 || matching.length > 0;
}

function cell(text) {
  const td = document.createElement('td');
  td.textContent = text;
  return td;
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

function resetDeviceForm() {
  deviceForm.reset();
  deviceForm.elements.id.value = '';
  deviceForm.elements.watts.value = 150;
  deviceForm.elements.hours.value = 4;
  deviceForm.elements.quantity.value = 1;
  document.querySelector('#save-device').textContent = 'Guardar equipo';
  document.querySelector('#cancel-edit').hidden = true;
}

document.querySelector('#search-input').addEventListener('input', (event) => { search = event.target.value.trim(); renderDevices(); });
document.querySelector('#sort-select').addEventListener('change', (event) => { sortBy = event.target.value; renderDevices(); });

document.querySelector('#device-list').addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const index = devices.findIndex((device) => String(device.id) === button.dataset.id);
  if (index < 0) return;
  if (button.dataset.action === 'remove') {
    try { if (databaseAvailable) await api(`/devices/${button.dataset.id}`, { method: 'DELETE' }); }
    catch (error) { return showMessage('#form-message', error.message); }
    devices.splice(index, 1);
    saveLocal();
    renderDevices();
    showMessage('#form-message', 'Equipo eliminado.');
    return;
  }
  const device = devices[index];
  deviceForm.elements.id.value = device.id;
  deviceForm.elements.name.value = device.name;
  deviceForm.elements.category.value = device.category;
  deviceForm.elements.watts.value = device.watts;
  deviceForm.elements.hours.value = device.hours;
  deviceForm.elements.quantity.value = device.quantity;
  document.querySelector('#save-device').textContent = 'Guardar cambios';
  document.querySelector('#cancel-edit').hidden = false;
  document.querySelector('#agregar').scrollIntoView({ behavior: 'smooth' });
  deviceForm.elements.name.focus();
});

deviceForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(deviceForm);
  const id = data.get('id');
  const device = { name: String(data.get('name')).trim(), category: data.get('category'), watts: Number(data.get('watts')), hours: Number(data.get('hours')), quantity: Number(data.get('quantity')) };
  const index = devices.findIndex((item) => String(item.id) === id);
  try {
    if (databaseAvailable) {
      const saved = id ? await api(`/devices/${id}`, { method: 'PUT', body: JSON.stringify(device) }) : await api('/devices', { method: 'POST', body: JSON.stringify(device) });
      if (id) devices[index] = saved;
      else devices.push(saved);
    } else if (id) devices[index] = { ...device, id };
    else devices.push({ ...device, id: crypto.randomUUID() });
  } catch (error) { return showMessage('#form-message', error.message); }
  saveLocal();
  resetDeviceForm();
  showMessage('#form-message', id ? 'Cambios guardados.' : 'Equipo guardado.');
  renderDevices();
});

document.querySelector('#cancel-edit').addEventListener('click', resetDeviceForm);

billForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(billForm);
  const bill = { date: data.get('date'), kwh: Number(data.get('kwh')), amount: Number(data.get('amount')) };
  try {
    if (databaseAvailable) bills.push(await api('/bills', { method: 'POST', body: JSON.stringify(bill) }));
    else bills.push({ ...bill, id: crypto.randomUUID() });
  } catch (error) { return showMessage('#bill-message', error.message); }
  saveLocal();
  billForm.reset();
  showMessage('#bill-message', 'Factura guardada.');
  renderBills(bills);
});

const rateForm = document.querySelector('#rate-form');
rateForm.elements.rate.value = rate;
rateForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const nextRate = Number(rateForm.elements.rate.value);
  try { if (databaseAvailable) await api('/settings/rate', { method: 'PUT', body: JSON.stringify({ rate: nextRate }) }); }
  catch (error) { return showMessage('#rate-message', error.message); }
  rate = nextRate;
  saveLocal();
  renderDevices();
  showMessage('#rate-message', 'Tarifa actualizada.');
});

function showMessage(selector, message) { document.querySelector(selector).textContent = message; }

const menuToggle = document.querySelector('#menu-toggle');
menuToggle.addEventListener('click', () => {
  const open = menuToggle.getAttribute('aria-expanded') !== 'true';
  menuToggle.setAttribute('aria-expanded', String(open));
  document.querySelector('#main-nav').classList.toggle('open', open);
});
document.querySelector('#main-nav').addEventListener('click', (event) => {
  if (!event.target.closest('a')) return;
  menuToggle.setAttribute('aria-expanded', 'false');
  document.querySelector('#main-nav').classList.remove('open');
});

renderDevices();
renderBills(bills);
connect();
