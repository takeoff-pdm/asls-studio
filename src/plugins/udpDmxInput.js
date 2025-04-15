import {
  EventEmitter,
} from 'events';
import Live from '@/models/DMX/live.model';

/**
 * @class UDPDMXInput
 * @extends {EventEmitter}
 * @classdesc Client for receiving DMX data via UDP
 */
class UDPDMXInput extends EventEmitter {
  /**
   * Creates an instance of UDPDMXInput.
   * 
   * @param {Number} port UDP port to listen on
   * @param {Object} universe Universe instance to update with received DMX data
   * @param {String} name Name for this input
   */
  constructor(port, universe, name) {
    super();
    this.id = null;
    this.port = port;
    this.universe = universe;
    this.name = name;
    this.isRunning = false;
    this.socket = null;
    this.worker = null;
    this.debug = [];
    this.workerInitialized = false;
  }

  /**
   * Logs debug information
   * 
   * @param {String} message Debug message
   * @param {Number} type Log type (info, error, success)
   */
  pushToDebug(message, type = 0) {
    this.debug.push({ 
      data: message, 
      type, 
      timestamp: new Date().toLocaleTimeString() 
    });
    if (this.debug.length > 100) this.debug.shift();
  }

  /**
   * Initializes Web Worker to handle UDP communication
   * since browsers don't have direct UDP access
   * 
   * @private
   */
  initWorker() {
    if (this.workerInitialized) return;

    // Create worker code as blob
    const workerCode = `
      let socket = null;
      let isConnected = false;

      // Mock implementation - in a real application, this would be
      // implemented using a server-side proxy or native application bridge
      self.onmessage = function(e) {
        const { type, data } = e.data;
        
        switch(type) {
          case 'init':
            // In a real implementation, this would open UDP socket
            const { port } = data;
            isConnected = true;
            self.postMessage({ type: 'status', connected: true, message: 'UDP listener started on port ' + port });
            
            // Simulate receiving DMX data (for testing purposes only)
            // In a real implementation, this would be actual UDP packets
            setInterval(() => {
              if (isConnected) {
                // Create mock DMX data for testing (single universe)
                const mockDmxData = new Uint8Array(512);
                // Add some changing values for channels 1-10
                for (let i = 0; i < 10; i++) {
                  mockDmxData[i] = (Math.sin(Date.now()/1000 + i) * 127 + 128) | 0;
                }
                self.postMessage({ 
                  type: 'dmxData', 
                  data: mockDmxData.buffer 
                }, [mockDmxData.buffer]);
              }
            }, 33); // ~30fps
            break;
            
          case 'stop':
            isConnected = false;
            self.postMessage({ type: 'status', connected: false, message: 'UDP listener stopped' });
            break;
        }
      };
    `;

    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    this.worker = new Worker(workerUrl);
    
    this.worker.onmessage = (e) => {
      const { type, data, connected, message } = e.data;
      
      switch(type) {
        case 'status':
          this.isRunning = connected;
          this.pushToDebug(message, connected ? 1 : -1);
          if (connected) {
            this.emit('open');
          } else {
            this.emit('close');
          }
          break;
          
        case 'dmxData':
          // Process received DMX data
          if (this.universe && this.isRunning) {
            const dmxData = new Uint8Array(data);
            this.universe.DMX512Data = dmxData;
            this.emit('universeData', dmxData);
          }
          break;
      }
    };
    
    this.workerInitialized = true;
  }

  /**
   * Starts the UDP listener
   */
  connect() {
    if (this.isRunning) {
      this.stop();
    }
    
    this.pushToDebug(`Starting UDP DMX listener on port ${this.port}...`);
    
    this.initWorker();
    this.worker.postMessage({ 
      type: 'init', 
      data: { port: this.port } 
    });
  }

  /**
   * Stops the UDP listener
   */
  stop() {
    if (!this.isRunning || !this.worker) return;
    
    this.pushToDebug('Stopping UDP DMX listener...');
    this.worker.postMessage({ type: 'stop' });
    this.isRunning = false;
  }

  /**
   * Cleans up resources when connection is closed
   */
  handleClosure() {
    this.stop();
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.workerInitialized = false;
    }
    this.emit('close');
  }
}

export default UDPDMXInput; 