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
      <div class="channels-container">
        <div class="channel-markers">
          <div class="channel-marker" v-for="n in 13" :key="n">{{(n-1)*50 + 1}}</div>
        </div>
        <div class="channels-preview">
          <div 
            v-for="(value, index) in channelValues" 
            :key="index" 
            class="channel-meter"
            :class="{ 'active': value > 50 }"
            :style="{ height: `${(value / 255) * 100}%`, backgroundColor: getChannelColor(value) }"
            :title="`Channel ${index + 1}: ${value}`"
          >
            <span v-if="value > 50" class="channel-number">{{ index + 1 }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import DMXReceiver from '@/plugins/dmx-receiver';
import EventBus from '@/plugins/eventbus';

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
      channelValues: Array(512).fill(0) // Store all 512 channel values for preview
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
        this.channelValues = Array(512).fill(0);
        
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
            EventBus.emit('dmx_connection_state_changed', true);
          });
          
          this.receiver.on('disconnected', () => {
            this.isConnected = false;
            EventBus.emit('dmx_connection_state_changed', false);
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
            // Always update the universe data, even if panel is hidden
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
        
        // Update toolbar button state
        EventBus.emit('dmx_connection_state_changed', false);
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
      
      // Store all 512 channels for preview
      this.channelValues = Array.from(data.slice(0, 512));
    },
    
    getChannelColor(value) {
      // Generate colors based on intensity using app's accent colors
      const intensity = Math.min(1, value / 255);
      
      if (intensity === 0) {
        return 'transparent';
      } else if (intensity < 0.25) {
        return `var(--accent-red)`;
      } else if (intensity < 0.5) {
        return `var(--accent-orange)`;
      } else if (intensity < 0.75) {
        return `var(--accent-gold)`;
      } else {
        return `var(--accent-green)`;
      }
    }
  },
  
  watch: {
    // Watch for changes in connection state to update toolbar
    isConnected(newValue) {
      // Emit event to update toolbar button
      EventBus.emit('dmx_connection_state_changed', newValue);
    }
  },
  
  mounted() {
    // Emit initial connection state to toolbar
    if (this.isConnected) {
      EventBus.emit('dmx_connection_state_changed', true);
    }
  },
  
  // Add keep-alive hook
  activated() {
    // If connection was active before, make sure UI reflects that
    if (this.receiver && this.receiver.isConnected()) {
      this.isConnected = true;
      // Update toolbar button state
      EventBus.emit('dmx_connection_state_changed', true);
    }
  },
  
  beforeUnmount() {
    // Do NOT clean up on component hiding since we're using v-show
    // This ensures connections remain active when panel is hidden
    // this.cleanupReceiver();
  },
  
  beforeDestroy() {
    // Only clean up when component is fully destroyed (app closing)
    this.cleanupReceiver();
  }
};
</script>

<style scoped>
.dmx-receiver {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-height: 250px;
  overflow: auto;
  padding: 12px;
  background-color: var(--primary-dark);
  font-family: Roboto-Regular;
  color: var(--secondary-lighter);
}

.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 12px;
  align-items: flex-end;
}

.input-group {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 200px;
}

.input-group label {
  margin-bottom: 4px;
  font-size: 12px;
  font-weight: bold;
  font-family: Roboto-Medium;
  color: var(--secondary-lighter);
}

.input-group input,
.input-group select {
  padding: 6px;
  border: 1px solid var(--secondary-dark);
  border-radius: 4px;
  font-size: 12px;
  font-family: Roboto-Regular;
  background-color: var(--primary-light);
  color: var(--secondary-lighter);
  height: 28px;
}

.input-group input:focus,
.input-group select:focus {
  border-color: var(--accent-blue);
}

.connect-btn {
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  background-color: var(--accent-blue);
  color: white;
  cursor: pointer;
  font-size: 12px;
  font-family: Roboto-Regular;
  text-transform: uppercase;
  height: 28px;
  min-width: 120px;
  margin-bottom: 0;
}

.connect-btn:hover {
  background-color: var(--accent-light-blue);
}

.connect-btn.connected {
  background-color: var(--accent-red);
}

.connect-btn.connected:hover {
  background-color: var(--accent-maroon);
}

.error-message {
  color: var(--accent-red);
  font-size: 12px;
  margin: 0 12px 8px 12px;
  font-family: Roboto-Medium;
}

.dmx-stats {
  display: flex;
  padding: 4px 12px 12px 12px;
  gap: 16px;
  align-items: stretch;
}

.stats-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}

.stat-label {
  font-weight: bold;
  font-family: Roboto-Bold;
  color: var(--secondary-light-alt);
}

.stat-value {
  font-family: Roboto-Regular;
  color: var(--secondary-lighter);
}

.stat-value.connected {
  color: var(--accent-green);
  font-weight: bold;
}

.stat-value.disconnected {
  color: var(--secondary-light);
}

.stat-value.reconnecting {
  color: var(--accent-gold);
}

.stat-value.error {
  color: var(--accent-red);
}

.channels-container {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 2px;
}

.channel-markers {
  display: flex;
  height: 16px;
  padding: 0;
  margin-bottom: 2px;
  position: relative;
}

.channel-marker {
  position: absolute;
  font-size: 10px;
  font-family: 'Roboto-Regular', sans-serif;
  color: var(--secondary-light);
  transform: translateX(-50%);
}

.channel-marker:nth-child(1) { left: 0%; }
.channel-marker:nth-child(2) { left: 8.33%; }
.channel-marker:nth-child(3) { left: 16.66%; }
.channel-marker:nth-child(4) { left: 25%; }
.channel-marker:nth-child(5) { left: 33.33%; }
.channel-marker:nth-child(6) { left: 41.66%; }
.channel-marker:nth-child(7) { left: 50%; }
.channel-marker:nth-child(8) { left: 58.33%; }
.channel-marker:nth-child(9) { left: 66.66%; }
.channel-marker:nth-child(10) { left: 75%; }
.channel-marker:nth-child(11) { left: 83.33%; }
.channel-marker:nth-child(12) { left: 91.66%; }
.channel-marker:nth-child(13) { left: 100%; transform: translateX(-100%); }

.channels-preview {
  display: flex;
  height: 60px;
  background-color: var(--primary-lighter);
  border-radius: 4px;
  overflow-x: auto;
  overflow-y: hidden;
  border: 1px solid var(--secondary-darker);
  flex: 1;
  scrollbar-width: thin;
  scrollbar-color: var(--secondary-dark) var(--primary-dark);
}

.channels-preview::-webkit-scrollbar {
  height: 8px;
}

.channels-preview::-webkit-scrollbar-track {
  background: var(--primary-dark);
  border-radius: 0 0 4px 4px;
}

.channels-preview::-webkit-scrollbar-thumb {
  background-color: var(--secondary-dark);
  border-radius: 4px;
}

.channel-meter {
  min-width: 8px;
  width: 8px;
  flex: 0 0 auto;
  margin: 0 1px;
  background-color: var(--primary-dark-alt);
  position: relative;
  bottom: 0;
  transition: height 0.1s ease-out;
}

.channel-meter.active {
  min-width: 16px;
  width: 16px;
  z-index: 1;
}

.channel-number {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%) rotate(-90deg);
  transform-origin: center bottom;
  font-size: 9px;
  font-weight: bold;
  color: white;
  text-shadow: 0 0 2px rgba(0, 0, 0, 0.7);
  white-space: nowrap;
  pointer-events: none;
}
</style> 