import { startServer } from './gateway.js';

const port = process.env.WS_PORT ? parseInt(process.env.WS_PORT) : 3000;
const telnetHost = process.env.TELNET_HOST || 'localhost';
const telnetPort = process.env.TELNET_PORT ? parseInt(process.env.TELNET_PORT) : 4000;

startServer(port, telnetHost, telnetPort);
