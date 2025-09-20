const WebSocket = require('ws');
const axios = require('axios');
require('dotenv').config();

class DiscordOnline {
    constructor() {
        this.token = process.env.DISCORD_TOKEN;
        this.status = process.env.STATUS || 'online';
        this.customStatus = process.env.CUSTOM_STATUS || '24/7 Online';
        this.ws = null;
        this.heartbeatInterval = null;
        this.sessionId = null;
        this.sequence = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
    }

    // Validate token format
    validateToken(token) {
        return token && typeof token === 'string' && token.length > 50;
    }

    // Get gateway URL
    async getGateway() {
        try {
            const response = await axios.get('https://discord.com/api/v9/gateway');
            return response.data.url;
        } catch (error) {
            console.error('Error getting gateway:', error.message);
            return null;
        }
    }

    // Send heartbeat to keep connection alive
    sendHeartbeat() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                op: 1,
                d: this.sequence
            }));
            console.log('❤️ Heartbeat sent');
        }
    }

    // Identify with Discord gateway
    identify() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                op: 2,
                d: {
                    token: this.token,
                    properties: {
                        $os: 'linux',
                        $browser: 'chrome',
                        $device: 'chrome'
                    },
                    presence: {
                        status: this.status,
                        since: 0,
                        activities: [{
                            name: 'Custom Status',
                            type: 4,
                            state: this.customStatus
                        }],
                        afk: false
                    }
                }
            }));
            console.log('✅ Identified with Discord gateway');
        }
    }

    // Update presence status
    updatePresence(status) {
        if (status) this.status = status;
        
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                op: 3,
                d: {
                    status: this.status,
                    since: 0,
                    activities: [{
                        name: 'Custom Status',
                        type: 4,
                        state: this.customStatus
                    }],
                    afk: false
                }
            }));
            console.log(`🔄 Status updated to: ${this.status}`);
        }
    }

    // Handle WebSocket messages
    handleMessage(data) {
        try {
            const message = JSON.parse(data);
            
            switch (message.op) {
                case 10: // Hello
                    const { heartbeat_interval } = message.d;
                    this.heartbeatInterval = setInterval(() => this.sendHeartbeat(), heartbeat_interval);
                    this.identify();
                    break;
                    
                case 11: // Heartbeat ACK
                    console.log('✅ Heartbeat acknowledged');
                    break;
                    
                case 0: // Dispatch
                    this.sequence = message.s;
                    switch (message.t) {
                        case 'READY':
                            this.sessionId = message.d.session_id;
                            console.log('🚀 Connected to Discord');
                            console.log(`👤 Logged in as: ${message.d.user.username}`);
                            this.reconnectAttempts = 0;
                            break;
                            
                        case 'RESUMED':
                            console.log('🔄 Session resumed');
                            this.reconnectAttempts = 0;
                            break;
                    }
                    break;
                    
                case 7: // Reconnect
                    console.log('🔁 Reconnect requested by server');
                    this.reconnect();
                    break;
                    
                case 9: // Invalid session
                    console.log('❌ Invalid session, reconnecting...');
                    setTimeout(() => this.reconnect(), 5000);
                    break;
            }
        } catch (error) {
            console.error('Error handling message:', error);
        }
    }

    // Connect to Discord gateway
    async connect() {
        if (!this.validateToken(this.token)) {
            console.error('❌ Invalid Discord token. Please check your .env file');
            process.exit(1);
        }

        const gatewayUrl = await this.getGateway();
        if (!gatewayUrl) {
            console.error('❌ Failed to get gateway URL');
            process.exit(1);
        }

        this.ws = new WebSocket(`${gatewayUrl}?v=9&encoding=json`);
        
        this.ws.on('open', () => {
            console.log('🔗 Connected to Discord gateway');
            this.reconnectAttempts = 0;
        });

        this.ws.on('message', (data) => this.handleMessage(data));

        this.ws.on('close', (code, reason) => {
            console.log(`🔌 Connection closed: ${code} - ${reason}`);
            this.cleanup();
            
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
                console.log(`⏳ Reconnecting in ${delay/1000} seconds...`);
                setTimeout(() => this.reconnect(), delay);
                this.reconnectAttempts++;
            } else {
                console.error('❌ Max reconnection attempts reached');
                process.exit(1);
            }
        });

        this.ws.on('error', (error) => {
            console.error('❌ WebSocket error:', error.message);
        });
    }

    // Reconnect to gateway
    reconnect() {
        this.cleanup();
        this.connect();
    }

    // Cleanup intervals and connections
    cleanup() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        
        if (this.ws) {
            this.ws.removeAllListeners();
            if (this.ws.readyState === WebSocket.OPEN) {
                this.ws.close();
            }
        }
    }

    // Handle process signals
    setupSignalHandlers() {
        process.on('SIGINT', () => {
            console.log('\n🛑 Shutting down gracefully...');
            this.cleanup();
            process.exit(0);
        });

        process.on('SIGTERM', () => {
            console.log('\n🛑 Received termination signal');
            this.cleanup();
            process.exit(0);
        });
    }

    // Start the online service
    async start() {
        console.log('🚀 Starting Discord Online Tool');
        console.log('📊 Status:', this.status);
        console.log('💬 Custom Status:', this.customStatus);
        
        this.setupSignalHandlers();
        await this.connect();
    }
}

// Command line interface for status changes
function setupCLI(onlineTool) {
    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    console.log('\n📝 Available commands:');
    console.log('  - online: Set status to online');
    console.log('  - idle: Set status to idle');
    console.log('  - dnd: Set status to do not disturb');
    console.log('  - status: Show current status');
    console.log('  - exit: Stop the tool');
    console.log('');

    rl.on('line', (input) => {
        switch (input.trim().toLowerCase()) {
            case 'online':
                onlineTool.updatePresence('online');
                break;
            case 'idle':
                onlineTool.updatePresence('idle');
                break;
            case 'dnd':
                onlineTool.updatePresence('dnd');
                break;
            case 'status':
                console.log(`📊 Current status: ${onlineTool.status}`);
                break;
            case 'exit':
                console.log('🛑 Stopping...');
                onlineTool.cleanup();
                rl.close();
                process.exit(0);
                break;
            default:
                console.log('❌ Unknown command');
        }
    });
}

// Main execution
async function main() {
    const onlineTool = new DiscordOnline();
    
    try {
        await onlineTool.start();
        setupCLI(onlineTool);
    } catch (error) {
        console.error('❌ Failed to start:', error.message);
        process.exit(1);
    }
}

// Run the application
if (require.main === module) {
    main();
}

module.exports = DiscordOnline;
