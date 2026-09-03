# Tanu-xai WhatsApp Bot Integration Guide

This guide illustrates how to integrate **hax-media-downloader** with the **Tanu-xai** WhatsApp Bot (Baileys / venom-bot / whatsapp-web.js).

---

## Architecture Flow

```
User on WhatsApp
      │ (sends: ".download https://www.instagram.com/reel/xyz/")
      ▼
Tanu-xai Bot Engine
      │
      ├─► 1. POST http://hax-media-downloader:3000/api/download
      │      Headers: { "x-api-key": "tanu-bot-client" }
      │      Body: { "url": "...", "quality": "720p" }
      │
      ◄─ Responds with Normalized JSON
      │  { "url": "https://cdn.xyz/stream.mp4", "title": "...", "duration": 45 }
      │
      └─► 2. Bot downloads stream into buffer / streams to WhatsApp user
            sock.sendMessage(chatId, { video: { url: result.url }, caption: result.title })
```

---

## Sample Integration Code (Baileys / TypeScript)

```typescript
import makeWASocket, { proto } from '@whiskeysockets/baileys';
import axios from 'axios';

const DOWNLOADER_API_URL = process.env.DOWNLOADER_API_URL || 'http://localhost:3000/api';
const BOT_API_KEY = process.env.DOWNLOADER_API_KEY || 'tanu-xai-key';

export async function handleMediaCommand(sock: any, msg: proto.IWebMessageInfo, text: string) {
  const chatId = msg.key.remoteJid;
  const match = text.match(/(https?:\/\/[^\s]+)/i);

  if (!match) {
    await sock.sendMessage(chatId, { text: '❌ Please provide a valid media URL from YouTube, Instagram, TikTok, Facebook, or Pinterest.' });
    return;
  }

  const mediaUrl = match[0];
  await sock.sendMessage(chatId, { text: '⏳ Tanu-xai is processing your media link...' });

  try {
    const response = await axios.post(
      `${DOWNLOADER_API_URL}/download`,
      {
        url: mediaUrl,
        type: text.includes('.mp3') || text.includes('.audio') ? 'audio' : 'video',
        quality: '720p',
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': BOT_API_KEY,
        },
        timeout: 45000,
      }
    );

    const data = response.data;
    if (!data.success || !data.url) {
      throw new Error('Downloader API returned empty media stream');
    }

    const caption = `*Tanu-xai Media Downloader*\n\n` +
      `📌 *Title:* ${data.title}\n` +
      `🌐 *Platform:* ${data.platform.toUpperCase()}\n` +
      `⚙️ *Provider:* ${data.provider}\n` +
      `⏱️ *Duration:* ${data.duration}s\n\n` +
      `_Powered by hax-media-downloader (Author: Hamza)_`;

    if (data.format === 'mp3' || text.includes('.audio')) {
      await sock.sendMessage(chatId, {
        audio: { url: data.url },
        mimetype: 'audio/mp4',
        fileName: `${data.title}.mp3`,
      });
    } else {
      await sock.sendMessage(chatId, {
        video: { url: data.url },
        caption,
      });
    }
  } catch (err: any) {
    const errMsg = err.response?.data?.error || err.message;
    await sock.sendMessage(chatId, { text: `❌ Download failed: ${errMsg}` });
  }
}
```
