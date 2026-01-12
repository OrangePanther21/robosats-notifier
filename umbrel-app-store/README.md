# RoboSats WhatsApp Notifier - Umbrel Community App Store

This repository contains the Umbrel Community App Store package for RoboSats WhatsApp Notifier.

## Installation

To install this app on your Umbrel:

1. Add this community app store to your Umbrel
2. Navigate to the App Store
3. Find "RoboSats WhatsApp Notifier" in the Finance category
4. Click Install

## Prerequisites

- RoboSats app must be installed on your Umbrel
- WhatsApp account for notifications

## Configuration

After installation:

1. Access the web UI at `http://umbrel.local:PORT` (port will be assigned by Umbrel)
2. Scan the QR code with your WhatsApp mobile app
3. Configure your settings:
   - WhatsApp group name
   - Target currencies (e.g., USD, EUR, GBP)
   - Check interval
   - RoboSats coordinators
4. Save settings and restart the container

## Features

- Real-time monitoring of RoboSats offers
- WhatsApp notifications for new matching offers
- Web-based configuration interface
- QR code authentication for WhatsApp
- Support for multiple currencies and coordinators
- Customizable check intervals

## How it Works

The notifier monitors the RoboSats order book across multiple coordinators and sends WhatsApp messages to your specified group when new offers match your criteria.

1. The app checks RoboSats API at regular intervals
2. New offers are filtered by your target currencies
3. Matching offers are formatted and sent to your WhatsApp group
4. Seen offers are tracked to avoid duplicates

## Data Persistence

The following data is persisted across container restarts:

- `/data/config.json` - Your configuration settings
- `/data/seen_offers.json` - Tracking of previously notified offers
- `/.wwebjs_auth` - WhatsApp authentication session

## Support

For issues, feature requests, or contributions:
- GitHub: https://github.com/robosats/robosats-whatsapp-notifier
- Issues: https://github.com/robosats/robosats-whatsapp-notifier/issues

## Security

- All configuration is stored locally on your Umbrel
- WhatsApp authentication is handled by whatsapp-web.js
- No data is sent to external servers except WhatsApp and RoboSats APIs

## License

MIT License - See LICENSE file for details
