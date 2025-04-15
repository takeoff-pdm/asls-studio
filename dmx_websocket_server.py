#!/usr/bin/env python3
import asyncio
import websockets
import argparse
import time
import random
import math
import numpy as np

class DMXWebSocketServer:
    def __init__(self, host="localhost", port=8080, universe=0, fps=30):
        """
        Initialize WebSocket DMX server
        
        Args:
            host: Host to bind the server to
            port: Port to listen on
            universe: DMX universe number
            fps: Frames per second for test patterns
        """
        self.host = host
        self.port = port
        self.universe = universe
        self.fps = fps
        self.frame_time = 1.0 / fps
        self.connected_clients = set()
        self.running = False
        self.pattern_generator = None
        self.current_pattern = "static"
        
    async def handler(self, websocket):
        """Handle WebSocket connections"""
        print(f"Client connected: {websocket.remote_address}")
        self.connected_clients.add(websocket)
        
        try:
            # Keep the connection open
            await websocket.wait_closed()
        finally:
            self.connected_clients.remove(websocket)
            print(f"Client disconnected: {websocket.remote_address}")
    
    async def broadcast_dmx(self):
        """Broadcast DMX data to all connected clients"""
        while self.running:
            start_time = time.time()
            
            # Generate DMX data
            dmx_data = self.pattern_generator()
            
            # Send to all connected clients
            if self.connected_clients:
                websockets_tasks = []
                for websocket in self.connected_clients:
                    websockets_tasks.append(asyncio.create_task(
                        websocket.send(dmx_data.tobytes())
                    ))
                
                if websockets_tasks:
                    await asyncio.gather(*websockets_tasks, return_exceptions=True)
            
            # Sleep to maintain fps
            elapsed = time.time() - start_time
            sleep_time = max(0, self.frame_time - elapsed)
            await asyncio.sleep(sleep_time)
    
    def set_pattern(self, pattern):
        """Set the DMX test pattern generator"""
        self.current_pattern = pattern
        
        if pattern == "static":
            # Static pattern: channels 1-10 at 50%, rest at 0%
            def generator():
                data = np.zeros(512, dtype=np.uint8)
                data[0:10] = 128
                return data
        
        elif pattern == "random":
            # Random pattern: all channels random
            def generator():
                return np.random.randint(0, 256, 512, dtype=np.uint8)
        
        elif pattern == "chase":
            pos = 0
            def generator():
                nonlocal pos
                data = np.zeros(512, dtype=np.uint8)
                data[pos] = 255
                pos = (pos + 1) % 512
                return data
        
        elif pattern == "sin":
            t = 0
            def generator():
                nonlocal t
                indices = np.arange(512)
                values = np.sin(t + indices * 0.1)
                data = ((values + 1) * 127.5).astype(np.uint8)
                t += 0.1
                return data
        
        else:
            # Default to static if pattern not recognized
            def generator():
                data = np.zeros(512, dtype=np.uint8)
                data[0:10] = 128
                return data
        
        self.pattern_generator = generator
    
    async def start(self):
        """Start the WebSocket server"""
        # Set default pattern if none is set
        if self.pattern_generator is None:
            self.set_pattern(self.current_pattern)
        
        self.running = True
        
        # Start the DMX broadcast task
        broadcast_task = asyncio.create_task(self.broadcast_dmx())
        
        # Start WebSocket server
        async with websockets.serve(self.handler, self.host, self.port):
            print(f"DMX WebSocket server running at ws://{self.host}:{self.port}")
            print(f"Pattern: {self.current_pattern} at {self.fps} FPS")
            print("Press Ctrl+C to stop")
            
            try:
                # Run forever
                await asyncio.Future()
            finally:
                self.running = False
                await broadcast_task

async def main():
    # Parse command line arguments
    parser = argparse.ArgumentParser(description="DMX WebSocket Server")
    parser.add_argument("--host", default="localhost", help="Host to bind to")
    parser.add_argument("--port", type=int, default=8080, help="Port to listen on")
    parser.add_argument("--universe", type=int, default=0, help="DMX universe number")
    parser.add_argument("--fps", type=float, default=30.0, help="Frames per second")
    parser.add_argument("--pattern", choices=["random", "chase", "sin", "static"], 
                        default="sin", help="Test pattern to send")
    args = parser.parse_args()
    
    server = DMXWebSocketServer(args.host, args.port, args.universe, args.fps)
    server.set_pattern(args.pattern)
    
    try:
        await server.start()
    except KeyboardInterrupt:
        print("\nShutting down...")

if __name__ == "__main__":
    asyncio.run(main())
