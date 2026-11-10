import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const publicRoot = path.join(projectRoot, 'public');
const port = Number(process.env.PORT || 3000);
let pool;
function db() {
  if (!pool) pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'kwhtrack_demo',
    waitForConnections: true, connectionLimit: 5, decimalNumbers: true
  });
  return pool;
}
function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}
async function body(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 16000) throw new Error('La solicitud es demasiado grande.');
  }
  try { return JSON.parse(raw || '{}'); } catch { throw new Error('El cuerpo debe ser JSON válido.'); }
}
function validDevice(v) {
  if (!v || typeof v.name !== 'string' || v.name.trim().length < 2 || v.name.length > 50) return 'Escribe un nombre de equipo de 2 a 50 caracteres.';
  if (typeof v.category !== 'string' || v.category.length > 40) return 'Selecciona una categoría válida.';
  if (!Number.isFinite(v.watts) || v.watts <= 0 || v.watts > 100000) return 'La potencia debe ser mayor que cero.';
  if (!Number.isFinite(v.hours) || v.hours < 0 || v.hours > 24) return 'Las horas deben estar entre 0 y 24.';
  if (!Number.isInteger(v.quantity) || v.quantity < 1 || v.quantity > 100) return 'La cantidad debe ser un entero entre 1 y 100.';
  return null;
}
function validBill(v) {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v.date || '')) return 'Indica una fecha válida.';
  const parsedDate = new Date(`${v.date}T00:00:00Z`);
  if (Number.isNaN(parsedDate.valueOf()) || parsedDate.toISOString().slice(0, 10) !== v.date) return 'La fecha de la factura no existe.';
  if (!Number.isFinite(v.kwh) || v.kwh < 0 || v.kwh > 10000000) return 'El consumo debe ser un número positivo.';
  if (!Number.isFinite(v.amount) || v.amount < 0 || v.amount > 1000000000) return 'El valor pagado debe ser válido.';
  return null;
}
async function api(req, res, url) {
  if (url.pathname === '/api/health' && req.method === 'GET') {
    try { await db().query('SELECT 1'); return json(res, 200, { status: 'ok', database: 'connected' }); }
    catch { return json(res, 200, { status: 'ok', database: 'disconnected' }); }
  }
  if (url.pathname === '/api/dashboard' && req.method === 'GET') {
    const pool = db();
    const [devices] = await pool.query('SELECT id,name,category,watts,hours,quantity FROM devices ORDER BY name');
    const [bills] = await pool.query('SELECT id,bill_date AS date,consumption_kwh AS kwh,amount FROM bills ORDER BY bill_date DESC LIMIT 20');
    const [settingsRows] = await pool.query('SELECT rate FROM settings WHERE id=1');
    const settings = settingsRows[0] || { rate: 1000 };
    return json(res, 200, { devices, bills, rate: settings.rate });
  }
  if (url.pathname === '/api/devices' && req.method === 'GET') {
    const [rows] = await db().query('SELECT id,name,category,watts,hours,quantity FROM devices ORDER BY name');
    return json(res, 200, rows);
  }
  if (url.pathname === '/api/devices' && req.method === 'POST') {
    const v = await body(req); const error = validDevice(v);
    if (error) return json(res, 400, { error });
    const [result] = await db().execute('INSERT INTO devices(name,category,watts,hours,quantity) VALUES (?,?,?,?,?)', [v.name.trim(),v.category,v.watts,v.hours,v.quantity]);
    return json(res, 201, { id: result.insertId, ...v, name: v.name.trim() });
  }
  const match = url.pathname.match(/^\/api\/devices\/(\d+)$/);
  if (match && req.method === 'PUT') {
    const v = await body(req); const error = validDevice(v);
    if (error) return json(res, 400, { error });
    const [result] = await db().execute('UPDATE devices SET name=?,category=?,watts=?,hours=?,quantity=? WHERE id=?', [v.name.trim(),v.category,v.watts,v.hours,v.quantity,match[1]]);
    if (!result.affectedRows) return json(res, 404, { error: 'Equipo no encontrado.' });
    return json(res, 200, { id: Number(match[1]), ...v, name: v.name.trim() });
  }
  if (match && req.method === 'DELETE') {
    const [result] = await db().execute('DELETE FROM devices WHERE id=?', [match[1]]);
    if (!result.affectedRows) return json(res, 404, { error: 'Equipo no encontrado.' });
    return json(res, 200, { deleted: true });
  }
  if (match && req.method === 'GET') {
    const [rows] = await db().execute('SELECT id,name,category,watts,hours,quantity FROM devices WHERE id=?', [match[1]]);
    if (!rows.length) return json(res, 404, { error: 'Equipo no encontrado.' });
    return json(res, 200, rows[0]);
  }
  if (url.pathname === '/api/bills' && req.method === 'GET') {
    const [rows] = await db().query('SELECT id,bill_date AS date,consumption_kwh AS kwh,amount FROM bills ORDER BY bill_date DESC LIMIT 100');
    return json(res, 200, rows);
  }
  if (url.pathname === '/api/bills' && req.method === 'POST') {
    const v = await body(req); const error = validBill(v);
    if (error) return json(res, 400, { error });
    const [result] = await db().execute('INSERT INTO bills(bill_date,consumption_kwh,amount) VALUES (?,?,?)', [v.date,v.kwh,v.amount]);
    return json(res, 201, { id: result.insertId, ...v });
  }
  const billMatch = url.pathname.match(/^\/api\/bills\/(\d+)$/);
  if (billMatch && req.method === 'PUT') {
    const v = await body(req);
    const error = validBill(v);
    if (error) return json(res, 400, { error });
    const [result] = await db().execute(
      'UPDATE bills SET bill_date=?,consumption_kwh=?,amount=? WHERE id=?',
      [v.date,v.kwh,v.amount,billMatch[1]]
    );
    if (!result.affectedRows) return json(res, 404, { error: 'Factura no encontrada.' });
    return json(res, 200, { id: Number(billMatch[1]), ...v });
  }
  if (billMatch && req.method === 'DELETE') {
    const [result] = await db().execute('DELETE FROM bills WHERE id=?', [billMatch[1]]);
    if (!result.affectedRows) return json(res, 404, { error: 'Factura no encontrada.' });
    return json(res, 200, { deleted: true });
  }
  if (billMatch && req.method === 'GET') {
    const [rows] = await db().execute('SELECT id,bill_date AS date,consumption_kwh AS kwh,amount FROM bills WHERE id=?', [billMatch[1]]);
    if (!rows.length) return json(res, 404, { error: 'Factura no encontrada.' });
    return json(res, 200, rows[0]);
  }
  if (url.pathname === '/api/settings/rate' && req.method === 'PUT') {
    const v = await body(req);
    if (!Number.isFinite(v.rate) || v.rate <= 0 || v.rate > 100000) return json(res, 400, { error: 'La tarifa debe estar entre 1 y 100000 COP/kWh.' });
    await db().execute('UPDATE settings SET rate=? WHERE id=1', [v.rate]);
    return json(res, 200, { rate: v.rate });
  }
  return false;
}
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8' };
http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'");
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      const handled = await api(req,res,url);
      if (handled !== false) return;
      return json(res,404,{error:'Ruta no encontrada.'});
    }
    if (!['GET','HEAD'].includes(req.method)) return json(res,405,{error:'Método no permitido.'});
    const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
    const isClientScript = pathname.startsWith('/src/client/');
    const base = isClientScript ? path.join(projectRoot, 'src', 'client') : publicRoot;
    const relativePath = isClientScript ? pathname.slice('/src/client/'.length) : pathname;
    const target = path.resolve(base, '.' + relativePath);
    if (!target.startsWith(base + path.sep)) return json(res,404,{error:'Archivo no encontrado.'});
    const file = await readFile(target);
    res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream' });
    res.end(req.method === 'HEAD' ? undefined : file);
  } catch (error) {
    if (error.code === 'ENOENT') return json(res,404,{error:'Archivo no encontrado.'});
    json(res,500,{error:error.message || 'Error interno del servidor.'});
  }
}).listen(port,'127.0.0.1',()=>process.stdout.write('App lista en http://127.0.0.1:' + port + '\n'));
