# LnkJump 🔗

**LnkJump** is a powerful Chrome extension that automatically resolves short links and provides instant previews of their destinations. Say goodbye to uncertainty when clicking on shortened URLs!

## ✨ Features

- **🔄 Auto-Redirect**: Automatically redirects short links to their final destinations
- **👁️ Hover Preview**: Shows the real URL when hovering over short links
- **📋 Context Menu**: Right-click to copy real URLs without following them
- **🔧 Customizable**: Toggle features on/off according to your preferences
- **🛡️ Safe Browsing**: See where links lead before clicking

## 🌐 Supported Short Link Services

LnkJump supports a wide variety of URL shortening services:

- **tr.ee** & **linktr.ee** (Linktree)
- **bit.ly** & **t.co** (Twitter/X links)
- **tinyurl.com** & **goo.gl**
- **lnkd.in** (LinkedIn)
- **youtu.be** (YouTube)
- **is.gd**, **t.ly**, **cutt.ly**
- **ow.ly**, **buff.ly**, **shorturl.at**
- **rebrand.ly**, **shrtco.de**, **rb.gy**
- **s.id**, **v.gd**, **u.to**, **soo.gd**
- **adf.ly**, **bc.vc**, **t2mio.com**, **bl.ink**
- **ouo.io**, **x.com**
- And many more!

## 🚀 Installation

### From Chrome Web Store (Recommended)
1. Visit the Chrome Web Store (link coming soon)
2. Click "Add to Chrome"
3. Click "Add extension" in the popup

### Manual Installation (Developer Mode)
1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the LnkJump folder
5. The extension should now appear in your browser toolbar

## 🎯 How to Use

### Auto-Redirect
- When enabled, LnkJump automatically redirects you to the final destination of short links
- No action required - just browse normally!

### Hover Preview
- Hover your mouse over any short link
- A popup will appear showing the real destination URL
- Click the popup to copy the URL to your clipboard

### Context Menu
- Right-click on any short link
- Select "Copy real URL" to get the destination without following the link
- Perfect for sharing the actual URL with others

### Settings
- Click the LnkJump icon in your browser toolbar
- Toggle features on/off:
  - **Auto-Redirect**: Automatically follow short links
  - **Hover Popup**: Show destination on hover
- Settings are automatically saved

## 🛠️ Technical Details

- **Manifest Version**: 3 (latest Chrome extension standard)
- **Permissions**: 
  - `storage` - Save your preferences
  - `tabs` - Access to tab information
  - `webNavigation` - Detect navigation events
  - `contextMenus` - Add right-click menu options
  - `clipboardWrite` - Copy URLs to clipboard
  - `notifications` - Show helpful notifications
- **Host Permissions**: `<all_urls>` - Required to resolve short links

## 🔧 Development

### Project Structure
```
LnkJump/
├── manifest.json      # Extension configuration
├── background.js      # Service worker (main logic)
├── content.js        # Content script (hover popups)
├── popup.html        # Extension popup interface
├── popup.js          # Popup functionality
├── icons/            # Extension icons
│   ├── 16.png
│   ├── 32.png
│   └── 128.png
├── README.md         # This file
└── LICENSE           # MIT License
```

### Building from Source
1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/LnkJump.git
   cd LnkJump
   ```

2. Load the extension in Chrome:
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the project folder

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

1. **Report Bugs**: Open an issue with details about the problem
2. **Request Features**: Suggest new short link services or features
3. **Submit Pull Requests**: 
   - Fork the repository
   - Create a feature branch
   - Make your changes
   - Submit a pull request

### Adding New Short Link Services
To add support for a new short link service, edit the `shortHosts` array in both `background.js` and `content.js`.

## 📝 Privacy Policy

LnkJump respects your privacy:
- **No Data Collection**: We don't collect or store any personal data
- **Local Storage Only**: Settings are stored locally on your device
- **No Analytics**: No tracking or analytics are performed
- **Open Source**: All code is publicly available for review

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

If you encounter any issues or have questions:

1. Check the [Issues](https://github.com/yourusername/LnkJump/issues) page
2. Create a new issue with:
   - Chrome version
   - Extension version
   - Steps to reproduce the problem
   - Expected vs actual behavior

## 🌟 Acknowledgments

- Thanks to all the URL shortening services for providing APIs
- Inspired by the need for safer, more transparent web browsing
- Built with modern Chrome Extension Manifest V3

---

**Made with ❤️ for safer web browsing**

*LnkJump - Jump over short links to see what's really there!*
