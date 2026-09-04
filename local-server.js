const http = require('http');
const fs = require('fs');
const path = require('path');
const handler = require('./api/index.js');

const port = Number(process.env.PORT || 8080);

http.createServer(async (request, response) => {
  if (request.url === '/favicon.ico') {
    try {
      const favicon = await fs.promises.readFile(path.join(__dirname, 'favicon.ico'));
      response.writeHead(200, { 'Content-Type': 'image/x-icon', 'Cache-Control': 'public, max-age=86400' });
      response.end(favicon);
    } catch (error) {
      response.writeHead(404);
      response.end('Not found');
    }
    return;
  }

  const serverlessResponse = {
    setHeader(name, value) {
      response.setHeader(name, value);
    },
    status(code) {
      response.statusCode = code;
      return this;
    },
    send(body) {
      response.end(body);
    }
  };

  try {
    await handler(request, serverlessResponse);
  } catch (error) {
    console.error(error);
    if (!response.headersSent) response.statusCode = 500;
    response.end('Internal server error');
  }
}).listen(port, () => {
  console.log(`Global IPTV Player running at http://localhost:${port}`);
});