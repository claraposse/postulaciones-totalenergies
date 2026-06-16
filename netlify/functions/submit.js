const { Readable } = require('stream');
const { getStore } = require('@netlify/blobs');

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

    // PASO 1: Guardar CV en Netlify Blobs
    let cvLink = '';
    if (cvBuffer && cvBuffer.length > 0) {
      try {
        const store = getStore({
          name: 'cvs',
          siteID: process.env.MY_SITE_ID,
          token: process.env.NETLIFY_AUTH_TOKEN
        });

        const fecha    = new Date().toLocaleDateString('es-AR').replace(/\//g, '-');
        const apellido = (fields.apellido || 'SinApellido').replace(/\s/g, '-');
        const nombre   = (fields.nombre   || 'SinNombre').replace(/\s/g, '-');
        const puesto   = (fields.puesto_aplica || 'CV').replace(/\s/g, '-');
        const ext      = cvName.split('.').pop() || 'pdf';
        const key      = `${apellido}_${nombre}_${puesto}_${fecha}.${ext}`;

        await store.set(key, cvBuffer, { metadata: { contentType: cvMime } });
        cvLink = `https://postulaciones-totalenergies.netlify.app/.netlify/functions/cv?key=${key}`;
        console.log('CV guardado:', key);
      } catch(e) {
        console.error('Error guardando CV:', e.message);
        cvLink = '';
      }
    }

    // PASO 2: Mandar datos + link a Apps Script
    const params = new URLSearchParams();
    Object.entries(fields).forEach(([k, v]) => params.append(k, String(v)));
    if (cvLink) params.append('cv_link', cvLink);

    const dataRes = await fetch(`${APPS_SCRIPT_URL}?${params.toString()}`, {
      method: 'GET',
      redirect: 'follow'
    });
    console.log('Sheets status:', dataRes.status);

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
