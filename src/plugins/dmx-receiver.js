// src/plugins/dmx-receiver.js
import { EventEmitter } from 'events';

/**
 * @class DMXReceiver
 * @classdesc Receives DMX data from a WebSocket and applies it to a universe
 * @extends EventEmitter
 */
class DMXReceiver extends EventEmitter {
  /**
   * Creates a new DMX receiver
   * @param {string} url - WebSocket URL to connect to
   * @param {Object} universe - Universe instance to apply DMX data to
   */
  constructor(url, universe) {
    super();
    this._url = url;
    this.universe = universe;
    this.ws = null;
    this.connected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectTimeout = null;
    this.manualDisconnect = false; // Flag to track manual disconnection
  }

  /**
   * Get the WebSocket URL
   * @returns {string} The WebSocket URL
   */
  get url() {
    return this._url;
  }

  /**
   * Set a new WebSocket URL
   * @param {string} url - The new WebSocket URL
   */
  set url(url) {
    if (this.connected) {
      throw new Error('Cannot change URL while connected. Disconnect first.');
    }
    this._url = url;
  }

  /**
   * Update the WebSocket URL
   * @param {string} url - The new WebSocket URL
   * @returns {boolean} True if URL was updated, false if connected (need to disconnect first)
   */
  updateUrl(url) {
    if (this.connected) {
      return false;
    }
    this._url = url;
    return true;
  }

  /**
   * Connect to the WebSocket server
   * @returns {Promise} Resolves when connected, rejects on error
   */
  connect() {
    return new Promise((resolve, reject) => {
      if (this.connected) {
        resolve();
        return;
      }
      
      // Reset manual disconnect flag when attempting to connect
      this.manualDisconnect = false;

      try {
        this.ws = new WebSocket(this._url);
        this.ws.binaryType = 'arraybuffer';
        
        this.ws.onopen = () => {
          this.connected = true;
          this.reconnectAttempts = 0;
          this.emit('connected');
          resolve();
        };
        
        this.ws.onmessage = (event) => {
          // Assuming the message is a DMX buffer (Uint8Array)
          const dmxData = new Uint8Array(event.data);
          if (this.universe) {
            // Apply received dmxData to universe considering fixture offsets
            this.applyDMXDataToUniverse(dmxData);
          }
          this.emit('dmxData', dmxData);
        };
        
        this.ws.onerror = (error) => {
          this.emit('error', error);
          reject(error);
        };
        
        this.ws.onclose = () => {
          this.connected = false;
          this.emit('disconnected');
          
          // Only attempt to reconnect if not manually disconnected
          if (!this.manualDisconnect) {
            this.attemptReconnect();
          }
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Apply DMX data to the universe considering fixture offsets
   * @param {Uint8Array} dmxData - The DMX data received from WebSocket
   * @private
   */
  applyDMXDataToUniverse(dmxData) {
    if (!this.universe || !this.universe._patch) {
      return;
    }
    
    // Use the address map from the universe to properly handle fixture offsets
    const updatedChannels = [];
    
    for (let i = 0; i < dmxData.length && i < 512; i++) {
      const value = dmxData[i];
      const fixtureAddress = this.universe._addressMap[i + 1];

      if (fixtureAddress !== undefined) {
        const fixtureChannel = i - fixtureAddress + 1;
        const fixture = this.universe._patch[fixtureAddress];

        // console.log(fixtureChannel, value);
  
        if (fixture) {
          // console.log(i, fixtureChannel, value);
          fixture.setChannel(fixtureChannel, value);
          // console.log(i, fixtureChannel, value);
          
          // Add to updated channels for tracking purposes
          updatedChannels.push({
            id: i + 1, // DMX channels are 1-indexed
            value: value
          });
        }
      }
    }
    
    // If you need to track which channels were updated
    if (updatedChannels.length > 0) {
      this.emit('channelsUpdated', updatedChannels);
    }
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect() {
    if (this.ws) {
      // Set the manual disconnect flag to prevent auto-reconnection
      this.manualDisconnect = true;
      
      // Clear reconnect timeout if it exists
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }
      
      // Reset reconnect attempts
      this.reconnectAttempts = 0;
      
      // Close the connection
      this.ws.close();
      this.ws = null;
      this.connected = false;
      this.emit('disconnected');
    }
  }

  /**
   * Set the universe to apply DMX data to
   * @param {Object} universe - Universe instance
   */
  setUniverse(universe) {
    this.universe = universe;
  }

  /**
   * Attempt to reconnect to the WebSocket server
   * @private
   */
  attemptReconnect() {
    // Don't attempt to reconnect if manual disconnect was requested
    if (this.manualDisconnect) {
      return;
    }
    
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000);
      
      this.reconnectTimeout = setTimeout(() => {
        // Check again if manual disconnect has been requested
        if (!this.manualDisconnect) {
          this.emit('reconnecting', this.reconnectAttempts);
          this.connect().catch(() => {
            // Error handling is done in the connect method
          });
        }
      }, delay);
    } else {
      this.emit('reconnectFailed');
    }
  }

  /**
   * Check if connected to the WebSocket server
   * @returns {boolean} True if connected
   */
  isConnected() {
    return this.connected;
  }
}

export default DMXReceiver;