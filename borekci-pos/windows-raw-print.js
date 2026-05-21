const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, execFileSync } = require('child_process');

const THERMAL_PRINTER_PATTERNS = [
  'xp-90', 'xp90', 'xp-9000', 'xp9000', 'xp-80', 'xp80',
  'xprinter', 'pos-80', 'pos80', 'q900', 'thermal', 'receipt',
];

function getPrintScriptPath() {
  const candidates = [
    path.join(__dirname, 'print-raw.ps1'),
    path.join(process.resourcesPath || '', 'print-raw.ps1'),
  ];
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return path.join(__dirname, 'print-raw.ps1');
}

function listWindowsPrinters() {
  const output = execSync(
    'powershell -NoProfile -Command "Get-Printer | Select-Object Name, PrinterStatus | ConvertTo-Json -Compress"',
    { encoding: 'utf-8', timeout: 8000, shell: true }
  );

  let parsed = JSON.parse(output || '[]');
  if (!Array.isArray(parsed)) {
    parsed = [parsed];
  }

  return parsed
    .filter((p) => p && p.Name)
    .map((p, index) => ({
      name: String(p.Name).trim(),
      status: p.PrinterStatus || 'Unknown',
      isDefault: index === 0,
      type: 'windows',
    }))
    .filter((p) => !/pdf|fax|onenote|xps/i.test(p.name));
}

function normalizeName(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function matchPrinter(printers, requestedName) {
  if (!printers.length) return null;

  if (requestedName) {
    const wanted = normalizeName(requestedName);
    const exact = printers.find((p) => normalizeName(p.name) === wanted);
    if (exact) return exact;

    const partial = printers.find((p) => {
      const n = normalizeName(p.name);
      return n.includes(wanted) || wanted.includes(n);
    });
    if (partial) return partial;
  }

  for (const pattern of THERMAL_PRINTER_PATTERNS) {
    const hit = printers.find((p) => normalizeName(p.name).includes(pattern));
    if (hit) return hit;
  }

  return printers[0];
}

/** Türkçe karakterleri ASCII'ye çevir (termal yazıcı uyumu) */
function toAsciiReceipt(text) {
  const map = {
    ç: 'c', Ç: 'C', ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I',
    ö: 'o', Ö: 'O', ş: 's', Ş: 'S', ü: 'u', Ü: 'U',
    â: 'a', Â: 'A', î: 'i', Î: 'I', û: 'u', Û: 'U',
    é: 'e', É: 'E', è: 'e', È: 'E', ê: 'e', Ê: 'E',
    '₺': 'TL',
  };
  return String(text || '')
    .split('')
    .map((ch) => map[ch] ?? ch)
    .join('')
    .replace(/[^\x20-\x7E\n\r\t]/g, '');
}

function encodeReceiptText(text) {
  return Buffer.from(toAsciiReceipt(text), 'ascii');
}

function buildEscPosReceipt({ restaurantName, tableName, orders, total, date }) {
  const chunks = [];
  const add = (text) => chunks.push(encodeReceiptText(text));

  chunks.push(Buffer.from('\x1B\x40')); // init
  chunks.push(Buffer.from('\x1B\x61\x01')); // center
  chunks.push(Buffer.from('\x1B\x21\x30')); // double
  add(`${restaurantName}\n`);
  chunks.push(Buffer.from('\x1B\x21\x00'));
  chunks.push(Buffer.from('\x1B\x61\x00'));
  add('--------------------------------\n');
  add(`Masa: ${tableName}\n`);
  add(`Tarih: ${date}\n`);
  add('--------------------------------\n');

  orders.forEach((order) => {
    const line = `${order.name} x${order.quantity}`;
    const price = `${Number(order.total).toFixed(2)} TL`;
    const width = 32;
    const spaces = Math.max(1, width - line.length - price.length);
    add(`${line}${' '.repeat(spaces)}${price}\n`);
  });

  add('--------------------------------\n');
  chunks.push(Buffer.from('\x1B\x61\x02'));
  add(`TOPLAM: ${Number(total).toFixed(2)} TL\n`);
  chunks.push(Buffer.from('\x1B\x61\x00'));
  add('\n');
  chunks.push(Buffer.from('\x1B\x61\x01'));
  add('Nisanca Mah. Turkeli Cad.\n');
  add('Kumkapi 70/B Fatih Istanbul\n');
  add('(0212) 516 54 86\n');
  add('\nBizi tercih ettiginiz icin\n');
  add('tesekkur ederiz!\n');
  add('\n\n\n\n\n\n');
  chunks.push(Buffer.from('\x1D\x56\x00')); // cut

  return Buffer.concat(chunks);
}

function printRawWindows(printerName, dataBuffer) {
  const scriptPath = getPrintScriptPath();
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`RAW yazdirma scripti bulunamadi: ${scriptPath}`);
  }

  const tempFile = path.join(os.tmpdir(), `emekcafe_receipt_${Date.now()}.bin`);
  fs.writeFileSync(tempFile, dataBuffer);

  try {
    execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', scriptPath,
        '-PrinterName', printerName,
        '-FilePath', tempFile,
      ],
      { timeout: 20000, windowsHide: true }
    );
    return { success: true, printerName };
  } finally {
    try {
      fs.unlinkSync(tempFile);
    } catch {
      /* ignore */
    }
  }
}

module.exports = {
  listWindowsPrinters,
  matchPrinter,
  buildEscPosReceipt,
  printRawWindows,
  THERMAL_PRINTER_PATTERNS,
};
