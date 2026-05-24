const { WebSocketServer } = require('ws');

const clients = new Set();
let wss = null;

function initWS(server, sessionMiddleware) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    // Reuse Express session middleware to authenticate the WS connection
    sessionMiddleware(req, {}, () => {
      const user = req.session?.user;
      if (!user) {
        ws.close(1008, 'Unauthorized');
        return;
      }

      const client = {
        ws,
        userId: String(user.id),
        isAdmin: user.role === 'admin',
      };
      clients.add(client);

      ws.on('close', () => clients.delete(client));
      ws.on('error', () => clients.delete(client));
    });
  });
}

/**
 * Send an event to all connected clients that match the optional filter.
 * @param {string} event
 * @param {object} data
 * @param {(client: {userId: string, isAdmin: boolean}) => boolean} [filter]
 */
function broadcast(event, data, filter) {
  const msg = JSON.stringify({ event, data });
  for (const client of clients) {
    if (client.ws.readyState !== 1 /* OPEN */) continue;
    if (!filter || filter(client)) {
      client.ws.send(msg);
    }
  }
}

module.exports = { initWS, broadcast };
