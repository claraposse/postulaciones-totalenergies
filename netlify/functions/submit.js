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

  console.log('=== INICIO submit ===');
  console.log('Method:', event.httpMethod);
  console.log('Content-Type:', event.headers['content-type']);

  try {
    const busboy = require('busboy');
    const fields = {};
    let cvBuffer = null;
    let cvName   = '';
    let cvMime   = '';

    await new Promise((resolve, reject) => {
      const bb = busboy({ headers: event.headers });
      bb.on('field', (name, val) => { 
        fields[name] = val;
        console.log('Campo recibido:', name, '=', val.substring(0, 50));
      });
      bb.on('file', (name, file, info) => {
        cvName = info.filename;
        cvMime = info.mimeType;
        console.log('Archivo recibido:', cvName, cvMime);
        const chunks = [];
        file.on('data', chunk => chunks.push(chunk));
        file.on('end', () => { 
          cvBuffer = Buffer.concat(chunks); 
          console.log('Tamaño CV:', cvBuffer.length, 'bytes');
        });
      });
      bb.on('finish', resolve);
      bb.on('error', (err) => { console.error('Busboy error:', err); reject(err); });
      const body = event.isBase64Encoded
        ? Buffer.from(event.body, 'base64')
        : Buffer.from(event.body || '');
      const readable = new Readable();
      readable.push(body);
      readable.push(null);
      readable.pipe(bb);
    });

    console.log('Campos totales recibidos:', Object.keys(fields).length);
    console.log('Nombre:', fields.nombre, 'Email:', fields.email);

    // Armar params para Apps Script
    const params = new URLSearchParams();
    Object.entries(fields).forEach(([k, v]) => params.append(k, String(v)));

    if (cvBuffer && cvBuffer.length > 0) {
      console.log('Convirtiendo CV a base64...');
      params.append('cv_base64', cvBuffer.toString('base64'));
      params.append('cv_mime',   cvMime || 'application/octet-stream');
      params.append('cv_name',   cvName || fields.cv_nombre || 'CV');
    } else {
      console.log('No se recibió archivo CV');
    }

    const url = `${APPS_SCRIPT_URL}?${params.toString()}`;
    console.log('Llamando Apps Script, URL length:', url.length);

    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow'
    });

    console.log('Respuesta Apps Script status:', res.status);
    const text = await res.text();
    console.log('Respuesta Apps Script body:', text.substring(0, 200));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ status: 'ok' })
    };

  } catch (err) {
    console.error('ERROR en submit:', err.message);
    console.error('Stack:', err.stack);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ status: 'error', message: err.message })
    };
  }
};
