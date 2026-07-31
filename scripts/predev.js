/**
 * Prints the machine's LAN IP address(es) before the dev server starts.
 * Useful for testing on physical devices connected to the same network.
 */
const { networkInterfaces } = require("os");

const nets = networkInterfaces();
const ips = [];

for (const name of Object.keys(nets)) {
  for (const net of nets[name]) {
    // Skip internal (loopback) and non-IPv4 addresses
    if (net.family === "IPv4" && !net.internal) {
      ips.push(net.address);
    }
  }
}

console.log("");
console.log("  ┌─────────────────────────────────────────────────────┐");
console.log("  │           Church Member App — Backend               │");
console.log("  ├─────────────────────────────────────────────────────┤");
console.log(`  │  Local:            http://localhost:3000             │`);
if (ips.length > 0) {
  ips.forEach((ip) => {
    console.log(`  │  LAN:              http://${ip}:3000               │`);
  });
} else {
  console.log("  │  LAN:             (not connected to any network)   │");
}
console.log("  └─────────────────────────────────────────────────────┘");
console.log("");
