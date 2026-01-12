# Robosats WhatsApp Notifier

A Node.js bot that monitors the Robosats order book for new offers every X minutes and sends notifications to a WhatsApp group using whatsapp-web.js.

## Features

- 🔄 Automatic monitoring every X minutes
- 💱 Filters for target currency offers
- 📱 WhatsApp notifications with formatted messages
- 💾 JSON-based offer tracking to avoid duplicates
- 📝 Comprehensive logging system
- 🔐 Persistent WhatsApp authentication
- 🌐 Web UI for configuration and QR code authentication
- 🐳 Docker and Umbrel app support
- 🚀 Easy deployment to Umbrel or any Linux server

## Prerequisites

- Node.js 16.x or higher
- npm or yarn
- WhatsApp account
- Access to a WhatsApp group where you want notifications
- **RoboSats NodeApp running** (recommended - Docker-based)

## Installation

### Option 1: Umbrel App (Recommended)

The easiest way to run this bot is as an Umbrel app with a web interface:

1. Add the community app store to your Umbrel
2. Install "RoboSats WhatsApp Notifier" from the Finance category
3. Access the web UI at port 3000
4. Scan the QR code to authenticate WhatsApp
5. Configure your settings through the web interface

See the [Umbrel deployment guide](#umbrel-app-deployment) below for more details.

### Option 2: Docker

Run using Docker:

```bash
docker build -t robosats-whatsapp-notifier .
docker run -d \
  -p 3000:3000 \
  -v $(pwd)/data:/data \
  -v $(pwd)/.wwebjs_auth:/app/.wwebjs_auth \
  -e WHATSAPP_GROUP_NAME="Your Group Name" \
  -e TARGET_CURRENCIES="USD,EUR" \
  robosats-whatsapp-notifier
```

Access the web UI at `http://localhost:3000` to configure settings and authenticate WhatsApp.

### Option 3: Manual Installation

1. **Clone or download this repository**

```bash
cd robosats-whatsapp-notifier
```

2. **Install dependencies**

```bash
npm install
```

3. **Configure environment variables**

Create a `.env` file in the root directory:

**Option A: Using RoboSats NodeApp (✨ RECOMMENDED - Easiest)**

First, set up the RoboSats NodeApp using Docker:

```bash
git clone https://github.com/RoboSats/robosats.git
cd robosats/nodeapp
docker compose -f docker-compose-example.yml up -d
```

This will expose the RoboSats API on `http://localhost:12596`. The frontend is also available at the same URL.

Then configure your bot:

```env
WHATSAPP_GROUP_NAME=Your Group Name
ROBOSATS_API_URL=http://localhost:12596
ROBOSATS_ONION_URL=http://robosatsy56bwqn56qyadmcxkx767hnabg4mihxlmgyt6if5gnuxvzad.onion
ROBOSATS_COORDINATORS=all
TARGET_CURRENCIES=USD,EUR,GBP
CHECK_INTERVAL_MINUTES=5
LANGUAGE=EN
LOG_LEVEL=info
```

**Required Environment Variables:**
- `WHATSAPP_GROUP_NAME` - Name of your WhatsApp group (case-sensitive)
- `ROBOSATS_API_URL` - RoboSats API base URL
- `ROBOSATS_COORDINATORS` - Coordinators to check ('all' or comma-separated list)
- `ROBOSATS_ONION_URL` - Onion URL for WhatsApp message links
- `TARGET_CURRENCIES` - Currencies to monitor (comma-separated currency codes, e.g., `USD,EUR,GBP`)
- `CHECK_INTERVAL_MINUTES` - How often to check for new offers (in minutes)

**Optional Environment Variables:**
- `LANGUAGE` - Message language: `EN` (English) or `ES` (Spanish) (default: EN)
- `LOG_LEVEL` - Logging level (default: info)
- `ROBOSATS_USE_MOCK` - Use mock data for testing (default: false)

**Supported Currencies:**
The bot automatically maps currency codes to IDs. Supported currencies include:
USD, EUR, GBP, AUD, CAD, JPY, CNY, CHF, SEK, NZD, KRW, TRY, RUB, ZAR, BRL, CLP, CZK, DKK, HKD, HUF, INR, ISK, MXN, MYR, NOK, PHP, PLN, RON, SGD, THB, TWD, ARS, VES, COP, PYG, PEN, UYU, BOB, CRC, GTQ, HNL, NIO, PAB, DOP, SAT

**Note:** `ROBOSATS_ONION_URL` is used for links in WhatsApp messages (for public groups). The bot uses `ROBOSATS_API_URL` for API calls.

Update `WHATSAPP_GROUP_NAME` to match your WhatsApp group name exactly (case-sensitive).

## Usage

### Mock Mode (Testing Without API Access)

If you can't access the Robosats API yet but want to test the WhatsApp integration, use mock mode:

Create `.env` file:
```env
WHATSAPP_GROUP_NAME=Your Group Name
ROBOSATS_USE_MOCK=true
LOG_LEVEL=info
```

Then run:
```bash
npm test   # Test with mock data
npm start  # Run bot with mock data
```

The bot will generate fake offers for testing.

### First Run (WhatsApp Authentication)

On the first run, you'll need to authenticate with WhatsApp:

```bash
npm start
```

A QR code will appear in your terminal. Scan it with your WhatsApp mobile app:
1. Open WhatsApp on your phone
2. Go to Settings → Linked Devices
3. Tap "Link a Device"
4. Scan the QR code

The authentication session will be saved in `.wwebjs_auth/` directory, so you won't need to scan again on subsequent runs.

### Testing

Test the Robosats API connection without starting the full bot:

```bash
npm test
```

This will fetch current offers and display how they would be formatted.

### Development Mode

Run with auto-reload on code changes:

```bash
npm run dev
```

## Project Structure

```
robosats-whatsapp-notifier/
├── src/
│   ├── index.js              # Main entry point & orchestration
│   ├── config.js             # Configuration management (with JSON file support)
│   ├── robosatsClient.js     # Robosats API integration
│   ├── whatsappClient.js     # WhatsApp client (with EventEmitter for QR codes)
│   ├── offerTracker.js       # Track seen offers (JSON storage)
│   ├── messageFormatter.js   # Format offers for WhatsApp
│   ├── logger.js             # Logging utility
│   ├── test.js               # Testing script
│   └── web/                  # Web UI
│       ├── server.js         # Express server with SSE for QR codes
│       └── public/
│           ├── index.html    # Settings page
│           └── style.css     # Styling
├── umbrel/                   # Umbrel app files
│   ├── umbrel-app.yml        # App manifest
│   ├── docker-compose.yml    # Umbrel-specific compose
│   └── exports.sh            # Environment exports
├── umbrel-app-store/         # Community app store structure
│   ├── robosats-whatsapp-notifier/
│   ├── umbrel-app-store.yml
│   └── README.md
├── data/
│   ├── seen_offers.json      # Stored offer IDs (auto-generated)
│   └── config.json           # Settings from web UI (auto-generated)
├── .wwebjs_auth/             # WhatsApp auth session (auto-generated)
├── Dockerfile                # Docker image definition
├── package.json
├── .env                      # Environment variables (optional with web UI)
├── .gitignore
└── README.md
```

## How It Works

1. **Initialization**: Loads previous offer history and initializes WhatsApp client
2. **Periodic Checks**: Every X minutes (configurable), fetches the Robosats order book from all coordinators (or specified ones)
3. **Cleanup**: Removes expired offers from the tracking database (based on each offer's expiration time)
4. **Filtering**: Extracts only active offers for the target currencies
5. **Comparison**: Compares against stored offer IDs to find new ones
6. **Notification**: Formats and sends each new offer as a separate WhatsApp message (one message per offer)
7. **Storage**: Updates the seen offers database with expiration timestamps

**Multi-Coordinator Support**: By default, the bot checks all 8 RoboSats coordinators (bazaar, moon, lake, temple, veneto, freedomsats, whiteyesats, alice) to ensure you don't miss any offers.

**Individual Messages**: Each new offer is sent as a separate WhatsApp message, making it easier to reply, react, or share specific offers. A small delay (1 second) is added between messages when multiple offers are found to avoid rate limiting.

## Web UI

The bot includes a web UI for easy configuration and WhatsApp authentication:

- **Access**: `http://localhost:3000` (or your Umbrel/server IP)
- **Features**:
  - Real-time QR code display for WhatsApp authentication
  - Bot status monitoring (running/waiting for auth/connected)
  - Settings form for all configuration options
  - No restart needed for most settings (container restart may be required)

The web UI uses Server-Sent Events (SSE) to display QR codes in real-time without page refresh.

## Umbrel App Deployment

### Installing from Community App Store

1. **Add Community App Store** (if not already added)
   - Open Umbrel dashboard
   - Go to App Store settings
   - Add the RoboSats community app store

2. **Install the App**
   - Browse to Finance category
   - Find "RoboSats WhatsApp Notifier"
   - Click Install
   - Wait for installation to complete

3. **Initial Setup**
   - Open the app (port 3000)
   - Scan the QR code with WhatsApp mobile app
   - Configure your settings through the web UI
   - Save settings

4. **Requirements**
   - RoboSats app must be installed first (dependency)
   - The bot will automatically connect to RoboSats via internal Docker network

### Files Structure for Umbrel

The `umbrel/` directory contains all files needed for Umbrel deployment:
- `umbrel-app.yml` - App metadata and dependencies
- `docker-compose.yml` - Service definition with volume mounts
- `exports.sh` - Environment exports

The `umbrel-app-store/` directory is ready to be submitted to the Umbrel community app store.

## Manual Deployment to Umbrel

### 1. Transfer Files

From your MacBook:

```bash
rsync -avz robosats-whatsapp-notifier/ umbrel@umbrel.local:~/robosats-bot/
```

### 2. Install on Umbrel

SSH into your Umbrel node:

```bash
ssh umbrel@umbrel.local
cd ~/robosats-bot
npm install --production
```

### 3. First-Time Authentication

Run once interactively to scan QR code:

```bash
npm start
```

After authentication, press `Ctrl+C` to stop.

### 4. Create systemd Service

Create `/etc/systemd/system/robosats-notifier.service`:

```ini
[Unit]
Description=Robosats WhatsApp Notifier
After=network.target

[Service]
Type=simple
User=umbrel
WorkingDirectory=/home/umbrel/robosats-bot
ExecStart=/usr/bin/node src/index.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
sudo systemctl enable robosats-notifier
sudo systemctl start robosats-notifier
sudo systemctl status robosats-notifier
```

### 5. Monitor Logs

```bash
# System logs
journalctl -u robosats-notifier -f

# Application logs
tail -f ~/robosats-bot/app.log
```

## Configuration Options

All configuration is in `src/config.js`:

| Option | Description | Required | Example |
|--------|-------------|----------|---------|
| `WHATSAPP_GROUP_NAME` | WhatsApp group name to send notifications | Yes | Your Group Name |
| `CHECK_INTERVAL_MINUTES` | Check interval in minutes | Yes | 5 |
| `ROBOSATS_API_URL` | Robosats API base URL (NodeApp) | Yes | http://localhost:12596 |
| `ROBOSATS_COORDINATORS` | Coordinators to check: 'all' or comma-separated | Yes | all |
| `ROBOSATS_ONION_URL` | Onion URL for WhatsApp message links | Yes | http://robosatsy56...onion |
| `TARGET_CURRENCIES` | Currencies to monitor (comma-separated codes) | Yes | USD,EUR,GBP |
| `LANGUAGE` | Message language (EN or ES) | No | EN |
| `ROBOSATS_USE_MOCK` | Use mock data for testing | No | false |
| `LOG_LEVEL` | Logging level | No | info |

**Currency Codes:**
Simply use currency codes (e.g., `USD,EUR,GBP`). The bot automatically maps them to RoboSats IDs.

Supported currencies: USD, EUR, GBP, AUD, CAD, JPY, CNY, CHF, SEK, NZD, KRW, TRY, RUB, ZAR, BRL, CLP, CZK, DKK, HKD, HUF, INR, ISK, MXN, MYR, NOK, PHP, PLN, RON, SGD, THB, TWD, ARS, VES, COP, PYG, PEN, UYU, BOB, CRC, GTQ, HNL, NIO, PAB, DOP, SAT

## Message Format

Each new offer is sent as a separate WhatsApp message, formatted with emojis and clear structure. Messages include amount (in fiat and sats), price, payment method, expiration time, and a direct link to the offer.

**English (LANGUAGE=EN) - Example messages:**

Message 1 (Fixed amount):
```
*🟢 BUY Bitcoin - Robosats (Bazaar)*
━━━━━━━━━━━━━━━━━
💰 *Amount:* 200,000 USD (~39,216 sats)
💵 *Price:* 59,134 USD (+2.5%)
🏦 *Payment:* Bank Transfer
⏳ *Expires in:* 2h 30m
🔗 http://robosatsy56bwqn56qyadmcxkx767hnabg4mihxlmgyt6if5gnuxvzad.onion/order/bazaar/12345
━━━━━━━━━━━━━━━━━
```

Message 2 (Amount range):
```
*🔴 SELL Bitcoin - Robosats (Lake)*
━━━━━━━━━━━━━━━━━
💰 *Amount:* 200,000 - 1,000,000 USD (~39,216 - 196,078 sats)
💵 *Price:* 59,460 USD (+3.0%)
🏦 *Payment:* Cash
⏳ *Expires in:* 1h 15m
🔗 http://robosatsy56bwqn56qyadmcxkx767hnabg4mihxlmgyt6if5gnuxvzad.onion/order/lake/72288
━━━━━━━━━━━━━━━━━
```

**Spanish (LANGUAGE=ES) - Example message:**

```
*🟢 COMPRA Bitcoin - Robosats (Bazaar)*
━━━━━━━━━━━━━━━━━
💰 *Monto:* 200.000 USD (~39.216 sats)
💵 *Precio:* 59.134 USD (+2.5%)
🏦 *Pago:* Transferencia
⏳ *Expira en:* 2h 30m
🔗 http://robosatsy56bwqn56qyadmcxkx767hnabg4mihxlmgyt6if5gnuxvzad.onion/order/bazaar/12345
━━━━━━━━━━━━━━━━━
```

**Message Features:**
- **Individual messages**: Each offer is sent as a separate message for better usability
- **Amount display**: Shows both fiat and satoshi amounts (or ranges for flexible offers) with approximate sign (~) for sats
- **Expiration time**: Displays relative time remaining (e.g., "2h 30m", "45m", "5d 3h")
- **Coordinator names**: Friendly display names (e.g., "Bazaar" instead of "bazaar")
- **No link previews**: Onion links are sent without previews since they won't load in WhatsApp

## Understanding the Robosats API

### API Access: NodeApp (Recommended)

The bot uses the **RoboSats NodeApp** for API access, which provides a simple HTTP interface on `localhost:12596`. The NodeApp handles all Tor connections internally, so you don't need to configure Tor in the bot.

**URL**: `http://localhost:12596`

**Advantages:**
- ✅ Simple HTTP connection (no Tor configuration needed)
- ✅ Easy to test and debug
- ✅ Official RoboSats solution
- ✅ Access to all coordinators
- ✅ No additional setup required

**Requirements:**
- Docker Desktop installed and running
- RoboSats NodeApp running

### Setting Up NodeApp

1. **Clone RoboSats repository:**
   ```bash
   git clone https://github.com/RoboSats/robosats.git
   cd robosats/nodeapp
   ```

2. **Start NodeApp with Docker:**
   ```bash
   docker compose -f docker-compose-example.yml up -d
   ```

3. **Verify it's running:**
   ```bash
   docker compose -f docker-compose-example.yml ps
   ```

4. **Test the API:**
   ```bash
   curl http://localhost:12596/mainnet/bazaar/api/info/ | python3 -m json.tool
   ```

### Key API Endpoints Used

1. **`GET /api/info/`**
   - Get exchange information
   - No authentication required
   - Returns: order counts, volume, fees, etc.

2. **`GET /api/book/`**
   - Get public order book
   - Query params: `currency` (ID), `type` (0=BUY, 1=SELL, 2=ALL)
   - Returns: Array of public orders

3. **Order Structure**
   - `id`: Order ID
   - `status`: 1 = Public/Active
   - `type`: 0 = BUY, 1 = SELL
   - `currency`: Integer currency ID
   - `payment_method`: Payment method string
   - `premium`: Premium over market price
   - `amount`: Fiat amount

### API Version Notice

⚠️ **Important**: The Robosats API is currently v0 (beta). This means:

- Endpoints and response structures may change
- Breaking changes are possible
- Monitor your bot logs for errors
- Be prepared to update the code if the API changes

According to Robosats documentation:
> "We recommend that if you don't have time to actively maintain your project, 
> do not build it with v0 of the API. A refactored, simpler and more stable 
> version - v1 will be released soon™."

## Troubleshooting

### QR Code Doesn't Appear

- Check your internet connection
- Ensure WhatsApp Web is not blocked by firewall
- Try deleting `.wwebjs_auth/` and re-authenticating

### "Group not found" Error

- Verify the group name in `.env` matches exactly (case-sensitive)
- Ensure your WhatsApp account is a member of the group
- Check that the group is not archived

### API Connection Issues

1. **Check NodeApp status:**
   ```bash
   docker compose -f docker-compose-example.yml ps
   ```

2. **Test NodeApp manually:**
   ```bash
   curl http://localhost:12596/mainnet/bazaar/api/info/ | python3 -m json.tool
   ```

3. **Check NodeApp logs:**
   ```bash
   docker compose -f docker-compose-example.yml logs -f
   ```

4. **Check bot logs:**
   ```bash
   tail -f app.log
   ```

5. **Common errors:**
   - **ECONNREFUSED or ENOTFOUND**: NodeApp not running
   - **Timeout**: NodeApp may be starting up - wait a moment and retry
   - Verify `ROBOSATS_API_URL` is correct in `.env` (should be `http://localhost:12596` for NodeApp)

### Bot Stops Working

- Check if WhatsApp session expired
- Verify systemd service is running: `systemctl status robosats-notifier`
- Check logs for errors

## Important Notes

- **First run**: Must scan QR code with WhatsApp mobile app
- **Session persistence**: `.wwebjs_auth/` folder stores your session
- **Multi-coordinator**: Bot checks all coordinators by default to catch all offers
- **NodeApp required**: Using RoboSats NodeApp (Docker) is the recommended setup
- **Onion links**: WhatsApp message links use `ROBOSATS_ONION_URL` for public groups (requires Tor Browser to open). Link previews are disabled since onion links won't load in WhatsApp.
- **API version**: Robosats API is v0 (beta) and may change; monitor for errors
- **Rate limiting**: 5-minute interval should be safe from rate limits; 1-second delay between messages prevents WhatsApp rate limiting
- **Individual messages**: Each offer is sent as a separate message for better usability
- **Expiration tracking**: Expired offers are automatically removed from the tracking database (based on each offer's expiration time)
- **Amount ranges**: Supports both fixed amounts and flexible amount ranges (min-max)
- **Group name**: Must match exactly (case-sensitive)
- **Backups**: Consider backing up `.wwebjs_auth/` and `data/` folders

## Security Considerations

- Keep `.env` file secure (it's in `.gitignore`)
- Don't share your `.wwebjs_auth/` directory
- Use secure networks when authenticating WhatsApp
- Regularly update dependencies for security patches

## Future Enhancements

- [ ] Add filters for specific payment methods
- [ ] Add price alerts (notify only if price is within range)
- [ ] Multiple WhatsApp groups support
- [ ] Database instead of JSON for scalability
- [ ] Telegram notifications support

**Already Implemented:**
- ✅ Web UI for configuration
- ✅ Docker container support
- ✅ Umbrel app package
- ✅ Support multiple currencies
- ✅ Amount ranges (min-max) support
- ✅ Individual messages per offer
- ✅ Automatic cleanup of old offers
- ✅ Coordinator name mapping
- ✅ Relative expiration time display
- ✅ QR code authentication via web UI
- ✅ File-based configuration (JSON)

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Resources

- **Robosats Learn**: https://learn.robosats.org
- **API Documentation**: https://learn.robosats.org/docs/api/
- **Currency IDs**: https://github.com/RoboSats/robosats/blob/main/frontend/static/assets/currencies.json
- **NodeApp**: https://github.com/RoboSats/robosats/tree/main/nodeapp

## Support

For issues and questions, please open an issue on the repository.
