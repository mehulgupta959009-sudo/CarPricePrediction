const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', 'Backend', 'quikr_car.csv');

function normalizeText(value) {
  return (value || '').toString().trim().toLowerCase();
}

function parseCsv(content) {
  const rows = [];
  const lines = content.trim().split(/\r?\n/);
  if (!lines.length) return rows;

  const headers = [];
  let current = [];
  let inQuotes = false;
  let currentValue = '';

  const pushCell = () => {
    headers.push(currentValue);
    currentValue = '';
  };

  for (let i = 0; i < lines[0].length; i += 1) {
    const char = lines[0][i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      pushCell();
    } else {
      currentValue += char;
    }
  }
  pushCell();

  for (let index = 1; index < lines.length; index += 1) {
    if (!lines[index].trim()) continue;

    const values = [];
    let row = '';
    let rowInQuotes = false;
    for (let i = 0; i < lines[index].length; i += 1) {
      const char = lines[index][i];
      if (char === '"') {
        rowInQuotes = !rowInQuotes;
      } else if (char === ',' && !rowInQuotes) {
        values.push(row);
        row = '';
      } else {
        row += char;
      }
    }
    values.push(row);

    const record = {};
    headers.forEach((header, headerIndex) => {
      record[header] = values[headerIndex] || '';
    });
    rows.push(record);
  }

  return rows;
}

function predictPrice(company, model, year, kilometers, fuel) {
  if (!company || !model || !year || !kilometers || !fuel) {
    throw new Error('All fields are required');
  }

  const content = fs.readFileSync(DATA_PATH, 'utf8');
  const rows = parseCsv(content);

  let matchingRows = rows.filter((row) => {
    if (normalizeText(row.company) !== company) return false;
    const name = normalizeText(row.name);
    if (model && name && !name.includes(model)) return false;
    if (row.fuel_type) {
      const fuelValue = normalizeText(row.fuel_type);
      if (fuelValue !== fuel && fuelValue.replace(/\s+/g, '') !== fuel.replace(/\s+/g, '')) {
        return false;
      }
    }
    return true;
  });

  if (!matchingRows.length) {
    matchingRows = rows.filter((row) => normalizeText(row.company) === company);
  }

  if (!matchingRows.length) {
    throw new Error('No matching data found for the supplied car details');
  }

  const prices = matchingRows.reduce((acc, row) => {
    const rawValue = (row.Price || '').replace(/,/g, '').replace('Ask For Price', '0');
    const price = Number(rawValue);
    if (!Number.isNaN(price)) acc.push(price);
    return acc;
  }, []);

  if (!prices.length) {
    throw new Error('No usable pricing entries available for this car profile');
  }

  const averagePrice = prices.reduce((total, value) => total + value, 0) / prices.length;
  const ageFactor = Math.max(0, 2026 - year);
  const kilometerFactor = kilometers / 10000;
  const adjustment = averagePrice * (0.03 * ageFactor + 0.01 * kilometerFactor);
  return Math.round(averagePrice - adjustment, 2);
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    return req.body;
  }

  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  return {};
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const payload = parseBody(req);

  try {
    const company = normalizeText(payload.company);
    const model = normalizeText(payload.model);
    const year = Number(payload.yearOfPurchase || 0);
    const kilometers = Number(payload.kilometersDriven || 0);
    const fuel = normalizeText(payload.fuelType);

    const estimate = predictPrice(company, model, year, kilometers, fuel);

    res.status(200).json({
      message: 'Prediction received',
      estimatedPrice: estimate,
      currency: 'INR',
      details: {
        company: payload.company,
        model: payload.model,
        yearOfPurchase: year,
        kilometersDriven: kilometers,
        fuelType: payload.fuelType,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};
