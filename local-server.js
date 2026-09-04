const http = require('http');
const handler = require('./api/index.js');

const port = Number(process.env.PORT || 8080);

http.createServer(async (request, response) => {
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