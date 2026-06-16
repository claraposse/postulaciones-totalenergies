const { Readable } = require('stream');

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby_FesyrGOO_ePT9je2bCblUw1B0kCQbmxmyHK0iijbo5xGlUGl41zFM66Izu2dwdhidw/exec';

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const busboy = require('busboy');
    const fields = {};
    let cvBuffer = null;
    let cvName   = '';
    let cvMime   = '';

    await new Promise((resolve, reject) => {
      const bb = busboy({ headers: event.headers });
      bb.on('field', (name, val) => { fields[name] = val; });
      bb.on('file', (name, file, info) => {
        cvName = info.filename;
        cvMime = info.mimeType;
        const chunks = [];
        file.on('data', chunk => chunks.push(chunk));
        file.on('end', () => { cvBuffer = Buffer.concat(chunks); });
      });
      bb.on('finish', resolve);
      bb.on('error', reject);
      const body = event.isBase64Encoded
        ? Buffer.from(event.body, 'base64')
        : Buffer.from(event.body || '');
      const readable = new Readable();
      readable.push(body);
      readable.push(null);
      readable.pipe(bb);
    });

    // PASO 1: Mandar solo los datos de texto al Apps Script (sin CV)
    const params = new URLSearchParams();
    Object.entries(fields).forEach(([k, v]) => params.append(k, String(v)));
    
    const dataUrl = `${APPS_SCRIPT_URL}?${params.toString()}`;
    console.log('Mandando datos a Sheets, URL length:', dataUrl.length);
    
    const dataRes = await fetch(dataUrl, { method: 'GET', redirect: 'follow' });
    console.log('Sheets status:', dataRes.status);

    // PASO 2: Si hay CV, mandarlo por separado en chunks pequeños
    // (por ahora guardamos solo el nombre, el CV se suma después)
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ status: 'ok' })
    };

  } catch (err) {
    console.error('ERROR:', err.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ status: 'error', message: err.message })
    };
  }
};
