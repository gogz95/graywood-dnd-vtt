# Local Area Network (LAN) Setup & Troubleshooting Guide

This guide outlines the networking configuration required to host local multiplayer tabletop sessions using the embedded Axum server (`port 8080`).

Because the VTT operates as an offline-first desktop application, no external servers, port forwarding, or internet access are required. Players connect directly to the Dungeon Master's host machine across the local Wi-Fi or Ethernet network.

---

## 1. Determining the Host's Local IPv4 Address

Before players can connect, the host must determine their machine's local IPv4 address within the local network (typically structured as `192.168.x.x` or `10.0.x.x`).

### Windows (PowerShell / Command Prompt)
1. Open PowerShell or Command Prompt.
2. Run the following command:
   ```powershell
   Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "Wi-Fi*", "Ethernet*" | Select-Object InterfaceAlias, IPAddress
   ```
   Or use the legacy network utility:
   ```cmd
   ipconfig
   ```
3. Locate the active network adapter (`Wireless LAN adapter Wi-Fi` or `Ethernet adapter`).
4. Note the **IPv4 Address** (e.g., `192.168.1.145`).

### macOS (Terminal)
1. Open the Terminal application.
2. If connected via Wi-Fi:
   ```bash
   ipconfig getifaddr en0
   ```
3. If connected via Ethernet or a USB-C adapter:
   ```bash
   ipconfig getifaddr en1
   ```
4. Alternatively, view all active network interfaces:
   ```bash
   ifconfig | grep "inet " | grep -v 127.0.0.1
   ```
5. Note the returned IPv4 address.

### Linux (Terminal)
1. Open your terminal emulator.
2. Run the `ip` utility:
   ```bash
   ip -br -4 addr show
   ```
   Or:
   ```bash
   hostname -I | awk '{print $1}'
   ```
3. Locate the interface associated with your primary connection (`wlan0`, `wlp2s0`, or `eth0`).
4. Note the IPv4 address.

---

## 2. Configuring Host Firewall Exceptions for Port 8080

The embedded Axum server listens on `0.0.0.0:8080`. The host operating system's firewall must be configured to permit inbound TCP connections on port `8080`.

### 2.1 Windows Defender Firewall

#### Option A: Automated PowerShell Rule (Run as Administrator)
Open PowerShell as an Administrator and execute:
```powershell
New-NetFirewallRule -DisplayName "D&D VTT LAN Server (TCP 8080)" `
                    -Direction Inbound `
                    -Protocol TCP `
                    -LocalPort 8080 `
                    -Action Allow `
                    -Profile Private
```

#### Option B: Windows GUI Configuration
1. Press `Win + R`, type `wf.msc`, and press **Enter** to open Windows Defender Firewall with Advanced Security.
2. Click **Inbound Rules** in the left sidebar, then click **New Rule...** in the right actions pane.
3. Select **Port** and click **Next**.
4. Choose **TCP** and enter `8080` under **Specific local ports**, then click **Next**.
5. Select **Allow the connection** and click **Next**.
6. Check **Private** (recommended; do not expose on Public networks) and click **Next**.
7. Name the rule `D&D VTT LAN Server (Port 8080)` and click **Finish**.

### 2.2 macOS Application Firewall

1. Open **System Settings** > **Network** > **Firewall**.
2. If the firewall is turned on, click **Options...**.
3. Locate the compiled VTT application in the list and ensure it is set to **Allow incoming connections**.
4. If configuring via Terminal using `pf` (Packet Filter):
   ```bash
   sudo pfctl -ef /etc/pf.conf
   ```
   Ensure loopback and local subnet packets destined for port `8080` are permitted in `/etc/pf.anchors/vtt.rules`:
   ```
   pass in proto tcp from 192.168.0.0/16 to any port 8080
   pass in proto tcp from 10.0.0.0/8 to any port 8080
   ```

### 2.3 Linux (UFW & Iptables)

#### Using Uncomplicated Firewall (UFW)
```bash
sudo ufw allow in on wlan0 to any port 8080 proto tcp comment 'D&D VTT Web Server'
sudo ufw reload
sudo ufw status
```

#### Using `firewalld` (Fedora / RHEL)
```bash
sudo firewall-cmd --zone=home --add-port=8080/tcp --permanent
sudo firewall-cmd --reload
```

---

## 3. Mobile & Tablet Client Connection Guide

Players connect to the session using any modern mobile, tablet, or laptop web browser (Chrome, Safari, Firefox, or Edge).

```
   ┌─────────────────────────────────────────────────────────────┐
   │                                                             │
   │               D&D 5e/5.5e VTT Mobile Roster                 │
   │                                                             │
   │   Select Your Character:                                    │
   │   ┌─────────────────────────────────────────────────────┐   │
   │   │  Kaelen Emberfall       Level 5 Wizard    [ CLAIM ] │   │
   │   │  Lyra Moonshadow        Level 5 Rogue     [ CLAIM ] │   │
   │   │  Boran Ironfist         Level 5 Paladin   [ CLAIM ] │   │
   │   └─────────────────────────────────────────────────────┘   │
   │                                                             │
   │   Enter 4-Digit Security PIN:                               │
   │   ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐                   │
   │   │   1   │ │   3   │ │   5   │ │   7   │                   │
   │   └───────┘ └───────┘ └───────┘ └───────┘                   │
   │                                                             │
   │   [ Connect to Tactical Session ]                           │
   │                                                             │
   └─────────────────────────────────────────────────────────────┘
