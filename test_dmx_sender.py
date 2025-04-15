#!/usr/bin/env python3
import socket
import time
import random
import argparse
from typing import List, Optional
import math

class DMXSender:
    def __init__(self, host: str = "127.0.0.1", port: int = 6454, universe: int = 0):
        """
        Initialize DMX sender
        
        Args:
            host: Target host IP address
            port: Target UDP port
            universe: DMX universe number (0-15)
        """
        self.host = host
        self.port = port
        self.universe = universe
        self.socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        
    def send_dmx(self, data: List[int]) -> None:
        """
        Send DMX data
        
        Args:
            data: List of DMX values (0-255) for channels 1-512
        """
        # Ensure data is the right length
        if len(data) > 512:
            data = data[:512]
        elif len(data) < 512:
            data.extend([0] * (512 - len(data)))
            
        # Create Art-Net packet
        # Art-Net header
        packet = bytearray()
        packet.extend(b"Art-Net\x00")  # ID
        packet.extend(b"\x00\x50")     # OpCode (ArtDMX)
        packet.extend(b"\x00\x0e")     # Protocol version
        packet.extend(b"\x00")         # Sequence (ignored)
        packet.extend(b"\x00")         # Physical
        packet.extend(bytes([self.universe]))  # Universe
        packet.extend(b"\x02\x00")     # Length (512 channels)
        
        # Add DMX data
        packet.extend(bytes(data))
        
        # Send packet
        self.socket.sendto(packet, (self.host, self.port))
        
    def close(self) -> None:
        """Close the socket"""
        self.socket.close()

def main():
    parser = argparse.ArgumentParser(description="DMX Test Sender")
    parser.add_argument("--host", default="127.0.0.1", help="Target host IP address")
    parser.add_argument("--port", type=int, default=6454, help="Target UDP port")
    parser.add_argument("--universe", type=int, default=0, help="DMX universe number (0-15)")
    parser.add_argument("--channels", type=int, default=512, help="Number of channels to send (1-512)")
    parser.add_argument("--fps", type=float, default=30.0, help="Frames per second")
    parser.add_argument("--pattern", choices=["random", "chase", "sin", "static"], default="random",
                       help="Test pattern to send")
    args = parser.parse_args()
    
    sender = DMXSender(args.host, args.port, args.universe)
    
    try:
        print(f"Sending DMX data to {args.host}:{args.port} (Universe {args.universe})")
        print(f"Pattern: {args.pattern} at {args.fps} FPS")
        print("Press Ctrl+C to stop")
        
        frame_time = 1.0 / args.fps
        channels = min(args.channels, 512)
        
        if args.pattern == "static":
            # Static pattern: channels 1-10 at 50%, rest at 0%
            data = [128] * 10 + [0] * (channels - 10)
            while True:
                sender.send_dmx(data)
                time.sleep(frame_time)
                
        elif args.pattern == "random":
            # Random pattern: all channels random
            while True:
                data = [random.randint(0, 255) for _ in range(channels)]
                sender.send_dmx(data)
                time.sleep(frame_time)
                
        elif args.pattern == "chase":
            # Chase pattern: single channel moving through all channels
            pos = 0
            while True:
                data = [0] * channels
                data[pos] = 255
                sender.send_dmx(data)
                pos = (pos + 1) % channels
                time.sleep(frame_time)
                
        elif args.pattern == "sin":
            # Sine wave pattern: smooth sine wave through all channels
            t = 0
            while True:
                data = []
                for i in range(channels):
                    value = int(127.5 * (1 + math.sin(t + i * 0.1)))
                    data.append(value)
                sender.send_dmx(data)
                t += 0.1
                time.sleep(frame_time)
                
    except KeyboardInterrupt:
        print("\nStopping...")
    finally:
        sender.close()

if __name__ == "__main__":
    main() 