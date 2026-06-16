const { google } = require('googleapis');
const { Readable } = require('stream');

const FOLDER_ID  = '1HVR45f6I2O7dK7YHzebHaMK3QZ9IERAn';
const SHEETS_URL = 'https://script.google.com/macros/s/AKfycby_FesyrGOO_ePT9je2bCblUw1B0kCQbmxmyHK0iijbo5xGlUGl41zFM66Izu2dwdhidw/exec';

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: 'Method not allowed' };
  }

  try {
    // Parse multipart form data
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
        : Buffer.from(event.body);

      const readable = new Readable();
      readable.push(body);
      readable.push(null);
      readable.pipe(bb);
    });

    // Upload CV to Google Drive
    let cvLink = '';
    if (cvBuffer && cvBuffer.length > 0) {
      const auth = new google.auth.GoogleAuth({
        credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
        scopes: ['https://www.googleapis.com/auth/drive']
      });

      const drive    = google.drive({ version: 'v3', auth });
      const fecha    = new Date().toLocaleDateString('es-AR').replace(/\//g, '-');
      const fileName = `${fields.apellido || 'Sin apellido'}_${fields.nombre || 'Sin nombre'}_${fields.puesto_aplica || 'CV'}_${fecha}`;

      const stream = new Readable();
      stream.push(cvBuffer);
      stream.push(null);

      const res = await drive.files.create({
        requestBody: {
          name: fileName,
          parents: [FOLDER_ID]
        },
        media: {
          mimeType: cvMime || 'application/octet-stream',
          body: stream
        },
        fields: 'id, webViewLink'
      });

      await drive.permissions.create({
        fileId: res.data.id,
        requestBody: { role: 'reader', type: 'anyone' }
      });

      cvLink = res.data.webViewLink;
    }

    // Send data to Google Sheets
    const params = new URLSearchParams();
    Object.entries(fields).forEach(([k, v]) => params.append(k, v));
    params.append('cv_link', cvLink);

    await fetch(`${SHEETS_URL}?${params.toString()}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ status: 'ok', cvLink })
    };

  } catch (err) {
    console.error('Error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ status: 'error', message: err.message })
    };
  }
};