```

### 3.1 Step-by-Step Connection Instructions

1. **Verify Wi-Fi Connection**:
   - Ensure the player's device is connected to the exact same Wi-Fi network or mobile hotspot as the host laptop.
2. **Open Web Browser**:
   - Navigate to `http://<HOST_IP>:8080` (e.g., `http://192.168.1.145:8080`).
   - *Note*: Use `http://`, not `https://`, as local IP addresses operate over raw HTTP on trusted private networks.
3. **Select Character**:
   - The player roster displays all available party characters stored in the host's campaign database.
4. **Enter 4-Digit Security PIN**:
   - Enter the character's designated 4-digit PIN (assigned by the DM during character creation).
   - Click **Claim Character**.
5. **Real-Time Interactive Sheet**:
   - The browser will establish an authenticated WebSocket channel (`/ws`), synchronizing hit point adjustments, spell slot expenditures, initiative rolls, and active conditions directly with the DM's workstation.

---

## 4. Troubleshooting Network & Connection Issues

| Symptom | Probable Cause | Diagnostic Command / Resolution |
| :--- | :--- | :--- |
| **"Connection Refused" / Cannot Open Page** | Host server not running or wrong IP address entered. | Verify the desktop workstation shows "Server listening on 0.0.0.0:8080". Double-check host IPv4 address. |
| **Page Loads, but WebSocket says "Disconnected"** | Port 8080 WebSocket handshake blocked by antivirus or proxy. | Ensure the URL begins with `http://` and not `https://`. Check browser console (`F12`) for WebSocket upgrade errors. |
| **Players on Wi-Fi Cannot Ping Host** | Access Point (AP) Client Isolation enabled on router. | Log in to router administration. Disable "AP Isolation", "Client Isolation", or "Guest Network Isolation" on the Wi-Fi band. |
| **Host Has Multiple IP Addresses** | Virtual adapters (VirtualBox, Docker, WSL, Hyper-V, VPN). | Make sure players use the IP of the physical adapter (`Wi-Fi` / `Ethernet`), not the `vEthernet` or `172.x.x.x` virtual adapter. |
| **Connection Drops Mid-Session** | Host laptop entered sleep mode or changed DHCP lease. | Disable system sleep in host OS power settings while running a session. Reserve a static DHCP IP in your router for the host. |

---

### Detailed Resolution: Resolving Wi-Fi Client Isolation
Many residential or hotel routers feature "AP Client Isolation" or "Guest Mode" enabled by default:
- **How it works**: Prevents wireless devices connected to the same router from communicating with one another.
- **The fix**:
  1. Access your router gateway (typically `http://192.168.1.1` or `http://192.168.0.1`).
  2. Navigate to **Wireless Settings** > **Advanced Wireless**.
  3. Locate the setting named **AP Isolation**, **Station Isolation**, or **Client Isolation**.
  4. Toggle this setting to **Disabled** and click **Apply**.
- **Alternative (Offline Travel Hotspot)**:
  - If playing in a location where the router settings cannot be changed (e.g., hotel, convention hall, or game store), activate a **Mobile Hotspot** from the host laptop or a smartphone. Connect all players and the host laptop to that personal hotspot. No cellular data is consumed by the VTT.

---

### Detailed Resolution: Managing Multiple Network Adapters (VPNs & WSL)
If the DM's computer has active VPNs (Tailscale, NordVPN, WireGuard) or virtualization network adapters (Docker, WSL2):
1. **Identify the Physical Adapter**: In PowerShell, run:
   ```powershell
   Get-NetAdapter | Where-Object { $_.Status -eq "Up" -and $_.Virtual -ne $True }
   ```
2. **Inspect the Physical IP**: Note the IP bound strictly to the physical Wi-Fi or Ethernet card.
3. **Provide That IP to Players**: Do NOT give players the VPN IP (e.g., `100.x.x.x`) or the WSL internal IP (e.g., `172.x.x.x`). Always provide the local subnet address (`192.168.x.x`).
