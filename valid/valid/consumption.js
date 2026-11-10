// Reglas de negocio: 30 días por mes y conversión de vatios a kilovatios.
function monthlyConsumption(device) {
  return Number(device.watts) * Number(device.hours) * 30 * Number(device.quantity) / 1000;
}

function householdSummary(devices, rate) {
  const kwh = devices.reduce((total, device) => total + monthlyConsumption(device), 0);
  return { kwh, cost: kwh * rate };
}
