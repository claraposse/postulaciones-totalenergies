const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  try {
    const key = event.queryStringParameters?.key;
    
    if (!key) {
      return { statusCode: 400, body: 'Falta el parámetro key' };
    }

    const store = getStore({
      name: 'cvs',
      siteID: process.env.MY_SITE_ID,
      token: process.env.NETLIFY_AUTH_TOKEN
    });

    const blob = await store.get(key, { type: 'arrayBuffer' });
    
    if (!blob) {
      return { statusCode: 404, body: 'CV no encontrado' };
    }

    const ext = key.split('.').pop().toLowerCase();
    const mimeTypes = {
      pdf:  'application/pdf',
      doc:  'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    return {
      statusCode: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${key}"`,
        'Cache-Control': 'private, max-age=3600'
      },
      body: Buffer.from(blob).toString('base64'),
      isBase64Encoded: true
    };

  } catch (err) {
    console.error('Error:', err.message);
    return { statusCode: 500, body: 'Error al obtener el CV' };
  }
};
