const axios = require('axios');
const WebSocket = require('ws');
const readline = require('readline');

const TOKEN = process.env.DISCORD_TOKEN || 'or put here';
const GATEWAY_URL = 'wss://gateway.discord.gg/?v=9&encoding=json';

class DiscordSelfbot {
  constructor(token) {
    this.token = token;
    this.ws = null;
    this.heartbeatInterval = null;
    this.sequence = null;
  }

  async start() {
    const status = await this.getStatusFromConsole();
    console.log('Fetching Gateway...');
    try {
      const response = await axios.get('https://discord.com/api/v9/gateway');
      const gatewayUrl = response.data.url;
      console.log('Connecting to Gateway...');
      this.ws = new WebSocket(`${gatewayUrl}/?v=9&encoding=json`);

      this.ws.on('open', () => {
        console.log('Connected to Discord Gateway');
        this.sendIdentify(status);
      });

      this.ws.on('message', (data) => {
        const payload = JSON.parse(data);
        this.sequence = payload.s;

        if (payload.op === 10) {
          const heartbeatMs = payload.d.heartbeat_interval;
          this.startHeartbeat(heartbeatMs);
        }
      });

      this.ws.on('close', (code, reason) => {
        console.log(`Disconnected (Code: ${code}, Reason: ${reason})`);
        this.stopHeartbeat();
        this.start();
      });

      this.ws.on('error', (err) => {
        console.error('WebSocket error:', err);
      });
    } catch (error) {
      console.error('Error fetching Gateway:', error.response?.data || error.message);
    }
  }

  getStatusFromConsole() {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      rl.question('Select status (online/dnd/idle): ', (input) => {
        const status = ['online', 'dnd', 'idle'].includes(input.toLowerCase()) ? input.toLowerCase() : 'online';
        rl.close();
        resolve(status);
      });
    });
  }

  sendIdentify(status) {
    const identifyPayload = {
      op: 2,
      d: {
        token: this.token,
        properties: {
          $os: 'linux',
          $browser: 'disco',
          $device: 'disco'
        },
        presence: {
          status: status,
          activities: [],
          afk: false
        },
        intents: 0
      }
    };
    this.ws.send(JSON.stringify(identifyPayload));
    console.log(`Sent Identify: Now online with ${status} status`);
  }

  startHeartbeat(intervalMs) {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ op: 1, d: this.sequence }));
      }
    }, intervalMs);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  stop() {
    this.stopHeartbeat();
    if (this.ws) this.ws.close();
  }
}

const bot = new DiscordSelfbot(TOKEN);
bot.start();

process.on('SIGINT', () => {
  console.log('Shutting down...');
  bot.stop();
  process.exit(0);
});