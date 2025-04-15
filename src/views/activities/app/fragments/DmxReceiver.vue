<template>
  <div class="dmx-receiver">
    <div class="controls">
      <div class="input-group">
        <label for="websocket-url">WebSocket URL:</label>
        <input 
          id="websocket-url" 
          v-model="websocketUrl" 
          placeholder="ws://localhost:1234/api/ws/sink"
          :disabled="isConnected"
        />
      </div>
      
      <div class="input-group">
        <label for="universe-id">Universe ID:</label>
        <select 
          id="universe-id" 
          v-model="selectedUniverse" 
          :disabled="isConnected"
        >
          <option 
            v-for="universe in universes" 
            :key="universe.id" 
            :value="universe.id"
          >
            {{ universe.name }} ({{ universe.id }})
          </option>
        </select>
      </div>
      
      <button 
        class="connect-btn" 
        :class="{ 'connected': isConnected }"
        @click="toggleConnection"
      >
        {{ isConnected ? 'Disconnect' : 'Connect' }}
      </button>
    </div>
    
    <div v-if="lastError" class="error-message">
      {{ lastError }}
    </div>
    
    <div v-if="isConnected" class="dmx-stats">
      <div class="stats-row">
        <div class="stat-item">
          <span class="stat-label">Status:</span>
          <span class="stat-value" :class="statusClass">{{ statusText }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Packets:</span>
          <span class="stat-value">{{ packetsReceived }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Updated:</span>
          <span class="stat-value">{{ lastUpdateTime }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Active channels:</span>
          <span class="stat-value">{{ activeChannels }}</span>
        </div>
      </div>
      <div class="channels-preview">
        <div 
          v-for="(value, index) in channelValues" 
          :key="index" 
          class="channel-meter"
          :style="{ height: `${(value / 255) * 100}%`, backgroundColor: getChannelColor(value) }"
          :title="`Channel ${index + 1}: ${value}`"
        ></div>
      </div>
    </div>
  </div>
</template>

<script>
import DMXReceiver from '@/plugins/dmx-receiver';

export default {
  name: 'DmxReceiver',
  
  data() {
    return {
      websocketUrl: 'ws://localhost:1234/api/ws/sink',
      selectedUniverse: 0,
      receiver: null,
      isConnected: false,
      reconnecting: false,
      lastError: null,
      reconnectAttempts: 0,
      packetsReceived: 0,
      lastUpdateTime: 'N/A',
      activeChannels: 0,
      channelValues: Array(16).fill(0) // Store first 16 channel values for preview
    };
  },
  
  computed: {
    universes() {
      return this.$show.universePool.universes;
    },
    
    statusClass() {
      if (this.isConnected) return 'connected';
      if (this.reconnecting) return 'reconnecting';
      if (this.lastError) return 'error';
      return 'disconnected';
    },
    
    statusText() {
      if (this.isConnected) return 'Connected';
      if (this.reconnecting) return `Reconnecting (${this.reconnectAttempts})`;
      if (this.lastError) return 'Error';
      return 'Disconnected';
    }
  },
  
  methods: {
    toggleConnection() {
      if (this.isConnected) {
        this.disconnect();
      } else {
        this.connect();
      }
    },
    
    connect() {
      this.lastError = null;
      
      try {
        const universe = this.$show.universePool.getFromId(this.selectedUniverse);
        
        if (!universe) {
          this.lastError = `Universe with ID ${this.selectedUniverse} not found`;
          return;
        }
        
        // Reset stats
        this.packetsReceived = 0;
        this.lastUpdateTime = 'N/A';
        this.activeChannels = 0;
        this.channelValues = Array(16).fill(0);
        
        // If receiver exists but the URL has changed, recreate it
        if (this.receiver && this.receiver.url !== this.websocketUrl) {
          this.cleanupReceiver();
        }
        
        // Initialize receiver if it doesn't exist
        if (!this.receiver) {
          this.receiver = new DMXReceiver(this.websocketUrl, universe);
          
          // Set up event listeners
          this.receiver.on('connected', () => {
            this.isConnected = true;
            this.reconnecting = false;
          });
          
          this.receiver.on('disconnected', () => {
            this.isConnected = false;
          });
          
          this.receiver.on('error', (error) => {
            this.lastError = error.message || 'Connection error';
          });
          
          this.receiver.on('reconnecting', (attempts) => {
            this.reconnecting = true;
            this.reconnectAttempts = attempts;
          });
          
          this.receiver.on('reconnectFailed', () => {
            this.reconnecting = false;
            this.lastError = 'Failed to reconnect after multiple attempts';
          });
          
          this.receiver.on('dmxData', (data) => {
            this.updateStats(data);
          });
        } else {
          // Update universe if it changed
          this.receiver.setUniverse(universe);
        }
        
        // Connect to the WebSocket
        this.receiver.connect().catch((error) => {
          this.lastError = error.message || 'Failed to connect';
        });
      } catch (error) {
        this.lastError = error.message;
      }
    },
    
    disconnect() {
      if (this.receiver) {
        this.receiver.disconnect();
        
        // Reset reconnection-related state
        this.reconnecting = false;
        this.reconnectAttempts = 0;
        
        // Ensure isConnected is set to false
        this.isConnected = false;
      }
    },
    
    // Helper method to clean up the receiver
    cleanupReceiver() {
      if (this.receiver) {
        this.receiver.disconnect();
        this.receiver.removeAllListeners();
        this.receiver = null;
      }
    },
    
    updateStats(data) {
      // Update packet count
      this.packetsReceived++;
      
      // Update timestamp
      this.lastUpdateTime = new Date().toLocaleTimeString();
      
      // Calculate active channels (with values > 0)
      this.activeChannels = Array.from(data).filter(val => val > 0).length;
      
      // Store first 16 channels for preview
      this.channelValues = Array.from(data.slice(0, 16));
    },
    
    getChannelColor(value) {
      // Generate colors based on intensity
      const intensity = Math.min(1, value / 255);
      if (intensity < 0.3) {
        return `rgb(${intensity * 255 * 3}, 0, 0)`;
      } else if (intensity < 0.6) {
        return `rgb(${intensity * 255 * 1.5}, ${intensity * 255 * 1.5}, 0)`;
      } else {
        return `rgb(0, ${intensity * 255}, 0)`;
      }
    }
  },
  
  beforeUnmount() {
    // Clean up on component destruction
    this.cleanupReceiver();
  }
};
</script>

<style scoped>
.dmx-receiver {
  padding: 12px;
  background-color: #fff;
}

.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.input-group {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.input-group label {
  margin-bottom: 4px;
  font-size: 12px;
  font-weight: bold;
}

.input-group input,
.input-group select {
  padding: 6px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 12px;
}

.connect-btn {
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  background-color: #2196F3;
  color: white;
  cursor: pointer;
  align-self: flex-end;
  margin-top: 18px;
  font-size: 12px;
}

.connect-btn:hover {
  background-color: #1976D2;
}

.connect-btn.connected {
  background-color: #F44336;
}

.connect-btn.connected:hover {
  background-color: #D32F2F;
}

.error-message {
  color: #F44336;
  font-size: 12px;
  margin-bottom: 8px;
}

.dmx-stats {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #eee;
}

.stats-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}

.stat-label {
  font-weight: bold;
}

.stat-value {
  font-family: monospace;
}

.stat-value.connected {
  color: #4CAF50;
  font-weight: bold;
}

.stat-value.disconnected {
  color: #9E9E9E;
}

.stat-value.reconnecting {
  color: #FF9800;
}

.stat-value.error {
  color: #F44336;
}

.channels-preview {
  display: flex;
  height: 60px;
  background-color: #f5f5f5;
  border-radius: 4px;
  overflow: hidden;
}

.channel-meter {
  flex: 1;
  margin: 0 1px;
  background-color: #ccc;
  position: relative;
  bottom: 0;
  transition: height 0.1s ease-out;
}
</style> 