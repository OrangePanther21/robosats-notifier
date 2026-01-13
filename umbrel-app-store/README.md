# RoboSats Notifier - Umbrel Community App Store

This repository contains the Umbrel Community App Store package for RoboSats Notifier.

## Installation

To install this app on your Umbrel:

1. Add this community app store to your Umbrel
2. Navigate to the App Store
3. Find "RoboSats Notifier" in the Finance category
4. Click Install

## Prerequisites

- RoboSats app must be installed on your Umbrel
- Messaging account for notifications (WhatsApp currently supported)

## Configuration

After installation:

1. Access the web UI at `http://umbrel.local:PORT` (port will be assigned by Umbrel)
2. Scan the QR code to authenticate
3. Configure your settings:
   - Notification settings (group/contact)
   - Target currencies (e.g., USD, EUR, GBP)
   - Check interval
   - RoboSats coordinators
4. Save settings and restart the container

## Features

- Real-time monitoring of RoboSats offers
- Instant notifications for new matching offers (WhatsApp supported)
- Web-based configuration interface
- QR code authentication
- Support for multiple currencies and coordinators
- Customizable check intervals

## How it Works

The notifier monitors the RoboSats order book across multiple coordinators and sends messages to your specified destination when new offers match your criteria.

1. The app checks RoboSats API at regular intervals
2. New offers are filtered by your target currencies
3. Matching offers are formatted and sent as notifications
4. Seen offers are tracked to avoid duplicates

## Data Persistence

The following data is persisted across container restarts:

- `/data/config.json` - Your configuration settings
- `/data/seen_offers.json` - Tracking of previously notified offers
- `/.wwebjs_auth` - Authentication session

## Support

For issues, feature requests, or contributions:
- GitHub: https://github.com/OrangePanther21/robosats-notifier
- Issues: https://github.com/OrangePanther21/robosats-notifier/issues

## Security

- All configuration is stored locally on your Umbrel
- Authentication is handled securely
- No data is sent to external servers except messaging service and RoboSats APIs

## License

MIT License - See LICENSE file for details
